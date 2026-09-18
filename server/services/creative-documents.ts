import type { TextCreationContent, TextDocumentVersionRecord } from '#shared/types/text-creation'
import { and, desc, eq, sql } from 'drizzle-orm'
import { useDatabase } from '../database/client'
import { creativeDocuments, creativeDocumentVersions, creativeProjects, works } from '../database/schema'

function versionRecord(row: typeof creativeDocumentVersions.$inferSelect, projectId: string): TextDocumentVersionRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    projectId,
    version: row.version,
    source: row.source,
    provider: row.provider || undefined,
    model: row.model || undefined,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  }
}
export async function saveManualDocumentVersion(ownerId: string, documentId: string, content: TextCreationContent, baseVersionId?: string) {
  return await useDatabase().transaction(async (tx) => {
    await tx.execute(sql`select id from creative_documents where id = ${documentId} and owner_id = ${ownerId} for update`)
    const [document] = await tx.select().from(creativeDocuments).where(and(eq(creativeDocuments.id, documentId), eq(creativeDocuments.ownerId, ownerId))).limit(1)
    if (!document)
      throw createError({ statusCode: 404, statusMessage: '创作文档不存在' })
    if (!baseVersionId || document.currentVersionId !== baseVersionId)
      throw createError({ statusCode: 409, statusMessage: '文档已经更新，请重新打开后合并修改', data: { code: 'VERSION_CONFLICT' } })
    const [latest] = await tx.select({ version: creativeDocumentVersions.version }).from(creativeDocumentVersions).where(eq(creativeDocumentVersions.documentId, documentId)).orderBy(desc(creativeDocumentVersions.version)).limit(1)
    const [saved] = await tx.insert(creativeDocumentVersions).values({ documentId, version: (latest?.version || 0) + 1, source: 'manual', content }).returning()
    await tx.update(creativeDocuments).set({ title: content.title, currentVersionId: saved!.id, updatedAt: new Date() }).where(eq(creativeDocuments.id, documentId))
    await tx.update(creativeProjects).set({ updatedAt: new Date() }).where(eq(creativeProjects.id, document.projectId))
    await tx.insert(works).values({ ownerId, projectId: document.projectId, kind: 'text', title: content.title, summary: content.summary, documentId, versionId: saved!.id, sourceKey: `document:${documentId}`, availability: 'available' }).onConflictDoUpdate({ target: works.sourceKey, set: { title: content.title, summary: content.summary, versionId: saved!.id } })
    return versionRecord(saved!, document.projectId)
  })
}
