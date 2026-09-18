import { documentsPage } from '../../services/platform/documents'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await documentsPage(user.id, getQuery(event))
})
