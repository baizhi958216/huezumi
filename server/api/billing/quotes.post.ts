import { quoteRun } from '../../services/platform/quotes'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await quoteRun(user.id, await readBody(event))
})
