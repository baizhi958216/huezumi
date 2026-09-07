import { and, eq } from 'drizzle-orm'
import { useDatabase } from '../../../database/client'
import { generations } from '../../../database/schema'
import { enqueueGeneration } from '../../../services/generation-queue'
import { requireUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const [record] = await useDatabase().select({
    id: generations.id,
    providerTaskId: generations.providerTaskId,
    status: generations.status,
    videoArchived: generations.videoArchived,
  }).from(generations).where(and(eq(generations.id, id), eq(generations.ownerId, user.id))).limit(1)
  if (!record)
    throw createError({ statusCode: 404, statusMessage: '未找到该生成任务' })
  if (!record.providerTaskId || record.status === 'FAILED' || (record.status === 'SUCCEEDED' && record.videoArchived))
    throw createError({ statusCode: 409, statusMessage: '该任务当前无需刷新' })
  await enqueueGeneration({ kind: 'poll', generationId: record.id }, { jobId: `manual-${record.id}-${Date.now()}` })
  return { queued: true }
})
