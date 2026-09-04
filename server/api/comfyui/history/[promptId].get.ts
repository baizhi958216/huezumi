import { fetchHistoryEntry } from '../../../services/comfyui/client'
import { withComfyUpstream } from '../../../utils/comfyui'

const PROMPT_ID_PATTERN = /^[0-9a-f-]{8,64}$/i

export default defineEventHandler(async (event) => {
  const promptId = String(getRouterParam(event, 'promptId') || '')
  if (!PROMPT_ID_PATTERN.test(promptId)) {
    throw createError({ statusCode: 422, statusMessage: '任务 ID 无效' })
  }

  const entry = await withComfyUpstream(() => fetchHistoryEntry(promptId))
  if (!entry) {
    return {
      promptId,
      status: {
        status_str: 'success' as const,
        completed: false,
      },
    }
  }
  return { promptId, ...entry }
})
