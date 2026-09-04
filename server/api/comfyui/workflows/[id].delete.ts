import { deleteWorkflow } from '../../../services/comfyui/workflows'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  const removed = await deleteWorkflow(id)
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: '工作流不存在' })
  }
  return { ok: true }
})
