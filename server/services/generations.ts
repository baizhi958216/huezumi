import type { GenerationRecord, ProviderTaskResult } from '#shared/types/generation'
import { archiveRemoteOutput, OutputArchiveError } from './output-archive'
import { getVideoProvider } from './providers'

async function persistGeneration(record: GenerationRecord) {
  await useStorage('data').setItem(`generations:${record.id}`, record)
}

function markOutputArchiveFailed(record: GenerationRecord, attemptedAt: string, error: unknown) {
  const errorCode = error instanceof OutputArchiveError ? error.code : 'OUTPUT_ARCHIVE_FAILED'
  record.videoArchived = false
  record.outputArchive = { status: 'failed', attemptedAt, errorCode }
}

async function archiveGenerationOutput(record: GenerationRecord, latest?: ProviderTaskResult) {
  const attemptedAt = new Date().toISOString()
  try {
    const sourceUrl = latest?.videoUrl || record.videoUrl
    if (!sourceUrl)
      throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
    record.videoUrl = sourceUrl
    const archived = await archiveRemoteOutput(record.id, sourceUrl)

    record.videoUrl = archived.url
    record.videoArchived = true
    record.outputArchive = {
      status: 'archived',
      attemptedAt,
      completedAt: new Date().toISOString(),
      objectKey: archived.objectKey,
    }
  }
  catch (error) {
    markOutputArchiveFailed(record, attemptedAt, error)
  }
}

export async function refreshGeneration(record: GenerationRecord, explicit = false) {
  const active = record.status === 'PENDING' || record.status === 'RUNNING'
  const recoverUnknown = explicit && record.status === 'UNKNOWN'
  const retryArchive = explicit && record.status === 'SUCCEEDED' && record.videoArchived !== true
  if (!active && !recoverUnknown && !retryArchive)
    return record

  try {
    const latest = await getVideoProvider(record.provider).getTask(record.providerTaskId)
    const priorVideoUrl = record.videoUrl

    // 归档重试不得因为供应商已经清理终态任务而把历史成功记录降级为失败。
    if (!retryArchive || latest.status === 'SUCCEEDED') {
      Object.assign(record, latest)
      if (latest.status === 'SUCCEEDED' && !latest.videoUrl && priorVideoUrl)
        record.videoUrl = priorVideoUrl
    }
    record.updatedAt = new Date().toISOString()

    if (record.status === 'SUCCEEDED')
      await archiveGenerationOutput(record, latest.status === 'SUCCEEDED' ? latest : undefined)

    await persistGeneration(record)
  }
  catch (error) {
    console.error(`Generation refresh failed (${record.provider}/${record.id})`, error instanceof Error ? error.name : 'unknown')
    if (retryArchive && record.videoUrl) {
      await archiveGenerationOutput(record)
      record.updatedAt = new Date().toISOString()
      await persistGeneration(record)
    }
  }
  return record
}
