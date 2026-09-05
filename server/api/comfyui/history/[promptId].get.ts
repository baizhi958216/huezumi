import { and, eq } from 'drizzle-orm'
import { useDatabase } from '../../../database/client'
import { comfyExecutions } from '../../../database/schema'
import { fetchHistoryEntry } from '../../../services/comfyui/client'
import { requireAdmin } from '../../../utils/auth'
import { withComfyUpstream } from '../../../utils/comfyui'

const PROMPT_ID_PATTERN = /^[0-9a-f-]{8,64}$/i

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const promptId = String(getRouterParam(event, 'promptId') || '')
  if (!PROMPT_ID_PATTERN.test(promptId)) {
    throw createError({ statusCode: 422, statusMessage: '任务 ID 无效' })
  }
  const [owned] = await useDatabase().select({ id: comfyExecutions.id }).from(comfyExecutions).where(and(eq(comfyExecutions.promptId, promptId), eq(comfyExecutions.ownerId, user.id))).limit(1)
  if (!owned)
    throw createError({ statusCode: 404, statusMessage: '工作流执行不存在' })

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
