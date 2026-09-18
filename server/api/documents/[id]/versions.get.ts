import { z } from 'zod'
import { versionsPage } from '../../../services/platform/documents'
import { requireUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await versionsPage(user.id, z.uuid().parse(getRouterParam(event, 'id')), getQuery(event))
})
