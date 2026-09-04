import { z } from 'zod'
import { viewFile } from '../../services/comfyui/client'
import { withComfyUpstream } from '../../utils/comfyui'

const querySchema = z.object({
  filename: z.string().min(1).max(255),
  subfolder: z.string().max(255).optional(),
  // 只代理 ComfyUI 的三个受管目录，避免把仓库里的任意文件暴露出去
  type: z.enum(['input', 'output', 'temp']).default('output'),
  preview: z.string().max(64).optional(),
  channel: z.enum(['rgb', 'a']).optional(),
})

export default defineEventHandler(async (event) => {
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: '查看参数无效' })
  }

  const file = await withComfyUpstream(() => viewFile(parsed.data))
  if (!file.body) {
    throw createError({ statusCode: 502, statusMessage: 'ComfyUI 返回了空内容' })
  }

  setHeader(event, 'content-type', file.contentType)
  if (parsed.data.type === 'temp' || parsed.data.preview) {
    setHeader(event, 'cache-control', 'no-cache, no-store, must-revalidate')
  }
  else {
    setHeader(event, 'cache-control', 'private, max-age=60')
  }
  return sendStream(event, file.body)
})
