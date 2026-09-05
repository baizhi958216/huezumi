import { requireAdmin } from '../utils/auth'

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/comfyui'))
    return
  await requireAdmin(event)
})
