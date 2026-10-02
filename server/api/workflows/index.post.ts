import { saveWorkflow } from '../../services/comfyui/workflows'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return saveWorkflow(user.id, user.role === 'admin', await readBody(event))
})
