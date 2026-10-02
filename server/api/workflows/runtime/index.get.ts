import { comfyRuntimeStatus } from '../../../services/comfyui/runtime'
import { requireUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  return comfyRuntimeStatus()
})
