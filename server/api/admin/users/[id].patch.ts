import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../../database/client'
import { auditLogs, sessions, users } from '../../../database/schema'
import { requireAdmin } from '../../../utils/auth'

const schema = z.object({ status: z.enum(['active', 'disabled']).optional(), role: z.enum(['user', 'admin']).optional(), storageLimitBytes: z.number().int().min(0).optional() })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: '用户修改内容无效' })
  if (id === admin.id && (parsed.data.status === 'disabled' || parsed.data.role === 'user'))
    throw createError({ statusCode: 409, statusMessage: '不能停用当前管理员或移除自己的管理员角色' })
  const db = useDatabase()
  const [updated] = await db.update(users).set({ ...parsed.data, updatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id })
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: '用户不存在' })
  if (parsed.data.status === 'disabled')
    await db.delete(sessions).where(eq(sessions.userId, id))
  await db.insert(auditLogs).values({ actorUserId: admin.id, action: 'user.update', targetType: 'user', targetId: id, detail: parsed.data })
  return { ok: true }
})
