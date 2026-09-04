import { getWorkflow } from '../../../services/comfyui/workflows'

export default defineEventHandler(async (event) => {
  const id = String(getRouterParam(event, 'id') || '')
  const record = await getWorkflow(id)
  if (!record) {
    throw createError({ statusCode: 404, statusMessage: '工作流不存在' })
  }
  return record
})
