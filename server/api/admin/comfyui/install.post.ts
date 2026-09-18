import { z } from 'zod'
import { startInstall } from '../../../services/comfyui/installer'

const bodySchema = z.object({
  installDeps: z.boolean().optional(),
})
/**
 * 触发安装任务。克隆与依赖安装可能持续数十分钟，
 * 因此这里立即返回 202，进度通过 GET /api/comfyui/status 轮询。
 */
export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: '安装参数无效' })
  }
  const state = startInstall({ installDeps: parsed.data.installDeps ?? true })
  setResponseStatus(event, 202)
  return state
})
