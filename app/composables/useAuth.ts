import type { AuthSessionResponse, PublicUser } from '#shared/types/auth'

const user = ref<PublicUser | null>(null)
const registrationMode = ref<AuthSessionResponse['registrationMode']>('invite')
const loaded = ref(false)
const authDialogOpen = ref(false)

export function useAuth() {
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
