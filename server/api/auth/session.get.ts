import type { AuthSessionResponse } from '#shared/types/auth'
import { optionalUser, registrationMode, toPublicUser } from '../../utils/auth'

export default defineEventHandler(async (event): Promise<AuthSessionResponse> => {
  const user = await optionalUser(event)
  return { user: user ? await toPublicUser(user) : null, registrationMode: registrationMode() }
})
