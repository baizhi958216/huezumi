import { and, eq, isNull } from 'drizzle-orm'
import { useDatabase } from '../../../database/client'
import { invitationCodes } from '../../../database/schema'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: '缺少邀请码 ID' })
  }

  const db = useDatabase()
  const [existing] = await db.select({
    id: invitationCodes.id,
    usedAt: invitationCodes.usedAt,
  }).from(invitationCodes).where(eq(invitationCodes.id, id)).limit(1)

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: '未找到该邀请码' })
  }

  if (existing.usedAt) {
    throw createError({ statusCode: 400, statusMessage: '已被使用的邀请码无法删除' })
  }

  await db.delete(invitationCodes).where(and(eq(invitationCodes.id, id), isNull(invitationCodes.usedAt)))

  return { success: true }
})
