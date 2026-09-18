import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../../../database/client'
import { comfyExecutions } from '../../../../database/schema'
import { fetchHistory } from '../../../../services/comfyui/client'
import { requireAdmin } from '../../../../utils/auth'
import { withComfyUpstream } from '../../../../utils/comfyui'

const querySchema = z.object({
  maxItems: z.coerce.number().int().min(1).max(200).optional(),
})
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: '查询参数无效' })
  }
  const history = await withComfyUpstream(() => fetchHistory(parsed.data.maxItems))
  const promptIds = Object.keys(history)
  if (!promptIds.length)
    return {}
  const owned = await useDatabase().select({ promptId: comfyExecutions.promptId }).from(comfyExecutions).where(eq(comfyExecutions.ownerId, user.id))
  const allowed = new Set(owned.map(item => item.promptId))
  return Object.fromEntries(Object.entries(history).filter(([promptId]) => allowed.has(promptId)))
})
