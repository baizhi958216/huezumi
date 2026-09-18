import { and, desc, eq, isNull } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { assets } from '../../database/schema'
import { requireUser } from '../../utils/auth'
import { cursorCondition, pageQuery, pageResult, pageTime } from '../../utils/pagination'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const p = pageQuery(getQuery(event))
  const rows = await useDatabase().select({ id: assets.id, name: assets.name, contentType: assets.contentType, size: assets.size, createdAt: assets.createdAt }).from(assets).where(and(eq(assets.ownerId, user.id), isNull(assets.deletedAt), cursorCondition(assets.createdAt, assets.id, p.cursor))).orderBy(desc(pageTime(assets.createdAt)), desc(assets.id)).limit(p.limit + 1)
  const page = pageResult(rows, p.limit)
  return { ...page, items: page.items.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), url: `/api/assets/${r.id}/content` })) }
})
