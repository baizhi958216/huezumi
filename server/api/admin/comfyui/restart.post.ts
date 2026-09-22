import { restartComfy } from '../../../services/comfyui/process'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return await restartComfy()
})
