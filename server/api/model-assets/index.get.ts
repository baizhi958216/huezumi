import { and, desc, eq, isNull } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { modelAssets } from '../../database/schema'
import { toModelAssetSummary } from '../../services/model-assets'
import { requireUser } from '../../utils/auth'
import { cursorCondition, pageQuery, pageResult, pageTime } from '../../utils/pagination'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const p = pageQuery(getQuery(event))
  const rows = await useDatabase().select().from(modelAssets).where(and(eq(modelAssets.ownerId, user.id), isNull(modelAssets.deletedAt), cursorCondition(modelAssets.createdAt, modelAssets.id, p.cursor))).orderBy(desc(pageTime(modelAssets.createdAt)), desc(modelAssets.id)).limit(p.limit + 1)
  const page = pageResult(rows, p.limit)
  return { ...page, items: page.items.map(r => toModelAssetSummary(r)) }
})
