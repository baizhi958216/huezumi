import { z } from 'zod'
import { revokeConnectionVersion } from '../../../../services/platform/connections'
import { requireAdmin } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = z.object({ revisionId: z.uuid() }).parse(await readBody(event))
  return await revokeConnectionVersion(user.id, z.uuid().parse(getRouterParam(event, 'id')), body.revisionId)
})
