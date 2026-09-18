import { z } from 'zod'
import { documentVersion } from '../../services/platform/documents'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await documentVersion(user.id, z.uuid().parse(getRouterParam(event, 'id')))
})
