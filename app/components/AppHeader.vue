<script setup lang="ts">
import type { AuthSessionResponse } from '#shared/types/auth'
import type { DropdownMenuItem } from '@nuxt/ui'
import { getAppNavigation, isAppNavigationActive } from '~/utils/app-navigation'

const route = useRoute()
const { user, loaded, registrationMode } = useAuth()
const { isDark, toggleTheme } = useThemeTransition()

// Resolve the session in the shared layout so the server and first client
// render produce the same role-aware navigation structure.
const { data: session } = await useFetch<AuthSessionResponse>('/api/auth/session')
if (session.value) {
  user.value = session.value.user
  registrationMode.value = session.value.registrationMode
  loaded.value = true
}

const navigation = computed(() => getAppNavigation(user.value?.role))
const mobileNavigation = computed<DropdownMenuItem[]>(() => [
  {
    label: '首页',
    to: '/',
    icon: 'i-lucide-house',
    active: route.path === '/',
  },
  ...navigation.value.map(item => ({
    ...item,
    active: isAppNavigationActive(route.path, item.to),
  })),
])
</script>

<template>
  <header class="app-header">
    <div class="app-header__surface">
      <NuxtLink to="/" class="app-header__brand focus-ring" aria-label="forkvdo 首页">
        <BrandLogo />
      </NuxtLink>

      <span class="app-header__divider" aria-hidden="true" />

      <nav class="app-header__nav" aria-label="主导航">
        <NuxtLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="app-header__nav-link focus-ring"
          :class="{ 'is-active': isAppNavigationActive(route.path, item.to) }"
          :aria-current="isAppNavigationActive(route.path, item.to) ? 'page' : undefined"
        >
          <UIcon :name="item.icon" class="app-header__nav-icon" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="app-header__actions">
        <UButton
          v-if="route.path === '/'"
          to="/studio"
          color="primary"
          size="sm"
          trailing-icon="i-lucide-arrow-up-right"
          class="app-header__cta"
        >
          开始创作
        </UButton>

        <ClientOnly>
          <UTooltip :text="isDark ? '切换到浅色模式' : '切换到深色模式'">
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
              :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
              class="app-header__icon-button"
              @click="toggleTheme"
            />
          </UTooltip>
          <template #fallback>
            <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-moon" aria-label="切换颜色模式" disabled class="app-header__icon-button" />
          </template>
        </ClientOnly>

        <UserAccountMenu />

        <UDropdownMenu
          :items="mobileNavigation"
          :content="{ align: 'end' }"
          :ui="{ content: 'w-52' }"
          class="app-header__mobile-menu"
        >
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-menu"
            aria-label="打开主导航"
            class="app-header__icon-button"
          />
        </UDropdownMenu>
      </div>
    </div>
  </header>
</template>
