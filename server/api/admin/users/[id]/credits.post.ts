import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../../../database/client'
import { auditLogs, ledgerEntries, users } from '../../../../database/schema'
import { requireAdmin } from '../../../../utils/auth'

const schema = z.object({ amount: z.number().int().min(-1000000).max(1000000).refine(value => value !== 0), reason: z.string().trim().min(3).max(240) })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: '额度调整参数无效' })
  const db = useDatabase()
  const idempotencyKey = `admin:${crypto.randomUUID()}`
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
    if (!target)
      throw createError({ statusCode: 404, statusMessage: '用户不存在' })
    const updated = await tx.execute(sql`
      update wallets set balance_credits = balance_credits + ${parsed.data.amount}, updated_at = now()
      where user_id = ${id} and balance_credits + ${parsed.data.amount} >= reserved_credits
    `)
    if (updated.rowCount !== 1)
      throw createError({ statusCode: 409, statusMessage: '调整后余额不能低于已预留额度' })
    await tx.insert(ledgerEntries).values({ userId: id, type: 'adjustment', amountCredits: parsed.data.amount, idempotencyKey, reason: parsed.data.reason, actorUserId: admin.id })
    await tx.insert(auditLogs).values({ actorUserId: admin.id, action: 'credits.adjust', targetType: 'user', targetId: id, detail: { amount: parsed.data.amount, reason: parsed.data.reason } })
  })
  return { ok: true }
})
