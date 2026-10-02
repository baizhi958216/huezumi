import { and, desc, eq, inArray } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { runs, users } from '../../database/schema'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await useDatabase().select({ id: runs.id, ownerEmail: users.email, kind: runs.kind, reservedCredits: runs.reservedCredits, error: runs.error }).from(runs).innerJoin(users, eq(runs.ownerId, users.id)).where(and(inArray(runs.kind, ['text', 'image', 'workflow']), eq(runs.settlementStatus, 'review'))).orderBy(desc(runs.createdAt)).limit(100)
})
