import { submitWorkflow } from '../../services/comfyui/runs'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const result = await submitWorkflow(user.id, await readBody(event))
  setResponseStatus(event, 202)
  return result
})
