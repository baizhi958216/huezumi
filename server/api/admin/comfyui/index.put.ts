import { z } from 'zod'
import { connectionSchema } from '../../../services/platform/config-schemas'
import { patchSettings, saveConnection } from '../../../services/platform/connections'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = z.object({ id: z.uuid().optional(), connection: connectionSchema }).strict().parse(await readBody(event))
  if (body.connection.kind !== 'workflow' || body.connection.provider !== 'comfyui')
    throw createError({ statusCode: 422, statusMessage: '此入口仅配置 ComfyUI 工作流连接' })
  const connection = await saveConnection(user.id, body.connection, body.id)
  await patchSettings(user.id, { defaultWorkflowConnectionId: connection.id })
  return { connection }
})
