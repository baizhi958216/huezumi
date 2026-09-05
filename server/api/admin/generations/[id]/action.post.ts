import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../../../database/client'
import { auditLogs, generations } from '../../../../database/schema'
import { enqueueGeneration } from '../../../../services/generation-queue'
import { requireAdmin } from '../../../../utils/auth'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('refresh') }),
  z.object({ action: z.literal('release'), reason: z.string().trim().min(3).max(240) }),
  z.object({ action: z.literal('charge'), amount: z.number().int().positive(), reason: z.string().trim().min(3).max(240) }),
])

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: '任务处理参数无效' })
  const db = useDatabase()
  const [record] = await db.select().from(generations).where(eq(generations.id, id)).limit(1)
  if (!record)
    throw createError({ statusCode: 404, statusMessage: '任务不存在' })
  if (parsed.data.action === 'refresh') {
    if (!record.providerTaskId)
      throw createError({ statusCode: 409, statusMessage: '该任务没有可查询的供应商任务 ID' })
    if (record.settlementStatus === 'review') {
      const restored = await db.execute(sql`
        update generations set settlement_status = 'reserved', updated_at = now()
        where id = ${id} and settlement_status = 'review'
      `)
      if (restored.rowCount !== 1)
        throw createError({ statusCode: 409, statusMessage: '任务结算状态已经变化，请刷新后重试' })
    }
    await enqueueGeneration({ kind: 'poll', generationId: id }, { jobId: `admin-${id}-${Date.now()}` })
  }
  else {
    const settlement = parsed.data
    const amount = settlement.action === 'charge' ? settlement.amount : 0
    if (amount > record.reservedCredits)
      throw createError({ statusCode: 422, statusMessage: '人工扣费不能超过用户已授权的预留额度' })
    await db.transaction(async (tx) => {
      const claimed = await tx.execute(sql`
        update generations set settlement_status = ${settlement.action === 'charge' ? 'settled' : 'released'},
          charged_credits = ${amount}, updated_at = now()
        where id = ${id} and settlement_status in ('reserved', 'review')
      `)
      if (claimed.rowCount !== 1)
        throw createError({ statusCode: 409, statusMessage: '该任务已经完成结算' })
      await tx.execute(sql`
        update wallets set balance_credits = balance_credits - ${amount},
          reserved_credits = greatest(reserved_credits - ${record.reservedCredits}, 0), updated_at = now()
        where user_id = ${record.ownerId}
      `)
      await tx.execute(sql`
        insert into ledger_entries (user_id, generation_id, type, amount_credits, idempotency_key, reason, actor_user_id)
        values (${record.ownerId}, ${id}, ${settlement.action === 'charge' ? 'charge' : 'release'}, ${settlement.action === 'charge' ? -amount : record.reservedCredits}, ${`generation:${id}:admin-settle`}, ${settlement.reason}, ${admin.id})
        on conflict (idempotency_key) do nothing
      `)
    })
  }
  await db.insert(auditLogs).values({ actorUserId: admin.id, action: `generation.${parsed.data.action}`, targetType: 'generation', targetId: id, detail: parsed.data })
  return { ok: true }
})
