import { listModels } from '../../services/platform/connections'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return await listModels()
})
