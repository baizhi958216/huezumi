import { desc, eq } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { auditLogs, users } from '../../database/schema'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await useDatabase().select({
    id: auditLogs.id,
    action: auditLogs.action,
    targetType: auditLogs.targetType,
    targetId: auditLogs.targetId,
    detail: auditLogs.detail,
    createdAt: auditLogs.createdAt,
    actorEmail: users.email,
  }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId)).orderBy(desc(auditLogs.createdAt)).limit(200)
})
