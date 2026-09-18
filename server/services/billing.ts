import type { GenerationRequest } from '#shared/types/generation'
import { calculateGenerationCredits } from '#shared/utils/pricing'
import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm'
import { useDatabase } from '../database/client'
import { pricingRules, quotes } from '../database/schema'
import { requestHash } from '../utils/request-hash'

export interface BillingQuote {
  id: string
  estimatedCredits: number
  expiresAt: string
  priceVersion: number
  sourceLabel: string
}

export async function createQuote(userId: string, request: GenerationRequest): Promise<BillingQuote> {
  const now = new Date()
  const rules = await useDatabase().select().from(pricingRules).where(and(
    eq(pricingRules.provider, request.provider),
    eq(pricingRules.active, true),
    lte(pricingRules.effectiveFrom, now),
    or(isNull(pricingRules.effectiveTo), gt(pricingRules.effectiveTo, now)),
  )).orderBy(desc(pricingRules.version), desc(pricingRules.createdAt))
  const rule = rules
    .sort((left, right) => {
      const score = (item: typeof left) => (item.model === request.model ? 2 : item.model === '*' ? 0 : -100)
        + (item.resolution === request.resolution ? 1 : item.resolution === '*' ? 0 : -100)
      return score(right) - score(left)
    })
    .find(item => (item.model === request.model || item.model === '*') && (item.resolution === request.resolution || item.resolution === '*'))
  if (!rule)
    throw createError({ statusCode: 422, statusMessage: '当前模型尚未配置额度规则，请联系管理员' })
  const estimatedCredits = calculateGenerationCredits(rule.formula, request)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
  const [quote] = await useDatabase().insert(quotes).values({
    userId,
    requestHash: requestHash(request),
    request,
    ruleId: rule.id,
    priceVersion: rule.version,
    estimatedCredits,
    expiresAt,
  }).returning()
  return {
    id: quote!.id,
    estimatedCredits,
    expiresAt: expiresAt.toISOString(),
    priceVersion: rule.version,
    sourceLabel: rule.sourceLabel,
  }
}

export async function settleGenerationCredits(generationId: string, userId: string, reserved: number, charged: number) {
  const db = useDatabase()
  return await db.transaction(async (tx) => {
    const claimed = await tx.execute(sql`
      update generations set settlement_status = 'settled', charged_credits = ${charged}, updated_at = now()
      where id = ${generationId} and settlement_status = 'reserved'
    `)
    if (claimed.rowCount !== 1)
      return false
    const result = await tx.execute(sql`
      update wallets
      set balance_credits = balance_credits - ${charged},
          reserved_credits = greatest(reserved_credits - ${reserved}, 0),
          updated_at = now()
      where user_id = ${userId}
    `)
    if (result.rowCount !== 1)
      throw new Error('wallet missing')
    await tx.execute(sql`
      insert into ledger_entries (user_id, generation_id, run_id, type, amount_credits, idempotency_key, reason)
      values (${userId}, ${generationId}, (select id from runs where generation_id=${generationId}), 'charge', ${-charged}, ${`generation:${generationId}:charge`}, '生成任务结算')
      on conflict (idempotency_key) do nothing
    `)
    return true
  })
}

export async function releaseGenerationCredits(generationId: string, userId: string, reserved: number, reason: string) {
  const db = useDatabase()
  return await db.transaction(async (tx) => {
    const claimed = await tx.execute(sql`
      update generations set settlement_status = 'released', updated_at = now()
      where id = ${generationId} and settlement_status = 'reserved'
    `)
    if (claimed.rowCount !== 1)
      return false
    await tx.execute(sql`
      update wallets set reserved_credits = greatest(reserved_credits - ${reserved}, 0), updated_at = now()
      where user_id = ${userId}
    `)
    await tx.execute(sql`
      insert into ledger_entries (user_id, generation_id, run_id, type, amount_credits, idempotency_key, reason)
      values (${userId}, ${generationId}, (select id from runs where generation_id=${generationId}), 'release', ${reserved}, ${`generation:${generationId}:release`}, ${reason})
      on conflict (idempotency_key) do nothing
    `)
    return true
  })
}
