import { listOwnedModelAssets } from '../../services/model-assets'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await listOwnedModelAssets(user.id)
})
