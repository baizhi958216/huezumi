<script setup lang="ts">
import type { AuthSessionResponse } from '#shared/types/auth'

const { user } = useAuth()
const { data: session } = await useFetch<AuthSessionResponse>('/api/auth/session')

if (session.value?.user?.role !== 'admin') {
  await navigateTo('/')
}
else {
  user.value = session.value.user
}
</script>

<template>
  <div v-if="user?.role === 'admin'" class="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <AdminHeader />
    <NuxtPage :transition="{ name: 'tab-fade', mode: 'out-in' }" />
  </div>
</template>
