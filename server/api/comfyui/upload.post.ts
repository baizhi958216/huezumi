import { uploadImage } from '../../services/comfyui/client'
import { invalidateObjectInfo } from '../../services/comfyui/state'
import { withComfyUpstream } from '../../utils/comfyui'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff']

/**
 * 把图片转存到 ComfyUI 的 input 目录，供 LoadImage 等节点选择。
 * 上传成功必须失效 object_info 缓存，否则 COMBO 里看不到新文件。
 */
export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'image' && part.data)
  if (!file)
    throw createError({ statusCode: 400, statusMessage: '请选择要上传的图片' })

  if (file.data.length > MAX_IMAGE_BYTES)
    throw createError({ statusCode: 413, statusMessage: '图片过大，上限 20MB' })

  if (file.type && !ALLOWED_TYPES.includes(file.type)) {
    throw createError({ statusCode: 415, statusMessage: `不支持的图片类型：${file.type}` })
  }

  const filename = file.filename || `upload-${Date.now()}.png`
  // h3 的 part.data 是 Node Buffer<ArrayBufferLike>，而 Blob 期望 BlobPart
  // （ArrayBufferView<ArrayBuffer>）。直接转成 Uint8Array 拷贝以满足类型契约，
  // 同时避免与原 Buffer 共享底层内存带来的副作用。
  const view = new Uint8Array(file.data)
  const blob = new Blob([view], { type: file.type || 'image/png' })
  const uploaded = await withComfyUpstream(() => uploadImage(blob, filename))
  invalidateObjectInfo()
  return uploaded
})
