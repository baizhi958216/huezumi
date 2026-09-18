import { requireAdmin } from '../utils/auth'

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/comfyui') && !event.path.startsWith('/api/admin/comfyui'))
    return
  await requireAdmin(event)
})
