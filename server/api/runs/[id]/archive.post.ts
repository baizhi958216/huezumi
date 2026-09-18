import { z } from 'zod'
import { commandRun } from '../../../services/platform/runs'
import { requireUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await commandRun(user.id, z.uuid().parse(getRouterParam(event, 'id')), 'archive')
})
