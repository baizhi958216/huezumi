import { and, eq } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { assets } from '../../database/schema'
import { requireUser } from '../../utils/auth'
import { createOssUploader } from '../../utils/oss'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const conditions = user.role === 'admin' ? eq(assets.id, id) : and(eq(assets.id, id), eq(assets.ownerId, user.id))
  const [asset] = await useDatabase().select().from(assets).where(conditions).limit(1)
  if (!asset || asset.deletedAt)
    throw createError({ statusCode: 404, statusMessage: '素材不存在或已过期' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  if (asset.objectKey) {
    const uploader = createOssUploader()
    if (!uploader)
      throw createError({ statusCode: 503, statusMessage: '对象存储尚未配置' })
    return sendRedirect(event, await uploader.sign(asset.objectKey, 900), 302)
  }
  if (!asset.localStorageKey)
    throw createError({ statusCode: 404, statusMessage: '素材内容不存在' })
  const data = await useStorage('data').getItemRaw<Uint8Array>(asset.localStorageKey)
  if (!data)
    throw createError({ statusCode: 404, statusMessage: '素材内容不存在' })
  setHeader(event, 'Content-Type', asset.contentType)
  setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`)
  return data
})
