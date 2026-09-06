import { uploadImage } from '../../services/comfyui/client'
import { invalidateObjectInfo } from '../../services/comfyui/state'
import { withComfyUpstream } from '../../utils/comfyui'

type UploadKind = 'image' | 'audio' | 'video'

const MAX_BYTES: Record<UploadKind, number> = {
  image: 20 * 1024 * 1024,
  audio: 200 * 1024 * 1024,
  video: 200 * 1024 * 1024,
}

const ALLOWED_TYPES: Record<UploadKind, string[]> = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'video/mp4', 'video/webm', 'video/quicktime'],
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/avi', 'video/mpeg'],
}

const ALLOWED_EXTENSIONS: Record<UploadKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'],
  audio: ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'flac', 'aac', 'webm', 'mp4', 'mov'],
  video: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'mpeg', 'mpg'],
}

function isUploadKind(value: string): value is UploadKind {
  return value === 'image' || value === 'audio' || value === 'video'
}

function hasAllowedType(kind: UploadKind, filename: string, mimeType?: string) {
  if (mimeType && (ALLOWED_TYPES[kind].includes(mimeType) || (kind === 'audio' && mimeType.startsWith('audio/')) || (kind === 'video' && mimeType.startsWith('video/'))))
    return true
  const extension = filename.toLowerCase().split('.').pop() || ''
  return ALLOWED_EXTENSIONS[kind].includes(extension)
}

/**
 * 把图片转存到 ComfyUI 的 input 目录，供 LoadImage 等节点选择。
 * 上传成功必须失效 object_info 缓存，否则 COMBO 里看不到新文件。
 */
export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => (part.name === 'file' || part.name === 'image') && part.data)
  if (!file)
    throw createError({ statusCode: 400, statusMessage: '请选择要上传的文件' })

  const kindValue = parts?.find(part => part.name === 'kind')?.data?.toString() || 'image'
  if (!isUploadKind(kindValue))
    throw createError({ statusCode: 400, statusMessage: '不支持的上传类型' })

  if (file.data.length > MAX_BYTES[kindValue])
    throw createError({ statusCode: 413, statusMessage: `${kindValue === 'image' ? '图片' : kindValue === 'audio' ? '音频' : '视频'}过大，上限 ${kindValue === 'image' ? '20MB' : '200MB'}` })

  if (!hasAllowedType(kindValue, file.filename || '', file.type))
    throw createError({ statusCode: 415, statusMessage: `不支持的${kindValue === 'image' ? '图片' : kindValue === 'audio' ? '音频' : '视频'}类型：${file.type || file.filename || '未知'}` })

  const defaultExtension = kindValue === 'image' ? 'png' : kindValue === 'audio' ? 'mp3' : 'mp4'
  const filename = file.filename || `upload-${Date.now()}.${defaultExtension}`
  // h3 的 part.data 是 Node Buffer<ArrayBufferLike>，而 Blob 期望 BlobPart
  // （ArrayBufferView<ArrayBuffer>）。直接转成 Uint8Array 拷贝以满足类型契约，
  // 同时避免与原 Buffer 共享底层内存带来的副作用。
  const view = new Uint8Array(file.data)
  const blob = new Blob([view], { type: file.type || 'application/octet-stream' })
  const uploaded = await withComfyUpstream(() => uploadImage(blob, filename))
  invalidateObjectInfo()
  return uploaded
})
