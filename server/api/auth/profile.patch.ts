import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { users } from '../../database/schema'
import { requireUser, toPublicUser } from '../../utils/auth'

const schema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.union([z.url().max(2048), z.literal('')]).optional(),
}).refine(value => value.displayName !== undefined || value.avatarUrl !== undefined)

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: '个人资料无效' })
  const [updated] = await useDatabase().update(users).set({
    ...parsed.data,
    avatarUrl: parsed.data.avatarUrl || null,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id)).returning()
  return await toPublicUser(updated!)
})
