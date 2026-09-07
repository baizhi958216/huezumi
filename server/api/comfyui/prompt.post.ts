import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { comfyExecutions } from '../../database/schema'
import { submitPrompt } from '../../services/comfyui/client'
import { requireAdmin } from '../../utils/auth'
import { withComfyUpstream } from '../../utils/comfyui'

const apiNodeSchema = z.object({
  class_type: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()),
  _meta: z.object({ title: z.string() }).partial().optional(),
})

const bodySchema = z.object({
  prompt: z.record(z.string(), apiNodeSchema),
  clientId: z.string().max(64).optional(),
  front: z.boolean().optional(),
  promptId: z.uuid().optional(),
  workflow: z.unknown().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 422,
      statusMessage: parsed.error.issues[0]?.message || '工作流参数无效',
      data: parsed.error.flatten(),
    })
  }

  const body = parsed.data
  const result = await withComfyUpstream(() => submitPrompt({
    prompt: body.prompt,
    clientId: body.clientId,
    front: body.front,
    promptId: body.promptId,
    workflow: body.workflow,
  }))
  await useDatabase().insert(comfyExecutions).values({ ownerId: user.id, promptId: result.promptId })
  return result
})
