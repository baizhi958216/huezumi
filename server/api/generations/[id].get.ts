import { toPublicGenerationRecord } from '#shared/types/generation'
import { and, eq } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { generations } from '../../database/schema'
import { rowToGeneration } from '../../services/generation-store'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const [record] = await useDatabase().select().from(generations).where(and(eq(generations.id, id), eq(generations.ownerId, user.id))).limit(1)
  if (!record)
    throw createError({ statusCode: 404, statusMessage: '未找到该生成任务' })
  return toPublicGenerationRecord(rowToGeneration(record))
})
