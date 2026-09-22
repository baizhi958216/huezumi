import { and, eq } from 'drizzle-orm'
import { useDatabase } from '../../../../database/client'
import { comfyExecutions, runs } from '../../../../database/schema'
import { fetchHistoryEntry } from '../../../../services/comfyui/client'
import { requireAdmin } from '../../../../utils/auth'
import { withComfyUpstream } from '../../../../utils/comfyui'

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
  const [saved] = await useDatabase().select().from(runs).where(and(eq(runs.promptId, promptId), eq(runs.ownerId, user.id))).limit(1)
  let entry
  try {
    entry = await withComfyUpstream(() => fetchHistoryEntry(promptId))
  }
  catch (error) {
    // 已落库的执行在 ComfyUI 暂时不可用时仍可查询状态；在线时则优先返回
    // ComfyUI 的完整历史（尤其是 outputs），否则生成完成后前端无法显示预览。
    if (!saved?.workflow)
      throw error
  }
  if (entry)
    return { promptId, ...entry }
  if (saved?.workflow)
    return { promptId, prompt: [0, promptId, {}, { extra_pnginfo: { workflow: saved.workflow } }, []], status: { status_str: saved.status === 'FAILED' ? 'error' : 'success', completed: saved.status === 'SUCCEEDED' || saved.status === 'FAILED' } }
  return {
    promptId,
    status: {
      status_str: 'success' as const,
      completed: false,
    },
  }
})
