import { z } from 'zod'
import { freeMemory } from '../../services/comfyui/client'
import { withComfyUpstream } from '../../utils/comfyui'

const bodySchema = z.object({
  unloadModels: z.boolean().optional(),
  freeMemory: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: '参数无效' })
  }

  await withComfyUpstream(() => freeMemory({
    unloadModels: parsed.data.unloadModels ?? true,
    freeMemory: parsed.data.freeMemory ?? true,
  }))
  return { ok: true }
})
