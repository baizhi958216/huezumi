import type { ConnectionSummary, ModelOption, PlatformSettings } from '#shared/types/platform'
import { isSupportedImageModel } from '#shared/types/image-generation'
import { isImagePrice } from '#shared/utils/image-pricing'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { auditLogs, connectionVersions, generations, platformConnections, platformSettings, pricingRules, runs, textPrices } from '../../database/schema'
import { getCapability } from '../providers/catalog'
import { connectionValidationMessage, mergeSettingsPatch, settingsPatchSchema } from './config-schemas'
import { decryptSecrets, encryptSecrets } from './crypto'
import { connectionSchema, secretSchema, settingsSchema } from './schemas'

export async function readSettings(): Promise<PlatformSettings> {
  const [row] = await useDatabase().select().from(platformSettings).where(eq(platformSettings.id, 'platform'))
  return settingsSchema.strip().parse(row?.value || {})
}
export async function writeSettings(actorId: string, input: unknown) {
  return saveSettings(actorId, input, false)
}
export async function patchSettings(actorId: string, input: unknown) {
  return saveSettings(actorId, input, true)
}
async function saveSettings(actorId: string, input: unknown, partial: boolean) {
  const parsed = partial ? settingsPatchSchema.parse(input) : settingsSchema.parse(input)
  return await useDatabase().transaction(async (tx) => {
    // Serialize both full replacements and field updates, including first-time setup.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('huezumi:platform-settings'))`)
    const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.id, 'platform'))
    const current = settingsSchema.strip().parse(row?.value || {})
    const value = partial ? mergeSettingsPatch(current, parsed) : settingsSchema.parse(parsed)
    for (const [field, kind] of [['defaultVideoConnectionId', 'video'], ['defaultTextConnectionId', 'text'], ['defaultImageConnectionId', 'image'], ['defaultWorkflowConnectionId', 'workflow']] as const) {
      // Unrelated operations must remain possible when an old assignment was disabled.
      if (partial && !Object.hasOwn(parsed, field))
        continue
      const id = value[field]
      if (!id)
        continue
      const { connection } = await currentConnection(id)
      if (connection.kind !== kind)
        throw createError({ statusCode: 422, statusMessage: '默认连接不可用' })
    }
    await tx.insert(platformSettings).values({ value }).onConflictDoUpdate({ target: platformSettings.id, set: { value, updatedAt: new Date() } })
    await tx.insert(auditLogs).values({ actorUserId: actorId, action: 'settings.update', targetType: 'settings', targetId: 'platform', detail: { fields: Object.keys(parsed) } })
    return value
  })
}

