import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, readFile, rename, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { Pool } from 'pg'
import { connectionSchema, settingsSchema } from '../server/services/platform/config-schemas'
import { decryptSecrets, encryptSecrets } from '../server/services/platform/crypto'
import { providerCapabilities } from '../server/services/providers/catalog'
import { envAssignment } from './env-file'

const source = await readFile('.env', 'utf8')
const values = { ...parseEnv(source), ...process.env }
const masterKey = values.NUXT_CONNECTION_ENCRYPTION_KEY || randomBytes(32).toString('base64')
const pool = new Pool({ connectionString: values.NUXT_DATABASE_URL, connectionTimeoutMillis: 5000 })
const client = await pool.connect()
try {
  const candidates: Array<{
    importKey: string
    name: string
    kind: 'video' | 'text'
    provider: string
    settings: Record<string, unknown>
    secrets: Record<string, string>
  }> = []
  for (const capability of providerCapabilities) {
    const prefix = `NUXT_${capability.id.toUpperCase()}_`
    const key = values[`${prefix}API_KEY`]
    const accessKey = values[`${prefix}ACCESS_KEY`]
    const secretKey = values[`${prefix}SECRET_KEY`]
    if (!(capability.id === 'kling' ? accessKey && secretKey : key))
      continue
    const secrets = capability.id === 'kling' ? { accessKey: accessKey!, secretKey: secretKey! } : { apiKey: key! }
    candidates.push({ importKey: `env:video:${capability.id}`, name: capability.name, kind: 'video', provider: capability.id, settings: { defaultModel: values[`${prefix}MODEL`] || capability.models[0]!.id, models: capability.models.map(m => m.id), ...(values[`${prefix}BASE_URL`] ? { baseUrl: values[`${prefix}BASE_URL`] } : {}), ...(values[`${prefix}WORKSPACE_ID`] ? { workspaceId: values[`${prefix}WORKSPACE_ID`] } : {}), ...(values[`${prefix}REGION`] ? { region: values[`${prefix}REGION`] } : {}), ...(values[`${prefix}GROUP_ID`] ? { groupId: values[`${prefix}GROUP_ID`] } : {}) }, secrets })
  }
  const raw = values.NUXT_TEXT_LLM_CONNECTIONS_JSON || values.NUXT_COMFYUI_LLM_CONNECTIONS_JSON
  if (raw) {
    const connections: unknown = JSON.parse(raw)
    if (!connections || typeof connections !== 'object' || Array.isArray(connections))
      throw new Error('Text connections must be an object')
    for (const [id, candidate] of Object.entries(connections)) {
      if (!candidate || typeof candidate !== 'object')
        continue
      const c = candidate as Record<string, unknown>
      if (typeof c.baseUrl !== 'string' || typeof c.defaultModel !== 'string' || (c.auth !== 'none' && typeof c.apiKey !== 'string'))
        continue
      const { apiKey, label, ...settings } = c
      candidates.push({ importKey: `env:text:${id}`, name: typeof label === 'string' ? label : id, kind: 'text', provider: 'openai-compatible', settings: { ...settings, models: [c.defaultModel] }, secrets: typeof apiKey === 'string' ? { apiKey } : {} })
    }
  }
  await client.query('begin')
  await client.query('select pg_advisory_xact_lock(hashtextextended(\'config:import\',0))')
  let imported = 0
  for (const c of candidates) {
    const existing = await client.query('select v.id, v.encrypted_secrets from platform_connections c join connection_versions v on v.id=c.current_version_id where c.import_key=$1', [c.importKey])
    if (existing.rowCount) {
      decryptSecrets(existing.rows[0].encrypted_secrets, masterKey, existing.rows[0].id)
      continue
    }
    connectionSchema.parse({ name: c.name, kind: c.kind, provider: c.provider, settings: c.settings, secrets: c.secrets })
    const id = randomUUID()
    const revision = randomUUID()
    await client.query('insert into platform_connections(id,import_key,name,kind,provider) values($1,$2,$3,$4,$5)', [id, c.importKey, c.name, c.kind, c.provider])
    await client.query('insert into connection_versions(id,connection_id,version,settings,encrypted_secrets,has_credentials) values($1,$2,1,$3,$4,$5)', [revision, id, c.settings, encryptSecrets(c.secrets, masterKey, revision), Object.keys(c.secrets).length > 0])
    await client.query('update platform_connections set current_version_id=$2 where id=$1', [id, revision])
    imported++
  }
  const defaults = await client.query<{
    id: string
    kind: string
  }>('select id,kind from platform_connections order by created_at,id')
  const settings = { registrationMode: values.NUXT_REGISTRATION_MODE || 'invite', signupCredits: Number(values.NUXT_SIGNUP_CREDITS || 0), userMaxActiveGenerations: Number(values.NUXT_USER_MAX_ACTIVE_GENERATIONS || 3), platformDailyCreditBudget: Number(values.NUXT_PLATFORM_DAILY_CREDIT_BUDGET || 100000), defaultVideoConnectionId: defaults.rows.find(r => r.kind === 'video')?.id, defaultTextConnectionId: defaults.rows.find(r => r.kind === 'text')?.id }
  settingsSchema.parse(settings)
  await client.query('insert into platform_settings(id,value) values(\'platform\',$1) on conflict(id) do nothing', [settings])
  // Old accepted tasks need the same imported connection before removing legacy env.
  await client.query('update generations g set connection_version_id=c.current_version_id from platform_connections c where g.connection_version_id is null and c.import_key=\'env:video:\' || (g.request->>\'provider\')')
  const encrypted = await client.query('select id,encrypted_secrets from connection_versions')
  for (const revision of encrypted.rows)
    decryptSecrets(revision.encrypted_secrets, masterKey, revision.id)
  const backup = `.env.backup-${Date.now()}`
  await writeFile(backup, source, { mode: 0o600, flag: 'wx' })
  let next = source
  if (!values.NUXT_CONNECTION_ENCRYPTION_KEY)
    next += `\nNUXT_CONNECTION_ENCRYPTION_KEY=${masterKey}\n`
  if (process.argv.includes('--compact-env')) {
    const retained: Record<string, string> = {}
    const keep = (k: string) => k === 'NUXT_CONNECTION_ENCRYPTION_KEY' || k === 'NUXT_DATABASE_URL' || k === 'NUXT_PUBLIC_APP_URL' || k.startsWith('POSTGRES_') || k.startsWith('LOCAL_OSS_') || k.startsWith('NUXT_OSS_') || k.startsWith('NUXT_COMFYUI_') || k.startsWith('FORKVDO_') || k.startsWith('DASHSCOPE_') || ['NUXT_DASHSCOPE_API_KEY', 'NUXT_DASHSCOPE_WORKSPACE_ID', 'NUXT_DASHSCOPE_REGION'].includes(k) || k.startsWith('NUXT_WORKER_')
    for (const [key, value] of Object.entries(parseEnv(next))) {
      if (keep(key) && value !== '')
        retained[key] = value
    }
    const groups: Array<[string, (key: string) => boolean]> = [
      ['数据库', k => k === 'NUXT_DATABASE_URL' || k.startsWith('POSTGRES_')],
      ['平台加密与访问地址', k => k === 'NUXT_CONNECTION_ENCRYPTION_KEY' || k === 'NUXT_PUBLIC_APP_URL'],
      ['私有对象存储', k => k.startsWith('NUXT_OSS_') || k.startsWith('LOCAL_OSS_')],
      ['后台任务进程', k => k.startsWith('NUXT_WORKER_')],
      ['独立 ComfyUI 执行端', () => true],
    ]
    next = '# 业务连接和运营参数由管理后台维护；这里只保留部署及工作流配置。\n'
    for (const [label, matches] of groups) {
      const entries = Object.entries(retained).filter(([key]) => matches(key))
      if (!entries.length)
        continue
      next += `\n# ${label}\n${entries.map(([k, v]) => envAssignment(k, v)).join('\n')}\n`
      for (const [key] of entries)
        delete retained[key]
    }
  }
  // Persist the key before commit: a failed commit can be retried safely, but losing a committed key cannot.
  const temp = '.env.import-tmp'
  await writeFile(temp, next, { mode: 0o600 })
  await chmod(temp, 0o600)
  await rename(temp, '.env')
  await client.query('commit')
  console.log(`Imported ${imported} connections; existing connections unchanged. Private configuration backup created. Text pricing requires explicit administrator setup.`)
}
catch {
  await client.query('rollback')
  console.error('Configuration import failed; no secret values logged.')
  process.exitCode = 1
}
finally {
  client.release()
  await pool.end()
}
