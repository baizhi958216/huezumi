import { submitRun } from '../../services/platform/runs'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const result = await submitRun(user.id, await readBody(event))
  setResponseStatus(event, 202)
  return result
})
