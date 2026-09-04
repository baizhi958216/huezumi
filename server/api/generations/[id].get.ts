import type { GenerationRecord } from '#shared/types/generation'
import { toPublicGenerationRecord } from '#shared/types/generation'
import { refreshGeneration } from '../../services/generations'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const storage = useStorage('data')
  const record = await storage.getItem<GenerationRecord>(`generations:${id}`)
  if (!record)
    throw createError({ statusCode: 404, statusMessage: '未找到该生成任务' })

  const refresh = getQuery(event).refresh === '1'
  await refreshGeneration(record, refresh)

  return toPublicGenerationRecord(record)
})
