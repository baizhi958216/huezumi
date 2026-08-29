import type { GenerationRecord } from '#shared/types/generation'
import { getVideoProvider } from '../../services/providers'

export default defineEventHandler(async () => {
  const storage = useStorage('data')
  const keys = await storage.getKeys('generations')
  const records = await Promise.all(keys.map(key => storage.getItem<GenerationRecord>(key)))
  const validRecords = records.filter((record): record is GenerationRecord => Boolean(record))

  await Promise.all(validRecords.map(async (record) => {
    if (!['PENDING', 'RUNNING'].includes(record.status))
      return
    try {
      const latest = await getVideoProvider(record.provider).getTask(record.providerTaskId)
      Object.assign(record, latest, { updatedAt: new Date().toISOString() })
      await storage.setItem(`generations:${record.id}`, record)
    }
    catch (error) {
      console.error(`Failed to refresh generation ${record.id}`, error)
    }
  }))

  return validRecords.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
})
