import { getComfyStatus } from '../../services/comfyui/process'

export default defineEventHandler(() => getComfyStatus())
