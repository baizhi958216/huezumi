import { listRuns } from '../../services/platform/runs'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await listRuns(user.id, getQuery(event))
})
