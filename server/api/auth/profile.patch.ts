import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { assets, users } from '../../database/schema'
import { requireUser, toPublicUser } from '../../utils/auth'

const avatarPath = /^\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
const schema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.union([z.string().regex(avatarPath), z.literal('')]).optional(),
}).refine(value => value.displayName !== undefined || value.avatarUrl !== undefined)

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 422, statusMessage: '个人资料无效' })

  if (parsed.data.avatarUrl) {
    const assetId = parsed.data.avatarUrl.match(avatarPath)?.[1]
    const [asset] = await useDatabase().select({ id: assets.id, contentType: assets.contentType }).from(assets).where(and(
      eq(assets.id, assetId!),
      eq(assets.ownerId, user.id),
      isNull(assets.deletedAt),
    )).limit(1)
    if (!asset || !asset.contentType.startsWith('image/'))
      throw createError({ statusCode: 422, statusMessage: '头像素材无效或不属于当前帐号' })
  }

  const [updated] = await useDatabase().update(users).set({
    ...parsed.data,
    avatarUrl: parsed.data.avatarUrl || null,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id)).returning()
  return await toPublicUser(updated!)
})
