import { enforceRateLimit } from '../utils/rate-limit'

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST')
    return
  if (event.path === '/api/auth/login' || event.path === '/api/auth/register')
    await enforceRateLimit(event, 'auth', 10, 60)
  else if (event.path === '/api/generations')
    await enforceRateLimit(event, 'generation', 20, 60)
  else if (event.path === '/api/text-creation/generate')
    await enforceRateLimit(event, 'text-generation', 12, 60)
})
