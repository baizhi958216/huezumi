import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { users } from '../../database/schema'
import { createSession, normalizeEmail, toPublicUser, verifyPassword } from '../../utils/auth'

const schema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) })

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: '邮箱或密码格式无效' })
  const [user] = await useDatabase().select().from(users).where(eq(users.email, normalizeEmail(parsed.data.email))).limit(1)
  if (!user || !await verifyPassword(parsed.data.password, user.passwordHash))
    throw createError({ statusCode: 401, statusMessage: '邮箱或密码错误' })
  if (user.status !== 'active')
    throw createError({ statusCode: 403, statusMessage: '帐号尚未启用或已被停用' })
  await createSession(event, user.id)
  return await toPublicUser(user)
})
