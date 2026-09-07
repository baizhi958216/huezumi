<script setup lang="ts">
const { user, loaded, authDialogOpen, refreshSession, logout } = useAuth()

onMounted(() => {
  if (!loaded.value)
    refreshSession()
})

const initials = computed(() => user.value?.displayName.trim().slice(0, 1).toUpperCase() || 'U')
const menuItems = computed(() => [[
  { label: `${user.value?.availableCredits ?? 0} 可用额度`, icon: 'i-lucide-coins', disabled: true },
  { label: '我的空间', icon: 'i-lucide-layout-dashboard', to: '/dashboard' },
  ...(user.value?.role === 'admin' ? [{ label: '控制面板', icon: 'i-lucide-layout-dashboard', to: '/admin' }] : []),
  { label: '个人设置', icon: 'i-lucide-user-round-cog', to: '/account' },
], [
  { label: '退出登录', icon: 'i-lucide-log-out', onSelect: logout },
]])
</script>

<template>
  <ClientOnly>
    <UDropdownMenu v-if="user" :items="menuItems">
      <UButton color="neutral" variant="ghost" size="sm" class="rounded-full px-1.5" :aria-label="`${user.displayName} 的帐号菜单`">
        <UAvatar :src="user.avatarUrl" :alt="user.displayName" size="xs" :text="initials" />
      </UButton>
    </UDropdownMenu>
    <UTooltip v-else text="登录或注册">
      <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-circle-user-round" aria-label="登录或注册" class="liquid-nav__icon-button" @click="authDialogOpen = true" />
    </UTooltip>
    <template #fallback>
      <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-circle-user-round" aria-label="帐号" disabled />
    </template>
  </ClientOnly>
  <AuthDialog v-model:open="authDialogOpen" />
</template>
