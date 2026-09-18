<script setup lang="ts">
import type { AuthSessionResponse } from '#shared/types/auth'
import type { DropdownMenuItem } from '@nuxt/ui'
import { getAppNavigation, getStudioNavigation, isAppNavigationActive } from '~/utils/app-navigation'

const route = useRoute()
const { user, loaded, registrationMode } = useAuth()
const { isDark, captureThemePointer, toggleTheme } = useThemeTransition()

// Resolve the session in the shared layout so the server and first client
// render produce the same role-aware navigation structure.
const { data: session } = await useFetch<AuthSessionResponse>('/api/auth/session')
if (session.value) {
  user.value = session.value.user
  registrationMode.value = session.value.registrationMode
  loaded.value = true
}

const navigation = computed(() => getAppNavigation(user.value?.role))
const studioNavigation = computed<DropdownMenuItem[]>(() => getStudioNavigation(user.value?.role).map(item => ({
  ...item,
  active: route.path === item.to,
})))
const mobileNavigation = computed<DropdownMenuItem[]>(() => [
  {
    label: '首页',
    to: '/',
    icon: 'i-lucide-house',
    active: route.path === '/',
  },
  ...navigation.value.map(item => item.to === '/studio'
    ? {
        ...item,
        active: isAppNavigationActive(route.path, item.to),
        children: studioNavigation.value,
      }
    : {
        ...item,
        active: isAppNavigationActive(route.path, item.to),
      }),
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
        <template v-for="item in navigation" :key="item.to">
          <div v-if="item.to === '/studio'" class="app-header__studio-nav" :class="{ 'is-active': isAppNavigationActive(route.path, item.to) }">
            <NuxtLink
              :to="item.to"
              class="app-header__nav-link app-header__studio-link focus-ring"
              :aria-current="isAppNavigationActive(route.path, item.to) ? 'page' : undefined"
            >
              <UIcon :name="item.icon" class="app-header__nav-icon" />
              <span>{{ item.label }}</span>
            </NuxtLink>
            <UDropdownMenu :items="studioNavigation" :content="{ align: 'start' }" :ui="{ content: 'w-48' }">
              <button type="button" class="app-header__studio-toggle focus-ring" aria-label="切换创作类型">
                <UIcon name="i-lucide-chevron-down" class="size-3.5" />
              </button>
            </UDropdownMenu>
          </div>
          <NuxtLink
            v-else
            :to="item.to"
            class="app-header__nav-link focus-ring"
            :class="{ 'is-active': isAppNavigationActive(route.path, item.to) }"
            :aria-current="isAppNavigationActive(route.path, item.to) ? 'page' : undefined"
          >
            <UIcon :name="item.icon" class="app-header__nav-icon" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </template>
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
              @pointerdown.capture="captureThemePointer"
              @click="toggleTheme($event)"
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
