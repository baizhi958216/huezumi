import { and, desc, eq, ilike } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { creativeProjects } from '../../database/schema'
import { requireUser } from '../../utils/auth'
import { cursorCondition, pageQuery, pageResult, pageTime } from '../../utils/pagination'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const p = pageQuery(getQuery(event))
  const rows = await useDatabase().select().from(creativeProjects).where(and(eq(creativeProjects.ownerId, user.id), cursorCondition(creativeProjects.updatedAt, creativeProjects.id, p.cursor), p.q ? ilike(creativeProjects.name, `%${p.q}%`) : undefined)).orderBy(desc(pageTime(creativeProjects.updatedAt)), desc(creativeProjects.id)).limit(p.limit + 1)
  const page = pageResult(rows.map(r => ({ ...r, createdAt: r.updatedAt })), p.limit)
  return { ...page, items: page.items.map(r => ({ id: r.id, name: r.name, status: r.status, updatedAt: r.updatedAt.toISOString() })) }
})
