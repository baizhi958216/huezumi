import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { creativeDocuments, creativeDocumentVersions, creativeProjects, ledgerEntries, runs, works } from '../../database/schema'
import { generateTextContent } from '../text-creation'
import { runRequestSchema } from './schemas'

export async function failRunJob(id: string) {
  await useDatabase().update(runs).set({ status: 'UNKNOWN', stage: 'review', settlementStatus: 'review', error: '执行结果不明，请管理员核对；不会自动重新生成。', updatedAt: new Date() }).where(and(eq(runs.id, id), inArray(runs.status, ['PENDING', 'RUNNING', 'UNKNOWN'])))
}
export async function runTextJob(id: string) {
  const db = useDatabase()
  const [row] = await db.update(runs).set({ status: 'RUNNING', stage: 'submitting', updatedAt: new Date() }).where(and(eq(runs.id, id), eq(runs.stage, 'queued'))).returning()
  if (!row) {
    const [existing] = await db.select().from(runs).where(eq(runs.id, id))
    if (existing?.stage === 'submitting')
      await failRunJob(id)
    return
  }
  const request = runRequestSchema.parse(row.request)
  if (request.kind !== 'text' || !row.connectionVersionId || !row.projectId)
    throw new Error('Invalid text run')
  try {
    const generated = await generateTextContent(request.input, row.connectionVersionId, request.model)
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(runs).where(eq(runs.id, id)).for('update')
      if (!locked || !['reserved', 'review'].includes(locked.settlementStatus) || locked.resultVersionId)
        return
      let documentId = request.input.documentId
      let currentVersionId: string | null = null
      if (documentId) {
        await tx.execute(sql`select id from creative_documents where id=${documentId} and owner_id=${row.ownerId} for update`)
        const [doc] = await tx.select().from(creativeDocuments).where(and(eq(creativeDocuments.id, documentId), eq(creativeDocuments.ownerId, row.ownerId)))
        if (!doc)
          throw new Error('Document missing after generation')
        currentVersionId = doc.currentVersionId
      }
      else {
        const [doc] = await tx.insert(creativeDocuments).values({ ownerId: row.ownerId, projectId: row.projectId!, kind: request.input.kind, title: generated.content.title }).returning()
        documentId = doc!.id
      }
      const [last] = await tx.select({ version: creativeDocumentVersions.version }).from(creativeDocumentVersions).where(eq(creativeDocumentVersions.documentId, documentId)).orderBy(desc(creativeDocumentVersions.version)).limit(1)
      const [version] = await tx.insert(creativeDocumentVersions).values({ documentId, version: (last?.version || 0) + 1, source: 'ai', provider: request.connectionId, model: request.model, promptSnapshot: request.input, content: generated.content }).returning()
      const needsReview = Boolean(request.input.documentId && currentVersionId !== row.baseVersionId)
      if (!needsReview)
        await tx.update(creativeDocuments).set({ currentVersionId: version!.id, title: generated.content.title, updatedAt: new Date() }).where(eq(creativeDocuments.id, documentId))
      await tx.update(creativeProjects).set({ updatedAt: new Date(), lastActiveStage: 'article' }).where(eq(creativeProjects.id, row.projectId!))
      await tx.update(runs).set({ status: 'SUCCEEDED', stage: 'complete', settlementStatus: 'settled', chargedCredits: row.reservedCredits, resultVersionId: version!.id, needsReview, updatedAt: new Date() }).where(eq(runs.id, id))
      await tx.execute(sql`update wallets set balance_credits=balance_credits-${row.reservedCredits}, reserved_credits=reserved_credits-${row.reservedCredits}, updated_at=now() where user_id=${row.ownerId}`)
      await tx.insert(ledgerEntries).values({ userId: row.ownerId, runId: id, type: 'charge', amountCredits: -row.reservedCredits, idempotencyKey: `run:${id}:settle`, reason: '文本版本保存成功' })
      await tx.insert(works).values({ ownerId: row.ownerId, projectId: row.projectId, runId: id, kind: 'text', title: generated.content.title, summary: generated.content.summary, documentId, versionId: version!.id, sourceKey: `document:${documentId}`, availability: 'available' }).onConflictDoUpdate({ target: works.sourceKey, set: needsReview ? { summary: sql`${works.summary}` } : { title: generated.content.title, summary: generated.content.summary, versionId: version!.id, runId: id } })
    })
  }
  catch (error) {
    const e = error as {
      statusCode?: number
      data?: {
        code?: string
      }
    }
    const definite = e.statusCode && e.data?.code !== 'SUBMISSION_UNKNOWN' && e.data?.code !== 'CONNECTION_REVOKED'
    if (!definite) {
      await failRunJob(id)
      return
    }
    await db.transaction(async (tx) => {
      const claimed = await tx.update(runs).set({ status: 'FAILED', stage: 'complete', settlementStatus: 'released', error: '文本生成失败，预留额度已释放。', updatedAt: new Date() }).where(and(eq(runs.id, id), eq(runs.settlementStatus, 'reserved'))).returning()
      if (!claimed.length)
        return
      await tx.execute(sql`update wallets set reserved_credits=reserved_credits-${row.reservedCredits}, updated_at=now() where user_id=${row.ownerId}`)
      await tx.insert(ledgerEntries).values({ userId: row.ownerId, runId: id, type: 'release', amountCredits: row.reservedCredits, idempotencyKey: `run:${id}:settle`, reason: '文本生成明确失败' })
    })
  }
}
