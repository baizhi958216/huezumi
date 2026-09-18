import { listWorkflows } from '../../../../services/comfyui/workflows'
import { requireUser } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return listWorkflows(user.id)
})
