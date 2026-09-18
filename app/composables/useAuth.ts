import type { AuthSessionResponse, PublicUser } from '#shared/types/auth'

export function useAuth() {
  // Nuxt state is serialized into the hydration payload, so the header sees
  // the same session on the server and client instead of changing its nav
  // structure during hydration.
  const user = useState<PublicUser | null>('auth-user', () => null)
  const registrationMode = useState<AuthSessionResponse['registrationMode']>('auth-registration-mode', () => 'invite')
  const loaded = useState('auth-loaded', () => false)
  const authDialogOpen = useState('auth-dialog-open', () => false)

  async function refreshSession() {
    try {
      const result = await $fetch<AuthSessionResponse>('/api/auth/session')
      user.value = result.user
      registrationMode.value = result.registrationMode
    }
    catch {
      user.value = null
    }
    finally {
      loaded.value = true
    }
    return user.value
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/')
  }

  function requireLogin() {
    if (user.value)
      return true
    authDialogOpen.value = true
    return false
  }

  return { user, loaded, registrationMode, authDialogOpen, refreshSession, logout, requireLogin }
}
