import type { RouterConfig } from '@nuxt/schema'

export default {
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition)
      return savedPosition

    if (to.hash)
      return { el: to.hash, behavior: 'smooth' }

    // Route changes should settle immediately; smooth motion is reserved for
    // intentional in-page anchor navigation.
    return { left: 0, top: 0, behavior: 'instant' }
  },
} satisfies RouterConfig
