import { z } from 'zod'
import { fetchHistory } from '../../../services/comfyui/client'
import { withComfyUpstream } from '../../../utils/comfyui'

const querySchema = z.object({
  maxItems: z.coerce.number().int().min(1).max(200).optional(),
})

export default defineEventHandler(async (event) => {
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: '查询参数无效' })
  }
  return await withComfyUpstream(() => fetchHistory(parsed.data.maxItems))
})
