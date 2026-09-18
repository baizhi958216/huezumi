import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../../database/client'
import { auditLogs, textPrices } from '../../../database/schema'
import { currentConnection } from '../../../services/platform/connections'
import { requireAdmin } from '../../../utils/auth'

const schema = z.object({ connectionId: z.uuid(), model: z.string().min(1), length: z.enum(['short', 'medium', 'long']), credits: z.number().int().positive().max(1000000) })
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const data = schema.parse(await readBody(event))
  const c = await currentConnection(data.connectionId)
  if (c.connection.kind !== 'text' || !c.version.settings.models.includes(data.model))
    throw createError({ statusCode: 422, statusMessage: '文本模型无效' })
  return await useDatabase().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`price:${data.connectionId}:${data.model}:${data.length}`}, 0))`)
    const [last] = await tx.select().from(textPrices).where(and(eq(textPrices.connectionId, data.connectionId), eq(textPrices.model, data.model), eq(textPrices.length, data.length))).orderBy(desc(textPrices.version)).limit(1)
    const [created] = await tx.insert(textPrices).values({ ...data, version: (last?.version || 0) + 1 }).returning()
    await tx.insert(auditLogs).values({ actorUserId: user.id, action: 'text-price.publish', targetType: 'price', targetId: created!.id, detail: data })
    return created
  })
})
