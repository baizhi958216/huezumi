import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { sessions, users } from '../../database/schema'
import { createSession, hashPassword, requireUser, toPublicUser, verifyPassword } from '../../utils/auth'

const schema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: '密码格式无效，新密码至少需要 10 个字符' })

  const [stored] = await useDatabase().select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1)
  if (!stored || !await verifyPassword(parsed.data.currentPassword, stored.passwordHash))
    throw createError({ statusCode: 401, statusMessage: '当前密码不正确' })

  const passwordHash = await hashPassword(parsed.data.newPassword)
  const [updated] = await useDatabase().transaction(async (tx) => {
    const [nextUser] = await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id)).returning()
    await tx.delete(sessions).where(eq(sessions.userId, user.id))
    return [nextUser] as const
  })
  if (!updated)
    throw createError({ statusCode: 500, statusMessage: '密码修改失败，请稍后重试' })

  await createSession(event, user.id)
  return await toPublicUser(updated)
})
