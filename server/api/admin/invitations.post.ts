import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { invitationCodes } from '../../database/schema'
import { hashToken, requireAdmin } from '../../utils/auth'

const schema = z.object({ expiresInDays: z.number().int().min(1).max(365).default(14) })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const parsed = schema.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: '邀请码有效期无效' })
  const code = randomBytes(18).toString('base64url')
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86400000)
  await useDatabase().insert(invitationCodes).values({ codeHash: hashToken(code), createdBy: admin.id, expiresAt })
  return { code, expiresAt: expiresAt.toISOString() }
})
