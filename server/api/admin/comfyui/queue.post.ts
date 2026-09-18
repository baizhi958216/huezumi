import { z } from 'zod'
import { mutateQueue } from '../../../services/comfyui/client'
import { withComfyUpstream } from '../../../utils/comfyui'

const bodySchema = z.object({
  clear: z.boolean().optional(),
  delete: z.array(z.number().int().min(0)).max(200).optional(),
})
export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: '队列操作参数无效' })
  }
  const body = parsed.data
  if (!body.clear && !body.delete?.length) {
    throw createError({ statusCode: 422, statusMessage: '需要指定 clear 或 delete' })
  }
  await withComfyUpstream(() => mutateQueue({
    clear: body.clear,
    delete: body.delete,
  }))
  return { ok: true }
})
