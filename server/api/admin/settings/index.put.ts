import { writeSettings } from '../../../services/platform/connections'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  return await writeSettings(user.id, await readBody(event))
})
