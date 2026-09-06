import type { ModelAssetSummary } from '#shared/types/account'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { useDatabase } from '../database/client'
import { modelAssetFiles, modelAssets } from '../database/schema'

type ModelAssetRow = typeof modelAssets.$inferSelect

interface FileSummary {
  fileCount: number
  sizeBytes: number
}

export function toModelAssetSummary(row: ModelAssetRow, files: FileSummary = { fileCount: 0, sizeBytes: 0 }): ModelAssetSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    source: row.source,
    sourceRef: row.sourceRef || undefined,
    baseModel: row.baseModel || undefined,
    description: row.description || undefined,
    triggerWords: row.triggerWords,
    visibility: row.visibility,
    status: row.status,
    sizeBytes: row.sizeBytes || files.sizeBytes,
    fileCount: files.fileCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listOwnedModelAssets(ownerId: string, limit = 100): Promise<ModelAssetSummary[]> {
  const db = useDatabase()
  const rows = await db.select()
    .from(modelAssets)
    .where(and(eq(modelAssets.ownerId, ownerId), isNull(modelAssets.deletedAt)))
    .orderBy(desc(modelAssets.updatedAt))
    .limit(limit)

  if (!rows.length)
    return []

  const ids = rows.map(row => row.id)
  const fileRows = await db.select({
    modelAssetId: modelAssetFiles.modelAssetId,
    fileCount: sql<number>`count(*)::int`,
    sizeBytes: sql<number>`coalesce(sum(${modelAssetFiles.sizeBytes}), 0)::bigint`,
  })
    .from(modelAssetFiles)
    .where(inArray(modelAssetFiles.modelAssetId, ids))
    .groupBy(modelAssetFiles.modelAssetId)
  const fileMap = new Map(fileRows.map(row => [row.modelAssetId, { fileCount: Number(row.fileCount), sizeBytes: Number(row.sizeBytes) }]))

  return rows.map(row => toModelAssetSummary(row, fileMap.get(row.id)))
}
