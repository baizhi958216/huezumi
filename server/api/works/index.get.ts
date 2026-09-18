import { listWorks } from '../../services/platform/works'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await listWorks(user.id, getQuery(event))
})
