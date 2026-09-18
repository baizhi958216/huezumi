import { listCreativeDocuments } from '../../../services/creative-documents'
import { requireUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await listCreativeDocuments(user.id)
})
