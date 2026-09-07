import { assertSameOrigin } from '../utils/auth'

export default defineEventHandler((event) => {
  if (event.path.startsWith('/api/'))
    assertSameOrigin(event)
})
