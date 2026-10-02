import type { RunSummary } from '#shared/types/platform'
import { toPublicGenerationRecord } from '#shared/types/generation'
import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { creativeDocumentVersions, creativeProjects, generations, ledgerEntries, outboxEvents, quotes, runs, works } from '../../database/schema'
import { cursorCondition, pageQuery, pageResult, pageTime } from '../../utils/pagination'
import { requestHash } from '../../utils/request-hash'
import { enqueueGeneration, publishOutbox } from '../generation-queue'
import { rowToGeneration } from '../generation-store'
import { readConnectionVersion, readSettings } from './connections'
import { validateRunContext } from './quotes'
import { submitRunSchema } from './schemas'

export async function submitRun(ownerId: string, input: unknown) {
  const body = submitRunSchema.parse(input)
  const hash = requestHash(body.request)
  const settings = await readSettings()
  const id = await useDatabase().transaction(async (tx) => {
    // The shared admission lock covers all paid modalities and the platform-wide daily cap.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('platform:admission', 0))`)
    const [existing] = await tx.select().from(runs).where(and(eq(runs.ownerId, ownerId), eq(runs.idempotencyKey, body.idempotencyKey)))
    if (existing) {
      if (existing.requestHash !== hash)
        throw createError({ statusCode: 409, statusMessage: '同一幂等键不能用于不同请求' })
      return existing.id
    }
    const [quote] = await tx.select().from(quotes).where(and(eq(quotes.id, body.quoteId), eq(quotes.userId, ownerId), eq(quotes.requestHash, hash), gt(quotes.expiresAt, new Date())))
    if (!quote?.platformRequest || !quote.connectionVersionId)
      throw createError({ statusCode: 409, statusMessage: '报价已过期或参数不一致，请重新报价' })
    await readConnectionVersion(quote.connectionVersionId)
    await validateRunContext(ownerId, body.request)
    const active = await tx.execute<{
      count: number
    }>(sql`select ((select count(*) from generations where owner_id=${ownerId} and status in ('PENDING','RUNNING')) + (select count(*) from runs where owner_id=${ownerId} and kind in ('text','image') and status in ('PENDING','RUNNING')))::int as count`)
    if ((active.rows[0]?.count || 0) >= settings.userMaxActiveGenerations)
      throw createError({ statusCode: 429, statusMessage: '进行中的任务已达上限' })
    const daily = await tx.execute<{
      used: string
    }>(sql`select ((select coalesce(sum(case when settlement_status='released' then 0 else coalesce(charged_credits,reserved_credits) end),0) from generations where created_at>=date_trunc('day',now())) + (select coalesce(sum(case when settlement_status='released' then 0 else coalesce(charged_credits,reserved_credits) end),0) from runs where kind in ('text','image') and created_at>=date_trunc('day',now())))::text as used`)
    if (Number(daily.rows[0]?.used || 0) + quote.estimatedCredits > settings.platformDailyCreditBudget)
      throw createError({ statusCode: 503, statusMessage: '平台今日额度预算已用完' })
    const wallet = await tx.execute(sql`update wallets set reserved_credits=reserved_credits+${quote.estimatedCredits}, updated_at=now() where user_id=${ownerId} and balance_credits-reserved_credits>=${quote.estimatedCredits} returning user_id`)
    if (!wallet.rowCount)
      throw createError({ statusCode: 402, statusMessage: '可用额度不足' })
    let projectId = body.request.projectId
    if (!projectId) {
      const name = body.request.kind === 'text' ? body.request.input.brief.slice(0, 60) : body.request.input.prompt.slice(0, 60)
      const [project] = await tx.insert(creativeProjects).values({ ownerId, name: name || '新创作' }).returning()
      projectId = project!.id
    }
    const id = crypto.randomUUID()
    let generationId: string | undefined
    if (body.request.kind === 'video') {
      const [generation] = await tx.insert(generations).values({ ownerId, request: body.request.input, requestHash: requestHash(body.request.input), idempotencyKey: body.idempotencyKey, quoteId: quote.id, connectionVersionId: quote.connectionVersionId, reservedCredits: quote.estimatedCredits }).returning()
      generationId = generation!.id
    }
    await tx.insert(runs).values({ id, ownerId, kind: body.request.kind, projectId, generationId, request: body.request, sourceVersionId: body.request.sourceVersionId, baseVersionId: body.request.baseVersionId, connectionVersionId: quote.connectionVersionId, quoteId: quote.id, idempotencyKey: body.idempotencyKey, requestHash: hash, reservedCredits: quote.estimatedCredits })
    await tx.insert(ledgerEntries).values({ userId: ownerId, runId: id, generationId, type: 'reserve', amountCredits: -quote.estimatedCredits, idempotencyKey: generationId ? `generation:${generationId}:reserve` : `run:${id}:reserve`, reason: `报价版本 ${quote.priceVersion}` })
    await tx.insert(outboxEvents).values({ topic: generationId ? 'generation.submit' : body.request.kind === 'image' ? 'run.image' : 'run.text', aggregateId: generationId || id, payload: { runId: id } })
    return id
  })
  publishOutbox().catch(() => console.error('Run outbox delivery deferred'))
  return await getRun(ownerId, id)
}
interface RunRelations {
  generation?: typeof generations.$inferSelect | null
  priceVersion?: number | null
  outputs: Array<{ id: string, kind: 'text' | 'image' | 'video', assetId: string | null }>
}
export async function serializeRun(row: typeof runs.$inferSelect, includeDocument = true, related?: RunRelations): Promise<RunSummary> {
  const generation = related ? related.generation : row.generationId ? (await useDatabase().select().from(generations).where(eq(generations.id, row.generationId)))[0] : undefined
  const priceVersion = related ? related.priceVersion : row.quoteId ? (await useDatabase().select({ priceVersion: quotes.priceVersion }).from(quotes).where(eq(quotes.id, row.quoteId)))[0]?.priceVersion : undefined
  const outputs = related ? related.outputs : await useDatabase().select({ id: works.id, kind: works.kind, assetId: works.assetId }).from(works).where(eq(works.runId, row.id))
  const status = generation?.status || row.status
  const settlement = generation?.settlementStatus || row.settlementStatus
  const allowedActions: RunSummary['allowedActions'] = []
  if (generation?.providerTaskId && settlement !== 'review' && ['PENDING', 'RUNNING', 'UNKNOWN'].includes(status))
    allowedActions.push('sync')
  if (generation?.status === 'SUCCEEDED' && !generation.videoArchived && settlement !== 'review')
    allowedActions.push('archive')
  if (row.kind === 'image' && row.stage === 'archiving' && settlement !== 'review')
    allowedActions.push('archive')
  let documentVersion: RunSummary['documentVersion']
  if (includeDocument && row.resultVersionId) {
    const [v] = await useDatabase().select().from(creativeDocumentVersions).where(eq(creativeDocumentVersions.id, row.resultVersionId))
    if (v)
      documentVersion = { id: v.id, documentId: v.documentId, projectId: row.projectId!, version: v.version, source: v.source, content: v.content, model: v.model || undefined, provider: v.provider || undefined, createdAt: v.createdAt.toISOString() }
  }
  return { id: row.id, kind: row.kind, projectId: row.projectId || undefined, status, stage: generation?.dispatchStatus || row.stage, billing: { estimatedCredits: generation?.reservedCredits ?? row.reservedCredits, chargedCredits: (generation?.chargedCredits ?? row.chargedCredits) ?? undefined, settlementStatus: settlement, priceVersion: priceVersion ?? undefined }, allowedActions, outputs: outputs.map(o => ({ id: o.id, kind: o.kind, url: o.assetId ? `/api/assets/${o.assetId}/content` : undefined })), imageRequest: includeDocument && row.kind === 'image' && row.request ? { connectionId: row.request.connectionId, model: row.request.model, input: row.request.input as import('#shared/types/image-generation').ImageGenerationRequest } : undefined, generation: includeDocument && generation ? toPublicGenerationRecord(rowToGeneration(generation)) : undefined, documentVersion, needsReview: row.needsReview, error: generation?.error || row.error || undefined, createdAt: row.createdAt.toISOString(), updatedAt: (generation?.updatedAt || row.updatedAt).toISOString() }
}
export async function getRun(ownerId: string, id: string) {
  const [row] = await useDatabase().select().from(runs).where(and(or(eq(runs.id, id), eq(runs.generationId, id)), eq(runs.ownerId, ownerId), inArray(runs.kind, ['text', 'image', 'video'])))
  if (!row)
    throw createError({ statusCode: 404, statusMessage: '任务不存在' })
  return await serializeRun(row)
}
export async function listRuns(ownerId: string, query: Record<string, unknown>) {
  const p = pageQuery(query)
  const state = sql`coalesce(${generations.status}, ${runs.status})`
  const rows = await useDatabase().select({ row: runs, generation: generations, priceVersion: quotes.priceVersion }).from(runs).leftJoin(generations, eq(runs.generationId, generations.id)).leftJoin(quotes, eq(runs.quoteId, quotes.id)).where(and(eq(runs.ownerId, ownerId), inArray(runs.kind, ['text', 'image', 'video']), cursorCondition(runs.createdAt, runs.id, p.cursor), p.kind ? eq(runs.kind, p.kind) : undefined, p.projectId ? eq(runs.projectId, p.projectId) : undefined, p.status ? sql`${state}=${p.status}` : undefined, query.active === 'true' ? sql`(${state} in ('PENDING','RUNNING','UNKNOWN') or (${runs.kind}='image' and ${runs.stage}='archiving'))` : undefined)).orderBy(desc(pageTime(runs.createdAt)), desc(runs.id)).limit(p.limit + 1)
  const page = pageResult(rows.map(r => r.row), p.limit)
  const outputs = page.items.length ? await useDatabase().select({ id: works.id, kind: works.kind, assetId: works.assetId, runId: works.runId }).from(works).where(inArray(works.runId, page.items.map(row => row.id))) : []
  const items = await Promise.all(page.items.map((row, index) => serializeRun(row, false, { generation: rows[index]?.generation, priceVersion: rows[index]?.priceVersion, outputs: outputs.filter(output => output.runId === row.id) })))
  return { items, nextCursor: page.nextCursor }
}
export async function commandRun(ownerId: string, id: string, action: 'sync' | 'archive') {
  const summary = await getRun(ownerId, id)
  if (!summary.allowedActions.includes(action))
    throw createError({ statusCode: 409, statusMessage: '任务当前不允许此操作' })
  const [row] = await useDatabase().select().from(runs).where(eq(runs.id, summary.id))
  await enqueueGeneration({ kind: row!.kind === 'image' ? 'image' : 'poll', generationId: row!.generationId || id }, { jobId: `command:${id}:${Date.now()}` })
  return { queued: true }
}
export async function reconcileTextRun(actorId: string, id: string, action: 'release' | 'charge', reason: string) {
  const { auditLogs } = await import('../../database/schema')
  await useDatabase().transaction(async (tx) => {
    const [row] = await tx.update(runs).set({ settlementStatus: action === 'release' ? 'released' : 'settled', stage: 'complete', status: 'FAILED', updatedAt: new Date() }).where(and(eq(runs.id, id), inArray(runs.kind, ['text', 'image']), eq(runs.settlementStatus, 'review'))).returning()
    if (!row)
      throw createError({ statusCode: 409, statusMessage: '任务不处于待核对状态' })
    const charged = action === 'charge' ? row.reservedCredits : 0
    await tx.execute(sql`update wallets set reserved_credits=reserved_credits-${row.reservedCredits}, balance_credits=balance_credits-${charged}, updated_at=now() where user_id=${row.ownerId}`)
    await tx.update(runs).set({ chargedCredits: charged }).where(eq(runs.id, id))
    await tx.insert(ledgerEntries).values({ userId: row.ownerId, runId: id, type: action, amountCredits: action === 'charge' ? -charged : row.reservedCredits, reason, actorUserId: actorId, idempotencyKey: `run:${id}:settle` })
    await tx.insert(auditLogs).values({ actorUserId: actorId, action: `run.${action}`, targetType: 'run', targetId: id, detail: { reason } })
  })
  return { ok: true }
}
