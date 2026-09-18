import type { ComfyHistoryEntry } from '#shared/types/comfyui'
import type { WorkSummary } from '#shared/types/platform'
import { and, desc, eq, ilike, sql } from 'drizzle-orm'
import { workflowGraphFromHistory } from '../../../shared/utils/comfy-history-workflow'
import { useDatabase } from '../../database/client'
import { assets, generations, runs, works } from '../../database/schema'
import { cursorCondition, pageQuery, pageResult, pageTime } from '../../utils/pagination'
import { fetchHistoryEntry, fetchQueue, viewFile } from '../comfyui/client'
import { enqueueGeneration } from '../generation-queue'
import { archiveManagedOutput } from './archive'

export async function syncVideoWork(id: string) {
  const db = useDatabase()
  const [g] = await db.select().from(generations).where(eq(generations.id, id))
  if (!g || g.status !== 'SUCCEEDED')
    return
  let [run] = await db.select().from(runs).where(eq(runs.generationId, id))
  if (!run) {
    const [created] = await db.insert(runs).values({ ownerId: g.ownerId, kind: 'video', generationId: id, idempotencyKey: `legacy:${id}`, requestHash: g.requestHash, quoteId: g.quoteId, createdAt: g.createdAt }).onConflictDoNothing().returning()
    run = created || (await db.select().from(runs).where(eq(runs.generationId, id)))[0]!
  }
  const availability = g.videoArchived ? 'available' as const : 'unavailable' as const
  await db.insert(works).values({ ownerId: g.ownerId, kind: 'video', title: g.request.prompt.slice(0, 100) || '视频作品', summary: g.request.prompt.slice(0, 500), runId: run.id, projectId: run.projectId, generationId: id, sourceKey: `generation:${id}`, availability, createdAt: g.createdAt }).onConflictDoUpdate({ target: works.sourceKey, set: { availability, projectId: run.projectId } })
  if (g.videoArchived && typeof g.outputArchive.objectKey === 'string' && typeof g.outputArchive.size === 'number' && typeof g.outputArchive.contentType === 'string') {
    await db.transaction(async (tx) => {
      const [work] = await tx.select().from(works).where(eq(works.sourceKey, `generation:${id}`)).for('update')
      if (!work || work.assetId)
        return
      const [asset] = await tx.insert(assets).values({ ownerId: g.ownerId, name: `${id}.mp4`, contentType: g.outputArchive.contentType as string, size: g.outputArchive.size as number, objectKey: g.outputArchive.objectKey as string }).returning()
      await tx.update(works).set({ assetId: asset!.id }).where(eq(works.id, work.id))
    })
  }
}
export async function listWorks(ownerId: string, query: Record<string, unknown>) {
  const p = pageQuery(query)
  const conditions = and(eq(works.ownerId, ownerId), p.kind === 'workflow' ? sql`${works.sourceKey} like 'workflow:%'` : p.kind ? eq(works.kind, p.kind) : undefined, p.projectId ? eq(works.projectId, p.projectId) : undefined, p.q ? ilike(works.title, `%${p.q.replace(/[%_\\]/g, '\\$&')}%`) : undefined)
  const rows = await useDatabase().select({ work: works, promptId: runs.promptId }).from(works).leftJoin(runs, eq(works.runId, runs.id)).where(and(conditions, cursorCondition(works.createdAt, works.id, p.cursor))).orderBy(desc(pageTime(works.createdAt)), desc(works.id)).limit(p.limit + 1)
  const page = pageResult(rows.map(r => ({ ...r.work, promptId: r.promptId })), p.limit)
  const [count] = await useDatabase().select({ total: sql<number>`count(*)::int` }).from(works).where(conditions)
  const items: WorkSummary[] = page.items.map(w => ({ promptId: w.promptId || undefined, id: w.id, kind: w.kind, title: w.title, summary: w.summary, projectId: w.projectId || undefined, runId: w.runId || undefined, documentId: w.documentId || undefined, versionId: w.versionId || undefined, url: w.assetId ? `/api/assets/${w.assetId}/content` : w.generationId ? `/api/generations/${w.generationId}/video` : undefined, availability: w.availability, createdAt: w.createdAt.toISOString() }))
  return { items, nextCursor: page.nextCursor, total: count?.total || 0 }
}
export async function syncWorkflowRun(id: string) {
  const db = useDatabase()
  const [run] = await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.kind, 'workflow')))
  if (!run?.promptId || run.status === 'FAILED')
    return
  let entry: ComfyHistoryEntry | undefined
  if (run.status === 'SUCCEEDED') {
    // Persisted output identities remain retryable even after upstream history expires.
    const saved = await db.select({ file: works.sourceFile }).from(works).where(eq(works.runId, id))
    entry = { status: { status_str: 'success', completed: true }, outputs: { saved: { images: saved.map(w => w.file).filter(Boolean) } } }
  }
  else {
    entry = await fetchHistoryEntry(run.promptId)
  }
  if (!entry?.status?.completed) {
    if (run.status === 'SUCCEEDED')
      return
    const queue = await fetchQueue()
    const queued = JSON.stringify(queue).includes(run.promptId)
    if (!queued && Date.now() - run.createdAt.getTime() > 600000) {
      await db.update(runs).set({ status: 'UNKNOWN', stage: 'review', error: '执行历史不可用，请管理员核对。', updatedAt: new Date() }).where(eq(runs.id, id))
      return
    }
    await db.update(runs).set({ status: 'RUNNING', stage: 'executing', updatedAt: new Date() }).where(eq(runs.id, id))
    await enqueueGeneration({ kind: 'workflow', generationId: id }, { delay: 12000, jobId: `workflow:${id}:${Date.now()}` })
    return
  }
  if (entry.status.status_str !== 'success') {
    await db.update(runs).set({ status: 'FAILED', stage: 'complete', error: '工作流执行失败', updatedAt: new Date() }).where(eq(runs.id, id))
    return
  }
  // Register every output before marking execution successful; a crash must not lose later files.
  const registered = new Map<string, typeof works.$inferSelect>()
  for (const output of Object.values(entry.outputs || {})) {
    for (const value of [...(Array.isArray(output.images) ? output.images : []), ...(Array.isArray(output.videos) ? output.videos : [])]) {
      if (!value || typeof value !== 'object')
        continue
      const file = value as {
        filename?: string
        subfolder?: string
        type?: string
      }
      if (file.type !== 'output' || !file.filename || file.filename.includes('..') || /[/\\]/.test(file.filename) || (file.subfolder && (file.subfolder.includes('..') || file.subfolder.startsWith('/'))))
        continue
      const ext = file.filename.split('.').at(-1)?.toLowerCase() || ''
      const contentType = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' } as Record<string, string>)[ext]
      if (!contentType)
        continue
      const sourceKey = `workflow:${run.promptId}:${file.subfolder || ''}:${file.filename}`
      await db.insert(works).values({ ownerId: run.ownerId, projectId: run.projectId, runId: id, kind: contentType.startsWith('image') ? 'image' : 'video', title: file.filename, sourceKey, sourceFile: { filename: file.filename, subfolder: file.subfolder, type: 'output' } }).onConflictDoNothing()
      const [work] = await db.select().from(works).where(eq(works.sourceKey, sourceKey))
      if (work)
        registered.set(work.id, work)
    }
  }
  await db.update(runs).set({ status: 'SUCCEEDED', stage: 'archiving', workflow: workflowGraphFromHistory(entry) || run.workflow, updatedAt: new Date() }).where(eq(runs.id, id))
  for (const work of registered.values()) {
    if (work.assetId || !work.sourceFile)
      continue
    const file = work.sourceFile
    const ext = file.filename.split('.').at(-1)?.toLowerCase() || ''
    const contentType = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' } as Record<string, string>)[ext]!
    try {
      const response = await viewFile(file)
      if (!response.body)
        throw new Error('Missing output')
      const objectKey = `forkvdo/outputs/${run.ownerId}/workflows/${work.id}.${ext}`
      const size = await archiveManagedOutput(response.body, objectKey, contentType)
      await db.transaction(async (tx) => {
        const [locked] = await tx.select().from(works).where(eq(works.id, work.id)).for('update')
        if (locked?.assetId)
          return
        const [asset] = await tx.insert(assets).values({ ownerId: run.ownerId, name: file.filename, contentType, size, objectKey }).returning()
        await tx.update(works).set({ assetId: asset!.id, availability: 'available' }).where(eq(works.id, work.id))
      })
    }
    catch {
      await db.update(works).set({ availability: 'unavailable' }).where(and(eq(works.id, work.id), sql`${works.assetId} is null`))
    }
  }
  await db.update(runs).set({ stage: 'complete', updatedAt: new Date() }).where(eq(runs.id, id))
}
