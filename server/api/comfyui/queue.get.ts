import { fetchQueue } from '../../services/comfyui/client'
import { withComfyUpstream } from '../../utils/comfyui'

export default defineEventHandler(() => withComfyUpstream(() => fetchQueue()))