function masterKey() {
  const key = String(useRuntimeConfig().connectionEncryptionKey || '')
  if (!key)
    throw createError({ statusCode: 503, statusMessage: '平台连接加密主密钥尚未配置' })
  return key
}
export async function readConnectionVersion(id: string, allowRevoked = false) {
  const [row] = await useDatabase().select({ version: connectionVersions, connection: platformConnections }).from(connectionVersions).innerJoin(platformConnections, eq(connectionVersions.connectionId, platformConnections.id)).where(eq(connectionVersions.id, id))
  if (!row || (!allowRevoked && row.version.revokedAt))
    throw createError({ statusCode: 409, statusMessage: '连接版本已撤销，需要管理员核对', data: { code: 'CONNECTION_REVOKED' } })
  try {
    return { ...row, secrets: secretSchema.parse(decryptSecrets(row.version.encryptedSecrets, masterKey(), row.version.id)) }
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: '连接凭据无法解密，请检查平台主密钥', data: { code: 'CONNECTION_DECRYPT_FAILED' } })
  }
}
export async function currentConnection(id: string) {
  const [connection] = await useDatabase().select().from(platformConnections).where(eq(platformConnections.id, id))
  if (!connection?.enabled || !connection.currentVersionId)
    throw createError({ statusCode: 422, statusMessage: '所选连接未启用' })
  return await readConnectionVersion(connection.currentVersionId)
}
export async function listConnections(): Promise<ConnectionSummary[]> {
  const rows = await useDatabase().select({ c: platformConnections, v: connectionVersions }).from(platformConnections).innerJoin(connectionVersions, eq(platformConnections.currentVersionId, connectionVersions.id)).orderBy(desc(platformConnections.createdAt))
  return rows.map(({ c, v }) => ({ id: c.id, name: c.name, kind: c.kind, provider: c.provider, enabled: c.enabled, revisionId: v.id, version: v.version, settings: v.settings, hasCredentials: v.hasCredentials, revoked: Boolean(v.revokedAt) }))
}
export async function saveConnection(actorId: string, input: unknown, id?: string) {
  const parsed = connectionSchema.safeParse(input)
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: connectionValidationMessage(parsed.error) })
  const data = parsed.data
  const capability = data.kind === 'video' ? getCapability(data.provider) : undefined
  if (data.kind === 'video' && (!capability || data.settings.models.some(model => !capability.models.some(item => item.id === model))))
    throw createError({ statusCode: 422, statusMessage: '模型不在供应商能力目录内' })
  if (data.kind === 'text' && (data.provider !== 'openai-compatible' || !data.settings.baseUrl))
    throw createError({ statusCode: 422, statusMessage: '文本连接需使用兼容协议并填写地址' })
  if (data.kind === 'image' && (data.provider !== 'dashscope' || data.settings.auth === 'none' || data.settings.models.some(model => !isSupportedImageModel(model))))
    throw createError({ statusCode: 422, statusMessage: '百炼图片连接需要 API Key 及已支持的 Qwen-Image 2.0 模型' })
  if (data.kind === 'workflow' && (data.provider !== 'comfyui' || !data.settings.baseUrl || !data.settings.workflowPolicy))
    throw createError({ statusCode: 422, statusMessage: '工作流连接需要 ComfyUI 地址和节点执行策略' })
  const connectionId = id || crypto.randomUUID()
  await useDatabase().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${connectionId}, 0))`)
    const [existing] = await tx.select().from(platformConnections).where(eq(platformConnections.id, connectionId))
    if (id && !existing)
      throw createError({ statusCode: 404, statusMessage: '连接不存在' })
    if (existing && (existing.kind !== data.kind || existing.provider !== data.provider))
      throw createError({ statusCode: 409, statusMessage: '已有连接不能更改类型或供应商，请新建连接' })
    const previous = existing?.currentVersionId ? await readConnectionVersion(existing.currentVersionId, true) : undefined
    const secrets = { ...previous?.secrets, ...data.secrets }
    if (data.settings.auth !== 'none' && !(data.provider === 'kling' ? secrets.accessKey && secrets.secretKey : secrets.apiKey))
      throw createError({ statusCode: 422, statusMessage: '请配置完整凭据' })
    if (data.kind === 'video' && data.settings.auth === 'none')
      throw createError({ statusCode: 422, statusMessage: '视频供应商必须配置凭据' })
    const revisionId = crypto.randomUUID()
    if (!existing)
      await tx.insert(platformConnections).values({ id: connectionId, name: data.name, kind: data.kind, provider: data.provider, enabled: data.enabled })
    await tx.insert(connectionVersions).values({ id: revisionId, connectionId, version: (previous?.version.version || 0) + 1, settings: data.settings, encryptedSecrets: encryptSecrets(secrets, masterKey(), revisionId), hasCredentials: Object.keys(secrets).length > 0 })
    await tx.update(platformConnections).set({ name: data.name, enabled: data.enabled, currentVersionId: revisionId }).where(eq(platformConnections.id, connectionId))
    await tx.insert(auditLogs).values({ actorUserId: actorId, action: 'connection.save', targetType: 'connection', targetId: connectionId, detail: { revisionId, fields: Object.keys(data).filter(key => key !== 'secrets'), credentialsChanged: Boolean(data.secrets) } })
  })
  return (await listConnections()).find(item => item.id === connectionId)!
}
export async function listModels(): Promise<ModelOption[]> {
  const settings = await readSettings()
  const assigned = { text: settings.defaultTextConnectionId, image: settings.defaultImageConnectionId, video: settings.defaultVideoConnectionId, workflow: undefined }
  const connections = (await listConnections()).filter(c => c.id === assigned[c.kind])
  const prices = await useDatabase().select().from(textPrices)
  const videoPrices = await useDatabase().select().from(pricingRules).where(and(eq(pricingRules.active, true), sql`${pricingRules.effectiveFrom} <= now()`, sql`(${pricingRules.effectiveTo} is null or ${pricingRules.effectiveTo} > now())`))
  const priced = (c: ConnectionSummary, model: string) => c.kind === 'image' ? videoPrices.some(p => p.provider === c.provider && p.model === model && isImagePrice(p.formula)) : c.kind === 'video' ? videoPrices.some(p => p.provider === c.provider && (p.model === '*' || p.model === model)) : prices.some(p => p.connectionId === c.id && p.model === model)
  return connections.filter(c => c.kind !== 'image' || c.provider === 'dashscope').flatMap(c => c.settings.models.filter(model => model === c.settings.defaultModel).map(model => ({
    id: `${c.id}:${model}`,
    kind: c.kind,
    connectionId: c.id,
    provider: c.provider,
    label: `${c.name} · ${model}`,
    model,
    available: c.enabled && !c.revoked && priced(c, model),
    reason: !c.enabled ? '连接未启用' : c.revoked ? '连接已撤销' : !priced(c, model) ? '尚未配置价格规则' : undefined,
    capability: c.kind === 'video' ? getCapability(c.provider) : undefined,
  })))
}
export async function revokeConnectionVersion(actorId: string, connectionId: string, revisionId: string) {
  await useDatabase().transaction(async (tx) => {
    const rows = await tx.update(connectionVersions).set({ revokedAt: new Date() }).where(and(eq(connectionVersions.id, revisionId), eq(connectionVersions.connectionId, connectionId))).returning({ id: connectionVersions.id })
    if (!rows.length)
      throw createError({ statusCode: 404, statusMessage: '连接版本不存在' })
    await tx.update(generations).set({ status: 'UNKNOWN', dispatchStatus: 'reconciling', settlementStatus: 'review', error: '连接版本已撤销，请管理员核对。', updatedAt: new Date() }).where(and(eq(generations.connectionVersionId, revisionId), sql`${generations.status} in ('PENDING', 'RUNNING', 'UNKNOWN')`))
    await tx.update(runs).set({ status: 'UNKNOWN', stage: 'review', settlementStatus: 'review', error: '连接版本已撤销，请管理员核对。', updatedAt: new Date() }).where(and(eq(runs.connectionVersionId, revisionId), inArray(runs.kind, ['text', 'image']), sql`${runs.status} in ('PENDING', 'RUNNING', 'UNKNOWN')`))
    await tx.update(runs).set({ status: 'UNKNOWN', stage: 'review', error: '连接版本已撤销，请管理员核对。', updatedAt: new Date() }).where(and(eq(runs.connectionVersionId, revisionId), eq(runs.kind, 'workflow'), sql`${runs.status} in ('PENDING', 'RUNNING', 'UNKNOWN')`))
    await tx.insert(auditLogs).values({ actorUserId: actorId, action: 'connection.revoke', targetType: 'connection', targetId: connectionId, detail: { revisionId } })
  })
  return { ok: true }
}
