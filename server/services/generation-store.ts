import type { GenerationRecord, OutputArchiveRecord } from '#shared/types/generation'
import type { generations } from '../database/schema'

type GenerationRow = typeof generations.$inferSelect

function outputArchiveOf(value: Record<string, unknown>): OutputArchiveRecord {
  const status = value.status
  if (status !== 'not_started' && status !== 'archived' && status !== 'failed')
    return { status: 'not_started' }
  return {
    status,
    attemptedAt: typeof value.attemptedAt === 'string' ? value.attemptedAt : undefined,
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : undefined,
    errorCode: value.errorCode === 'OUTPUT_ARCHIVE_NOT_CONFIGURED' || value.errorCode === 'OUTPUT_TRANSFER_FAILED' || value.errorCode === 'OUTPUT_ARCHIVE_FAILED' ? value.errorCode : undefined,
    objectKey: typeof value.objectKey === 'string' ? value.objectKey : undefined,
  }
}

export function rowToGeneration(row: GenerationRow): GenerationRecord {
  return {
    ...row.request,
    schemaVersion: row.schemaVersion,
    id: row.id,
    providerTaskId: row.providerTaskId || row.id,
    status: row.status,
    videoUrl: row.videoArchived ? `/api/generations/${row.id}/video` : row.videoUrl || undefined,
    videoArchived: row.videoArchived,
    outputArchive: outputArchiveOf(row.outputArchive),
    usage: row.usage as GenerationRecord['usage'],
    errorCode: row.errorCode as GenerationRecord['errorCode'],
    error: row.error || undefined,
    billing: {
      estimatedCredits: row.reservedCredits,
      chargedCredits: row.chargedCredits ?? undefined,
      settlementStatus: row.settlementStatus,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
