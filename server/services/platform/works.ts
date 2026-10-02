import type { WorkSummary } from '#shared/types/platform'
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { assets, generations, runs, works } from '../../database/schema'
import { cursorCondition, pageQuery, pageResult, pageTime } from '../../utils/pagination'

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
  const conditions = and(eq(works.ownerId, ownerId), p.kind && p.kind !== 'workflow' ? eq(works.kind, p.kind) : undefined, p.projectId ? eq(works.projectId, p.projectId) : undefined, p.q ? ilike(works.title, `%${p.q.replace(/[%_\\]/g, '\\$&')}%`) : undefined)
  const rows = await useDatabase().select({ work: works, runId: runs.id }).from(works).leftJoin(runs, and(eq(works.runId, runs.id), inArray(runs.kind, ['text', 'image', 'video', 'workflow']))).where(and(conditions, cursorCondition(works.createdAt, works.id, p.cursor))).orderBy(desc(pageTime(works.createdAt)), desc(works.id)).limit(p.limit + 1)
  const page = pageResult(rows.map(row => ({ ...row.work, runId: row.runId })), p.limit)
  const [count] = await useDatabase().select({ total: sql<number>`count(*)::int` }).from(works).where(conditions)
  const items: WorkSummary[] = page.items.map(w => ({ id: w.id, kind: w.kind, title: w.title, summary: w.summary, projectId: w.projectId || undefined, runId: w.runId || undefined, documentId: w.documentId || undefined, versionId: w.versionId || undefined, url: w.assetId ? `/api/assets/${w.assetId}/content` : w.generationId ? `/api/generations/${w.generationId}/video` : undefined, availability: w.availability, createdAt: w.createdAt.toISOString() }))
  return { items, nextCursor: page.nextCursor, total: count?.total || 0 }
}
