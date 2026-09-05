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
  const uploader = createOssUploader()
  if (!uploader)
    throw createError({ statusCode: 503, statusMessage: '对象存储尚未配置' })
  return sendRedirect(event, uploader.sign(objectKey, 900), 302)
})
