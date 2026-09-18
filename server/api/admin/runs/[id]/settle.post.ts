import { z } from 'zod'
import { reconcileTextRun } from '../../../../services/platform/runs'
import { requireAdmin } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = z.object({ action: z.enum(['release', 'charge']), reason: z.string().trim().min(3).max(240) }).parse(await readBody(event))
  return await reconcileTextRun(user.id, z.uuid().parse(getRouterParam(event, 'id')), body.action, body.reason)
})
