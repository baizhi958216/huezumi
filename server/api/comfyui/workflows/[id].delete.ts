import { deleteWorkflow } from '../../../services/comfyui/workflows'
import { requireUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  const user = await requireUser(event)
  const removed = await deleteWorkflow(user.id, id)
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: '工作流不存在' })
  }
  return { ok: true }
})
