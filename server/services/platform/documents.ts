import { and, desc, eq, ilike, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { creativeDocuments, creativeDocumentVersions } from '../../database/schema'
import { cursorCondition, pageQuery, pageResult, pageTime } from '../../utils/pagination'
import { saveManualDocumentVersion } from '../creative-documents'
import { textCreationContentSchema } from '../text-creation'

export async function ownedDocument(ownerId: string, id: string) {
  const [doc] = await useDatabase().select().from(creativeDocuments).where(and(eq(creativeDocuments.id, id), eq(creativeDocuments.ownerId, ownerId)))
  if (!doc)
    throw createError({ statusCode: 404, statusMessage: '文档不存在' })
  return doc
}
export async function documentVersion(ownerId: string, id: string, versionId?: string) {
  const doc = await ownedDocument(ownerId, id)
  const [version] = await useDatabase().select().from(creativeDocumentVersions).where(and(eq(creativeDocumentVersions.documentId, id), eq(creativeDocumentVersions.id, versionId || doc.currentVersionId || '00000000-0000-0000-0000-000000000000')))
  if (!version)
    throw createError({ statusCode: 404, statusMessage: '版本不存在' })
  return { kind: doc.kind, id: version.id, documentId: id, projectId: doc.projectId, version: version.version, source: version.source, content: version.content, provider: version.provider || undefined, model: version.model || undefined, createdAt: version.createdAt.toISOString() }
}
export async function documentsPage(ownerId: string, query: Record<string, unknown>) {
  const p = pageQuery(query)
  const rows = await useDatabase().select({ id: creativeDocuments.id, projectId: creativeDocuments.projectId, title: creativeDocuments.title, kind: creativeDocuments.kind, currentVersion: creativeDocumentVersions.version, summary: sql<string>`${creativeDocumentVersions.content}->>'summary'`, createdAt: creativeDocuments.updatedAt }).from(creativeDocuments).innerJoin(creativeDocumentVersions, eq(creativeDocuments.currentVersionId, creativeDocumentVersions.id)).where(and(eq(creativeDocuments.ownerId, ownerId), cursorCondition(creativeDocuments.updatedAt, creativeDocuments.id, p.cursor), p.projectId ? eq(creativeDocuments.projectId, p.projectId) : undefined, p.q ? ilike(creativeDocuments.title, `%${p.q}%`) : undefined)).orderBy(desc(pageTime(creativeDocuments.updatedAt)), desc(creativeDocuments.id)).limit(p.limit + 1)
  const page = pageResult(rows, p.limit)
  return { ...page, items: page.items.map(r => ({ id: r.id, projectId: r.projectId, title: r.title, kind: r.kind, currentVersion: r.currentVersion, summary: r.summary, updatedAt: r.createdAt.toISOString() })) }
}
export async function versionsPage(ownerId: string, id: string, query: Record<string, unknown>) {
  await ownedDocument(ownerId, id)
  const p = pageQuery(query)
  const rows = await useDatabase().select({ id: creativeDocumentVersions.id, version: creativeDocumentVersions.version, source: creativeDocumentVersions.source, createdAt: creativeDocumentVersions.createdAt }).from(creativeDocumentVersions).where(and(eq(creativeDocumentVersions.documentId, id), cursorCondition(creativeDocumentVersions.createdAt, creativeDocumentVersions.id, p.cursor))).orderBy(desc(pageTime(creativeDocumentVersions.createdAt)), desc(creativeDocumentVersions.id)).limit(p.limit + 1)
  const page = pageResult(rows, p.limit)
  return { ...page, items: page.items.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) }
}
export async function saveVersion(ownerId: string, id: string, input: unknown) {
  const body = z.object({ baseVersionId: z.uuid(), content: textCreationContentSchema }).parse(input)
  return await saveManualDocumentVersion(ownerId, id, body.content, body.baseVersionId)
}
