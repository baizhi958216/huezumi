import { z } from 'zod'
import { saveVersion } from '../../../services/platform/documents'
import { requireUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return await saveVersion(user.id, z.uuid().parse(getRouterParam(event, 'id')), await readBody(event))
})
