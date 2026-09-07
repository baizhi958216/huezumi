import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { invitationCodes, users, wallets } from '../../database/schema'
import { createSession, hashPassword, hashToken, normalizeEmail, registrationMode, toPublicUser } from '../../utils/auth'

const schema = z.object({
  email: z.email().max(254),
  password: z.string().min(10).max(128),
  displayName: z.string().trim().min(1).max(80),
  invitationCode: z.string().trim().max(120).optional(),
})

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: parsed.error.issues[0]?.message || '注册信息无效' })
  const mode = registrationMode()
  if (mode === 'disabled')
    throw createError({ statusCode: 403, statusMessage: '当前未开放注册' })
  if (mode === 'invite' && !parsed.data.invitationCode)
    throw createError({ statusCode: 422, statusMessage: '请输入邀请码' })

  const db = useDatabase()
  const email = normalizeEmail(parsed.data.email)
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length)
    throw createError({ statusCode: 409, statusMessage: '该邮箱已经注册' })

  const passwordHash = await hashPassword(parsed.data.password)
  const user = await db.transaction(async (tx) => {
    let invitationId: string | undefined
    if (mode === 'invite') {
      const [invitation] = await tx.select({ id: invitationCodes.id }).from(invitationCodes).where(and(
        eq(invitationCodes.codeHash, hashToken(parsed.data.invitationCode!)),
        isNull(invitationCodes.usedAt),
        gt(invitationCodes.expiresAt, new Date()),
      )).limit(1)
      if (!invitation)
        throw createError({ statusCode: 422, statusMessage: '邀请码无效或已过期' })
      invitationId = invitation.id
    }

    const [created] = await tx.insert(users).values({ email, displayName: parsed.data.displayName, passwordHash }).returning()
    if (!created)
      throw createError({ statusCode: 500, statusMessage: '创建帐号失败' })
    await tx.insert(wallets).values({ userId: created.id, balanceCredits: Number(useRuntimeConfig().signupCredits || 0) })
    if (invitationId) {
      const claimed = await tx.update(invitationCodes).set({ usedBy: created.id, usedAt: new Date() }).where(and(
        eq(invitationCodes.id, invitationId),
        isNull(invitationCodes.usedAt),
      )).returning({ id: invitationCodes.id })
      if (!claimed.length)
        throw createError({ statusCode: 409, statusMessage: '邀请码刚刚已被使用，请换一个邀请码' })
    }
    return created
  }).catch((error: unknown) => {
    if ((error as { code?: string }).code === '23505')
      throw createError({ statusCode: 409, statusMessage: '邮箱或邀请码已经被使用' })
    throw error
  })
  await createSession(event, user.id)
  return await toPublicUser(user)
})
