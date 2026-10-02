import type { ProviderTaskResult } from '#shared/types/generation'
import type { GenerationJob } from './generation-queue'
import { and, eq, inArray } from 'drizzle-orm'
import { useDatabase } from '../database/client'
import { generations } from '../database/schema'
import { resolveProviderMediaUrls } from './assets'
import { releaseGenerationCredits, settleGenerationCredits } from './billing'
import { failWorkflowJob, runWorkflowJob } from './comfyui/worker'
import { enqueueGeneration, withGenerationLock } from './generation-queue'
import { archiveRemoteOutput, OutputArchiveError } from './output-archive'
import { runImageJob } from './platform/image-worker'
import { failRunJob, runTextJob } from './platform/text-worker'
import { syncVideoWork } from './platform/works'
import { getVideoProvider } from './providers'
import { configuredVideoProvider } from './providers/configured'

const POLL_DELAY_MS = 12000
export async function runGenerationJob(job: GenerationJob) {
  return await withGenerationLock(job.generationId, async () => {
    if (job.kind === 'workflow')
      return await runWorkflowJob(job.generationId)
    if (job.kind === 'image')
      return await runImageJob(job.generationId)
    if (job.kind === 'text')
      return await runTextJob(job.generationId)
    if (job.kind === 'submit')
      return await submitGeneration(job.generationId)
    if (job.kind === 'poll')
      return await pollGeneration(job.generationId)
  })
}
export async function handleFailedGeneration(job: GenerationJob) {
  await withGenerationLock(job.generationId, async () => {
    if (job.kind === 'workflow')
      return await failWorkflowJob(job.generationId)
    if (job.kind === 'image' || job.kind === 'text')
      return await failRunJob(job.generationId)
    if (job.kind !== 'submit' && job.kind !== 'poll')
      return
    await useDatabase().update(generations).set({
      status: 'UNKNOWN',
      dispatchStatus: 'reconciling',
      settlementStatus: 'review',
      error: '后台任务多次执行失败，已转入人工核对。',
      updatedAt: new Date(),
    }).where(and(eq(generations.id, job.generationId), inArray(generations.status, ['PENDING', 'RUNNING', 'UNKNOWN']), inArray(generations.settlementStatus, ['reserved', 'review'])))
  })
}
async function submitGeneration(id: string) {
  const db = useDatabase()
  const [row] = await db.update(generations).set({ dispatchStatus: 'submitting', updatedAt: new Date() }).where(and(eq(generations.id, id), eq(generations.dispatchStatus, 'queued'))).returning()
  if (!row) {
    // 重试遇到 submitting，说明上次可能已发送请求但未持久化结果；不能再提交。
    await db.update(generations).set({
      status: 'UNKNOWN',
      dispatchStatus: 'reconciling',
      settlementStatus: 'review',
      error: '上次提交结果未确认，请联系管理员核对；平台不会自动重复提交。',
      updatedAt: new Date(),
    }).where(and(eq(generations.id, id), eq(generations.dispatchStatus, 'submitting')))
    return
  }
  try {
    const providerRequest = await resolveProviderMediaUrls(row.ownerId, row.request)
    const result = await (row.connectionVersionId ? await configuredVideoProvider(row.connectionVersionId) : await getVideoProvider(row.request.provider)).submit(providerRequest)
    await db.update(generations).set({
      providerTaskId: result.taskId,
      // submit 契约只有 task ID；获取完整结果前保持非终态。
      status: result.status === 'SUCCEEDED' ? 'RUNNING' : result.status,
      dispatchStatus: 'submitted',
      updatedAt: new Date(),
    }).where(eq(generations.id, id))
    if (result.status === 'FAILED') {
      await releaseGenerationCredits(id, row.ownerId, row.reservedCredits, '供应商未受理生成任务')
      await db.update(generations).set({ dispatchStatus: 'failed', settlementStatus: 'released', updatedAt: new Date() }).where(eq(generations.id, id))
      return
    }
    await enqueueGeneration({ kind: 'poll', generationId: id }, { delay: POLL_DELAY_MS, jobId: `poll-${id}-${Date.now()}` })
  }
  catch (error) {
    console.error(`Generation submission needs reconciliation (${id})`, error instanceof Error ? error.name : 'unknown')
    await db.update(generations).set({
      status: 'UNKNOWN',
      dispatchStatus: 'reconciling',
      settlementStatus: 'review',
      error: '供应商是否受理尚未确认，请联系管理员核对；平台不会自动重复提交。',
      updatedAt: new Date(),
    }).where(eq(generations.id, id))
  }
}
async function pollGeneration(id: string) {
  const db = useDatabase()
  const [row] = await db.select().from(generations).where(eq(generations.id, id)).limit(1)
  if (row?.status === 'SUCCEEDED' && row.videoArchived) {
    await syncVideoWork(id)
    return
  }
  if (!row?.providerTaskId || row.settlementStatus === 'review' || row.status === 'FAILED')
    return
  const latest: ProviderTaskResult = row.status === 'SUCCEEDED'
    ? { status: 'SUCCEEDED', videoUrl: row.videoUrl || undefined, usage: row.usage || undefined }
    : await (row.connectionVersionId ? await configuredVideoProvider(row.connectionVersionId) : await getVideoProvider(row.request.provider)).getTask(row.providerTaskId)
  if (latest.status === 'PENDING' || latest.status === 'RUNNING') {
    await db.update(generations).set({ status: latest.status, usage: latest.usage, updatedAt: new Date() }).where(eq(generations.id, id))
    await enqueueGeneration({ kind: 'poll', generationId: id }, { delay: POLL_DELAY_MS, jobId: `poll-${id}-${Date.now()}` })
    return
  }
  if (latest.status === 'FAILED') {
    await releaseGenerationCredits(id, row.ownerId, row.reservedCredits, '供应商生成失败')
    await db.update(generations).set({
      status: 'FAILED',
      dispatchStatus: 'failed',
      settlementStatus: 'released',
      errorCode: latest.errorCode,
      error: latest.error,
      usage: latest.usage,
      updatedAt: new Date(),
    }).where(eq(generations.id, id))
    return
  }
  if (latest.status !== 'SUCCEEDED') {
    await db.update(generations).set({ status: 'UNKNOWN', dispatchStatus: 'reconciling', settlementStatus: 'review', updatedAt: new Date() }).where(eq(generations.id, id))
    return
  }
  let videoUrl = latest.videoUrl
  let videoArchived = false
  let outputArchive: Record<string, unknown> = { status: 'not_started' }
  if (latest.videoUrl) {
    const attemptedAt = new Date().toISOString()
    try {
      const archived = await archiveRemoteOutput(id, latest.videoUrl, row.ownerId)
      videoArchived = true
      outputArchive = { status: 'archived', attemptedAt, completedAt: new Date().toISOString(), objectKey: archived.objectKey, size: archived.size, contentType: archived.contentType }
      videoUrl = `/api/generations/${id}/video`
    }
    catch (error) {
      outputArchive = {
        status: 'failed',
        attemptedAt,
        errorCode: error instanceof OutputArchiveError ? error.code : 'OUTPUT_ARCHIVE_FAILED',
      }
    }
  }
  const settled = await settleGenerationCredits(id, row.ownerId, row.reservedCredits, row.reservedCredits)
  await db.update(generations).set({
    status: 'SUCCEEDED',
    dispatchStatus: 'complete',
    ...(settled ? { settlementStatus: 'settled' as const, chargedCredits: row.reservedCredits } : {}),
    videoUrl,
    videoArchived,
    outputArchive,
    usage: latest.usage,
    updatedAt: new Date(),
  }).where(eq(generations.id, id))
  await syncVideoWork(id)
}
