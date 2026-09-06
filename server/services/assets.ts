import type { GenerationRequest } from '#shared/types/generation'
import { and, eq, inArray } from 'drizzle-orm'
import { useDatabase } from '../database/client'
import { assets } from '../database/schema'
import { createOssUploader } from '../utils/oss'

const ASSET_URL = /^\/api\/files\/([0-9a-f-]{36})$/i

export async function resolveProviderMediaUrls(ownerId: string, request: GenerationRequest): Promise<GenerationRequest> {
  const ids = request.media.map(item => item.url.match(ASSET_URL)?.[1]).filter((id): id is string => Boolean(id))
  if (!ids.length)
    return request
  const rows = await useDatabase().select().from(assets).where(and(eq(assets.ownerId, ownerId), inArray(assets.id, ids)))
  const byId = new Map(rows.map(item => [item.id, item]))
  const uploader = createOssUploader()
  const media = await Promise.all(request.media.map(async (item) => {
    const id = item.url.match(ASSET_URL)?.[1]
    if (!id)
      return item
    const asset = byId.get(id)
    if (!asset)
      throw createError({ statusCode: 422, statusMessage: '素材不存在或不属于当前用户' })
    if (!asset.objectKey || !uploader)
      throw createError({ statusCode: 422, statusMessage: '本地素材无法交给远程供应商，请配置 OSS' })
    return { ...item, url: await uploader.sign(asset.objectKey, Number(useRuntimeConfig().ossSignedUrlTtlSeconds || 86400)) }
  }))
  return {
    ...request,
    media,
  }
}
