import { getWorkflow } from '../../../services/comfyui/workflows'
import { requireUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  const user = await requireUser(event)
  const record = await getWorkflow(user.id, id)
  if (!record) {
    throw createError({ statusCode: 404, statusMessage: '工作流不存在' })
  }
  return record
})
