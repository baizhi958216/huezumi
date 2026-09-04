import type { GenerationRecord } from '#shared/types/generation'
import { toPublicGenerationRecord } from '#shared/types/generation'
import { refreshGeneration } from '../../services/generations'

export default defineEventHandler(async () => {
  const storage = useStorage('data')
  const keys = await storage.getKeys('generations')
  const records = await Promise.all(keys.map(key => storage.getItem<GenerationRecord>(key)))
  const validRecords = records.filter((record): record is GenerationRecord => Boolean(record))

  await Promise.all(validRecords.map(async (record) => {
    if (!['PENDING', 'RUNNING'].includes(record.status))
      return
    try {
      await refreshGeneration(record)
    }
    catch (error) {
      console.error(`Failed to refresh generation ${record.id}`, error)
    }
  }))

  return validRecords.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toPublicGenerationRecord)
})
