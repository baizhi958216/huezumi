import type { TextCreationContent, TextCreationRequest, TextDocumentSummary, TextDocumentVersionRecord } from '#shared/types/text-creation'
import { and, desc, eq } from 'drizzle-orm'
import { useDatabase } from '../database/client'
import { creativeDocuments, creativeDocumentVersions, creativeProjects } from '../database/schema'

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

export async function saveGeneratedDocument(ownerId: string, request: TextCreationRequest, generated: { connectionId: string, model: string, content: TextCreationContent }) {
  return await useDatabase().transaction(async (tx) => {
    let projectId = request.projectId
    let documentId = request.documentId
    let version = 1

    if (documentId) {
      const [document] = await tx.select({ id: creativeDocuments.id, projectId: creativeDocuments.projectId }).from(creativeDocuments).where(and(eq(creativeDocuments.id, documentId), eq(creativeDocuments.ownerId, ownerId))).limit(1)
      if (!document || (projectId && document.projectId !== projectId))
        throw createError({ statusCode: 404, statusMessage: '创作文档不存在' })
      projectId = document.projectId
      const [latest] = await tx.select({ version: creativeDocumentVersions.version }).from(creativeDocumentVersions).where(eq(creativeDocumentVersions.documentId, documentId)).orderBy(desc(creativeDocumentVersions.version)).limit(1)
      version = (latest?.version || 0) + 1
    }

    if (projectId) {
      const [project] = await tx.select({ id: creativeProjects.id }).from(creativeProjects).where(and(eq(creativeProjects.id, projectId), eq(creativeProjects.ownerId, ownerId))).limit(1)
      if (!project)
        throw createError({ statusCode: 404, statusMessage: '创作项目不存在' })
    }
    else {
      const [project] = await tx.insert(creativeProjects).values({ ownerId, name: generated.content.title }).returning({ id: creativeProjects.id })
      projectId = project!.id
    }

    if (!documentId) {
      const [document] = await tx.insert(creativeDocuments).values({ ownerId, projectId, kind: request.kind, title: generated.content.title }).returning({ id: creativeDocuments.id })
      documentId = document!.id
    }

    const [saved] = await tx.insert(creativeDocumentVersions).values({
      documentId,
      version,
      source: 'ai',
      provider: generated.connectionId,
      model: generated.model,
      promptSnapshot: request,
      content: generated.content,
    }).returning()
    await tx.update(creativeDocuments).set({ title: generated.content.title, currentVersionId: saved!.id, updatedAt: new Date() }).where(eq(creativeDocuments.id, documentId))
    await tx.update(creativeProjects).set({ updatedAt: new Date(), lastActiveStage: 'article' }).where(eq(creativeProjects.id, projectId))
    return versionRecord(saved!, projectId)
  })
}

export async function saveManualDocumentVersion(ownerId: string, documentId: string, content: TextCreationContent) {
  return await useDatabase().transaction(async (tx) => {
    const [document] = await tx.select().from(creativeDocuments).where(and(eq(creativeDocuments.id, documentId), eq(creativeDocuments.ownerId, ownerId))).limit(1)
    if (!document)
      throw createError({ statusCode: 404, statusMessage: '创作文档不存在' })
    const [latest] = await tx.select({ version: creativeDocumentVersions.version }).from(creativeDocumentVersions).where(eq(creativeDocumentVersions.documentId, documentId)).orderBy(desc(creativeDocumentVersions.version)).limit(1)
    const [saved] = await tx.insert(creativeDocumentVersions).values({ documentId, version: (latest?.version || 0) + 1, source: 'manual', content }).returning()
    await tx.update(creativeDocuments).set({ title: content.title, currentVersionId: saved!.id, updatedAt: new Date() }).where(eq(creativeDocuments.id, documentId))
    await tx.update(creativeProjects).set({ updatedAt: new Date() }).where(eq(creativeProjects.id, document.projectId))
    return versionRecord(saved!, document.projectId)
  })
}

export async function listCreativeDocuments(ownerId: string): Promise<TextDocumentSummary[]> {
  const rows = await useDatabase().select({
    id: creativeDocuments.id,
    projectId: creativeDocuments.projectId,
    title: creativeDocuments.title,
    kind: creativeDocuments.kind,
    updatedAt: creativeDocuments.updatedAt,
    content: creativeDocumentVersions.content,
    version: creativeDocumentVersions.version,
  }).from(creativeDocuments).innerJoin(creativeDocumentVersions, eq(creativeDocuments.currentVersionId, creativeDocumentVersions.id)).where(eq(creativeDocuments.ownerId, ownerId)).orderBy(desc(creativeDocuments.updatedAt)).limit(30)
  return rows.map(row => ({ ...row, currentVersion: row.version, summary: row.content.summary, updatedAt: row.updatedAt.toISOString() }))
}

export async function listDocumentVersions(ownerId: string, documentId: string) {
  const [document] = await useDatabase().select({ id: creativeDocuments.id, projectId: creativeDocuments.projectId }).from(creativeDocuments).where(and(eq(creativeDocuments.id, documentId), eq(creativeDocuments.ownerId, ownerId))).limit(1)
  if (!document)
    throw createError({ statusCode: 404, statusMessage: '创作文档不存在' })
  const rows = await useDatabase().select().from(creativeDocumentVersions).where(eq(creativeDocumentVersions.documentId, documentId)).orderBy(desc(creativeDocumentVersions.version))
  return rows.map(row => versionRecord(row, document.projectId))
}
