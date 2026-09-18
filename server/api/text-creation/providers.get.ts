import { listTextProviders } from '../../services/text-creation'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return listTextProviders()
})
