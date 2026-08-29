import type { GenerationRecord } from '#shared/types/generation'
import { getVideoProvider } from '../../services/providers'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const storage = useStorage('data')
  const record = await storage.getItem<GenerationRecord>(`generations:${id}`)
  if (!record)
    throw createError({ statusCode: 404, statusMessage: '未找到该生成任务' })

  if (['PENDING', 'RUNNING'].includes(record.status)) {
    try {
      const latest = await getVideoProvider(record.provider).getTask(record.providerTaskId)
      Object.assign(record, latest, { updatedAt: new Date().toISOString() })
      await storage.setItem(`generations:${id}`, record)
    }
    catch (error) {
      console.error('Failed to refresh generation task', error)
    }
  }

  return record
})
