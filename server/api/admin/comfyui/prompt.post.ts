import { submitWorkflow, workflowSubmitSchema } from '../../../services/platform/workflows'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = workflowSubmitSchema.parse(await readBody(event))
  const result = await submitWorkflow(user.id, body)
  setResponseStatus(event, 202)
  return result
})
