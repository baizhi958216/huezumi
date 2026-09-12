import { and, eq } from 'drizzle-orm'
import { useDatabase } from '../../../database/client'
import { generations } from '../../../database/schema'
import { requireUser } from '../../../utils/auth'
import { createOssUploader } from '../../../utils/oss'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id') || ''
  const conditions = user.role === 'admin' ? eq(generations.id, id) : and(eq(generations.id, id), eq(generations.ownerId, user.id))
  const [record] = await useDatabase().select().from(generations).where(conditions).limit(1)
  const objectKey = (record?.outputArchive as { objectKey?: string } | null)?.objectKey
  if (!record || !objectKey)
    throw createError({ statusCode: 404, statusMessage: '生成结果不存在' })

  // Historical records may point to the original public Alibaba OSS URL while
  // the current local development process is configured to use MinIO. Keep
  // those imported archives playable without changing the active OSS config.
  if (record.videoArchived && record.videoUrl && /^https:\/\/[^/]+\.aliyuncs\.com\//i.test(record.videoUrl))
    return sendRedirect(event, record.videoUrl, 302)

  const uploader = createOssUploader()
  if (!uploader)
    throw createError({ statusCode: 503, statusMessage: '对象存储尚未配置' })
  return sendRedirect(event, await uploader.sign(objectKey, 900), 302)
})
