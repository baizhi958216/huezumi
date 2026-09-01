import { buildOssObjectKey, createOssUploader } from '../../utils/oss'

interface UploadMeta {
  id: string
  name: string
  type: string
  size: number
  createdAt: string
}

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.data)
  if (!file)
    throw createError({ statusCode: 400, statusMessage: '请选择要上传的素材' })

  const maxSize = file.type?.startsWith('video/') ? 100 * 1024 * 1024 : 20 * 1024 * 1024
  if (file.data.length > maxSize)
    throw createError({ statusCode: 413, statusMessage: '素材文件过大' })

  const id = crypto.randomUUID()
  const meta: UploadMeta = {
    id,
    name: file.filename || 'asset',
    type: file.type || 'application/octet-stream',
    size: file.data.length,
    createdAt: new Date().toISOString(),
  }

  const storage = useStorage('data')
  await storage.setItem(`uploads:${id}:meta`, meta)
  await storage.setItemRaw(`uploads:${id}:data`, file.data)

  const config = useRuntimeConfig(event)
  const configuredOrigin = String(config.public.appUrl || '').replace(/\/$/, '')
  const origin = configuredOrigin || getRequestURL(event).origin
  const localUrl = `${origin}/api/files/${id}`
  const ossUploader = createOssUploader()

  if (!ossUploader)
    return { ...meta, url: localUrl }

  try {
    const objectKey = buildOssObjectKey(
      String(config.ossPrefix || 'forkvdo/uploads').replace(/^\/+|\/+$/g, ''),
      id,
      meta.name,
    )
    const uploaded = await ossUploader.upload(objectKey, file.data, meta.type)
    return { ...meta, url: uploaded.url }
  }
  catch (error) {
    console.error('Failed to upload material to OSS', error instanceof Error ? error.message : 'unknown error')
    throw createError({
      statusCode: 502,
      statusMessage: '素材已收到，但上传到阿里云 OSS 失败，请检查 OSS 配置和权限',
    })
  }
})
