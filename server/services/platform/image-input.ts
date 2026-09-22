import type { ImageGenerationRequest } from '#shared/types/image-generation'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { assets } from '../../database/schema'
import { createOssUploader } from '../../utils/oss'

export async function resolveImageInputs(ownerId: string, input: ImageGenerationRequest) {
  const uploader = createOssUploader()
  if (!uploader)
    throw createError({ statusCode: 503, statusMessage: '图片存储尚未配置，请联系管理员' })
  if (!input.images.length)
    return []
  const ids = input.images.map(url => url.split('/')[3]!)
  const rows = await useDatabase().select().from(assets).where(and(eq(assets.ownerId, ownerId), inArray(assets.id, ids), isNull(assets.deletedAt)))
  return await Promise.all(ids.map(async (id) => {
    const asset = rows.find(row => row.id === id)
    if (!asset?.objectKey || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.contentType) || asset.size > 10 * 1024 * 1024)
      throw createError({ statusCode: 422, statusMessage: '参考图不存在或格式不支持，请上传不超过 10 MB 的 PNG、JPEG 或 WebP 图片' })
    return await uploader.sign(asset.objectKey, 3600)
  }))
}
