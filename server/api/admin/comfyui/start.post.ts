import { startComfy } from '../../../services/comfyui/process'

export default defineEventHandler(async () => {
  try {
    return await startComfy()
  }
  catch (error) {
    const candidate = error as {
      statusCode?: number
      statusMessage?: string
      message?: string
    }
    throw createError({
      statusCode: candidate.statusCode || 500,
      statusMessage: candidate.statusMessage || candidate.message || '启动 ComfyUI 失败',
    })
  }
})
