import { interrupt } from '../../services/comfyui/client'
import { withComfyUpstream } from '../../utils/comfyui'

export default defineEventHandler(async () => {
  await withComfyUpstream(() => interrupt())
  return { ok: true }
})
