import type { PublicGenerationRecord } from '#shared/types/generation'
import { toPublicGenerationRecord } from '#shared/types/generation'
import { and, eq, gt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { generations, ledgerEntries, outboxEvents, quotes } from '../../database/schema'
import { publishOutbox } from '../../services/generation-queue'
import { rowToGeneration } from '../../services/generation-store'
import { assertRequestSupported } from '../../services/providers'
import { getCapability } from '../../services/providers/catalog'
import { requireUser } from '../../utils/auth'
import { generationSchema } from '../../utils/generation-schema'
import { requestHash } from '../../utils/request-hash'

const metadataSchema = z.object({ quoteId: z.uuid(), idempotencyKey: z.string().min(12).max(120) })

export default defineEventHandler(async (event): Promise<PublicGenerationRecord> => {
  const user = await requireUser(event)
  const body = await readBody(event)
  const parsed = generationSchema.safeParse(body)
  const metadata = metadataSchema.safeParse(body)
  if (!parsed.success || !metadata.success)
    throw createError({ statusCode: 422, statusMessage: parsed.error?.issues[0]?.message || metadata.error?.issues[0]?.message || '生成参数无效' })
  const capability = getCapability(parsed.data.provider)
  if (!capability)
    throw createError({ statusCode: 400, statusMessage: `供应商 ${parsed.data.provider} 不存在` })
  assertRequestSupported(capability, parsed.data)

  const db = useDatabase()
  const hash = requestHash(parsed.data)
  const [existing] = await db.select().from(generations).where(and(eq(generations.ownerId, user.id), eq(generations.idempotencyKey, metadata.data.idempotencyKey))).limit(1)
  if (existing) {
    if (existing.requestHash !== hash)
      throw createError({ statusCode: 409, statusMessage: '同一幂等键不能用于不同生成参数' })
    return toPublicGenerationRecord(rowToGeneration(existing))
  }

  let created: typeof generations.$inferSelect
  try {
    created = await db.transaction(async (tx) => {
      const active = await tx.execute(sql`
        select count(*)::int as count from generations
        where owner_id = ${user.id} and status in ('PENDING', 'RUNNING') and dispatch_status not in ('complete', 'failed')
      `)
      const activeCount = Number((active.rows[0] as { count?: number } | undefined)?.count || 0)
      if (activeCount >= Number(useRuntimeConfig().userMaxActiveGenerations || 3))
        throw createError({ statusCode: 429, statusMessage: '进行中的任务已达上限，请等待任务完成' })
      const [quote] = await tx.select().from(quotes).where(and(
        eq(quotes.id, metadata.data.quoteId),
        eq(quotes.userId, user.id),
        eq(quotes.requestHash, hash),
        gt(quotes.expiresAt, new Date()),
      )).limit(1)
      if (!quote)
        throw createError({ statusCode: 409, statusMessage: '报价已过期或与当前参数不一致，请重新报价' })
      const platformBudget = Number(useRuntimeConfig().platformDailyCreditBudget || 100000)
      const daily = await tx.execute(sql`
        select coalesce(sum(coalesce(charged_credits, reserved_credits)), 0)::bigint as used
        from generations where created_at >= date_trunc('day', now())
      `)
      if (Number((daily.rows[0] as { used?: number } | undefined)?.used || 0) + quote.estimatedCredits > platformBudget)
        throw createError({ statusCode: 503, statusMessage: '平台今日生成预算已用完，请稍后再试' })
      const reserved = await tx.execute(sql`
        update wallets set reserved_credits = reserved_credits + ${quote.estimatedCredits}, updated_at = now()
        where user_id = ${user.id} and balance_credits - reserved_credits >= ${quote.estimatedCredits}
        returning user_id
      `)
      if (reserved.rowCount !== 1)
        throw createError({ statusCode: 402, statusMessage: '可用额度不足，请联系管理员补充额度' })
      const [generation] = await tx.insert(generations).values({
        ownerId: user.id,
        request: parsed.data,
        requestHash: hash,
        idempotencyKey: metadata.data.idempotencyKey,
        quoteId: quote.id,
        reservedCredits: quote.estimatedCredits,
      }).returning()
      if (!generation)
        throw createError({ statusCode: 500, statusMessage: '创建任务失败' })
      await tx.insert(ledgerEntries).values({
        userId: user.id,
        generationId: generation.id,
        type: 'reserve',
        amountCredits: -quote.estimatedCredits,
        idempotencyKey: `generation:${generation.id}:reserve`,
        reason: `报价版本 ${quote.priceVersion}`,
      })
      await tx.insert(outboxEvents).values({ topic: 'generation.submit', aggregateId: generation.id, payload: { generationId: generation.id } })
      return generation
    }, { isolationLevel: 'serializable' })
  }
  catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const [duplicate] = await db.select().from(generations).where(and(eq(generations.ownerId, user.id), eq(generations.idempotencyKey, metadata.data.idempotencyKey))).limit(1)
      if (duplicate && duplicate.requestHash === hash)
        return toPublicGenerationRecord(rowToGeneration(duplicate))
      throw createError({ statusCode: 409, statusMessage: '生成请求重复或冲突' })
    }
    throw error
  }
  publishOutbox().catch(error => console.error('Outbox publish after generation create failed', error))
  return toPublicGenerationRecord(rowToGeneration(created))
})
