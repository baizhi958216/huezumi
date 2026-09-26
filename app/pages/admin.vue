<script setup lang="ts">
import type { AuthSessionResponse } from '#shared/types/auth'
import { adminNavigation } from '~/utils/admin-navigation'

const route = useRoute()

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
  <div v-if="user?.role === 'admin'" class="mx-auto grid grid-cols-1 max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10 lg:py-8">
    <aside class="min-w-0">
      <nav class="flex gap-1 overflow-x-auto rounded-xl border border-default bg-elevated p-2 lg:sticky lg:top-24 lg:flex-col" aria-label="控制面板导航">
        <NuxtLink v-for="item in adminNavigation" :key="item.to" :to="item.to" :aria-current="route.path === item.to ? 'page' : undefined" class="flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors" :class="route.path === item.to ? 'bg-primary/10 font-semibold text-primary' : 'text-muted hover:bg-muted hover:text-highlighted'">
          <UIcon :name="item.icon" class="size-4" />{{ item.label }}
        </NuxtLink>
      </nav>
    </aside>
    <main class="min-w-0 space-y-6">
      <AdminHeader />
      <NuxtPage :transition="{ name: 'tab-fade', mode: 'out-in' }" />
    </main>
  </div>
</template>
