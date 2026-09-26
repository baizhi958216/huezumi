import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { eq, sql } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { assetReservations, assets } from '../../database/schema'
import { assetSaveDiagnostic, assetSaveError } from '../../utils/asset-save-error'
import { requireUser } from '../../utils/auth'
import { mediaSignatureMatches } from '../../utils/media-signature'
import { buildOssObjectKey, createOssUploader } from '../../utils/oss'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.data)
  if (!file)
    throw createError({ statusCode: 400, statusMessage: '请选择要上传的素材' })
  const maxSize = file.type?.startsWith('video/') ? 100 * 1024 * 1024 : 20 * 1024 * 1024
  if (file.data.length > maxSize)
    throw createError({ statusCode: 413, statusMessage: '素材文件过大' })

  const id = crypto.randomUUID()
  const reservationId = crypto.randomUUID()
  const name = file.filename || 'asset'
  const contentType = file.type || 'application/octet-stream'
  if (!mediaSignatureMatches(file.data, contentType))
    throw createError({ statusCode: 415, statusMessage: '文件内容与受支持的图片、视频或音频类型不匹配' })
  const db = useDatabase()
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from users where id = ${user.id} for update`)
    const usage = await tx.execute(sql`
      select
        coalesce((select sum(size) from assets where owner_id = ${user.id} and deleted_at is null), 0)
        + coalesce((select sum(size) from asset_reservations where owner_id = ${user.id} and expires_at > now()), 0) as used
    `)
    if (Number((usage.rows[0] as { used?: number } | undefined)?.used || 0) + file.data.length > user.storageLimitBytes)
      throw createError({ statusCode: 413, statusMessage: '个人存储空间不足' })
    await tx.insert(assetReservations).values({ id: reservationId, ownerId: user.id, size: file.data.length, expiresAt: new Date(Date.now() + 30 * 60 * 1000) })
  })
  let uploader: ReturnType<typeof createOssUploader>
  let stage: 'storage' | 'database' = 'storage'
  let operation = 'create-uploader'
  let objectKey: string | undefined
  let localStorageKey: string | undefined
  try {
    uploader = createOssUploader()
    if (uploader) {
      operation = 'build-object-key'
      const config = useRuntimeConfig(event)
      objectKey = buildOssObjectKey(`${String(config.ossPrefix || 'huezumi/uploads').replace(/^\/+|\/+$/g, '')}/${user.id}`, id, name)
      operation = 'upload-object'
      await uploader.upload(objectKey, file.data, contentType)
    }
    else {
      if (process.env.NODE_ENV === 'production')
        throw createError({ statusCode: 503, statusMessage: '生产环境必须配置私有对象存储' })
      localStorageKey = `uploads:${user.id}:${id}`
      await useStorage('data').setItemRaw(localStorageKey, file.data)
    }
    stage = 'database'
    await db.transaction(async (tx) => {
      await tx.insert(assets).values({ id, ownerId: user.id, name, contentType, size: file.data.length, objectKey, localStorageKey })
      await tx.delete(assetReservations).where(eq(assetReservations.id, reservationId))
    })
  }
  catch (error) {
    await db.delete(assetReservations).where(eq(assetReservations.id, reservationId)).catch(() => {})
    if (objectKey && uploader)
      await uploader.delete(objectKey).catch(() => {})
    if (localStorageKey)
      await useStorage('data').removeItem(localStorageKey).catch(() => {})
    if ((error as { statusCode?: number }).statusCode)
      throw error
    const failure = assetSaveError(error, stage)
    await writeFile('/tmp/huezumi-upload-failure.json', JSON.stringify({ stage, operation, ...assetSaveDiagnostic(error), frames: error instanceof Error ? error.stack?.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 5) : [] }), { mode: 0o600 })
    console.error('Failed to persist private material', { stage, operation, code: failure.code, ...assetSaveDiagnostic(error), requestId: event.context.requestId })
    throw createError({ statusCode: 502, statusMessage: failure.message, data: { code: failure.code } })
  }
  return { id, name, type: contentType, size: file.data.length, createdAt: new Date().toISOString(), url: `/api/files/${id}` }
})
