import { saveConnection } from '../../../services/platform/connections'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  return await saveConnection(user.id, await readBody(event))
})
