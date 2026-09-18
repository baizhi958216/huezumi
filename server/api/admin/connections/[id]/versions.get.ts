import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../../../database/client'
import { connectionVersions } from '../../../../database/schema'
import { requireAdmin } from '../../../../utils/auth'
import { cursorCondition, pageQuery, pageResult, pageTime } from '../../../../utils/pagination'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const p = pageQuery(getQuery(event))
  const rows = await useDatabase().select({ id: connectionVersions.id, version: connectionVersions.version, hasCredentials: connectionVersions.hasCredentials, revokedAt: connectionVersions.revokedAt, createdAt: connectionVersions.createdAt }).from(connectionVersions).where(and(eq(connectionVersions.connectionId, id), cursorCondition(connectionVersions.createdAt, connectionVersions.id, p.cursor))).orderBy(desc(pageTime(connectionVersions.createdAt)), desc(connectionVersions.id)).limit(p.limit + 1)
  const page = pageResult(rows, p.limit)
  return { ...page, items: page.items.map(row => ({ id: row.id, version: row.version, hasCredentials: row.hasCredentials, revoked: Boolean(row.revokedAt), createdAt: row.createdAt.toISOString() })) }
})
