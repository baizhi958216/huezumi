<script setup lang="ts">
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import GlassSurface from '~/components/vuebits/GlassSurface.vue'

const { isDark, toggleTheme } = useThemeTransition()
const { user } = useAuth()
const route = useRoute()
const isHome = computed(() => route.path === '/')
const isWorkspace = computed(() => route.path.startsWith('/studio'))
const isWorkflow = computed(() => route.path.startsWith('/workflow'))
const navRoot = ref<HTMLElement>()
const navGlass = ref<HTMLElement>()
const mainClass = computed(() => {
  if (isHome.value || isWorkflow.value)
    return 'pt-0'
  if (isWorkspace.value)
    return 'pt-[72px]'
  return 'pt-[86px] md:pt-[92px]'
})

const navigation = computed(() => [
  { label: '创作台', to: '/studio' },
  { label: '作品库', to: '/projects' },
  ...(user.value?.role === 'admin' ? [{ label: '工作流', to: '/workflow' }, { label: '控制面板', to: '/admin' }] : []),
])

function isActive(to: string) {
  const [path, hash] = to.split('#')
  if (hash)
    return route.path === path && route.hash === `#${hash}`
  return route.path === to
}

let animationCleanup: (() => void) | undefined

onMounted(() => {
  if (!navRoot.value || !navGlass.value)
    return

  gsap.registerPlugin(ScrollTrigger)
  const root = navRoot.value
  const glass = navGlass.value
  const mm = gsap.matchMedia()

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.fromTo(glass, {
      y: -18,
      scale: 0.975,
      autoAlpha: 0,
    }, {
      y: 0,
      scale: 1,
      autoAlpha: 1,
      duration: 0.72,
      ease: 'power3.out',
      clearProps: 'transform,opacity,visibility',
    })

    const settleY = gsap.quickTo(glass, 'y', { duration: 0.48, ease: 'power3.out' })
    const sheenX = gsap.quickTo(root, '--liquid-shift', { duration: 0.75, ease: 'power2.out' })
    const trigger = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate(self) {
        const y = self.scroll()
        root.classList.toggle('is-scrolled', y > 28)
        settleY(y > 120 && self.direction === 1 ? -2 : 0)
        sheenX(gsap.utils.clamp(-18, 18, self.getVelocity() / 90))
      },
    })

    return () => trigger.kill()
  })

  mm.add('(prefers-reduced-motion: reduce)', () => {
    root.classList.toggle('is-scrolled', window.scrollY > 28)
  })

  animationCleanup = () => mm.revert()
})

onBeforeUnmount(() => animationCleanup?.())
</script>

<template>
  <div class="min-h-screen bg-default text-highlighted">
    <header v-if="!isWorkflow" ref="navRoot" class="liquid-nav" :class="{ 'liquid-nav--workspace': isWorkspace }" aria-label="主导航">
      <div ref="navGlass" class="liquid-nav__motion">
        <GlassSurface class="liquid-nav__glass" :blur="isWorkspace ? 12 : 18">
          <template v-if="isWorkspace">
            <NuxtLink to="/" class="liquid-nav__workspace-brand focus-ring" aria-label="返回 forkvdo 首页">
              <BrandLogo compact />
            </NuxtLink>
            <span class="liquid-nav__divider" aria-hidden="true" />
            <div class="liquid-nav__workspace-title">
              <span class="i-lucide-clapperboard" />
              创作台
            </div>
            <div class="liquid-nav__workspace-actions">
              <UButton to="/" color="neutral" variant="ghost" size="sm" icon="i-lucide-house" class="liquid-nav__workspace-button">
                首页
              </UButton>
              <UButton to="/projects" color="neutral" variant="ghost" size="sm" icon="i-lucide-library" class="liquid-nav__workspace-button">
                作品库
              </UButton>
              <UButton v-if="user?.role === 'admin'" to="/workflow" color="neutral" variant="ghost" size="sm" icon="i-lucide-workflow" class="liquid-nav__workspace-button">
                工作流
              </UButton>
              <ClientOnly>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
                  :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
                  class="liquid-nav__icon-button"
                  @click="toggleTheme"
                />
              </ClientOnly>
              <UserAccountMenu />
            </div>
          </template>

          <template v-else>
            <NuxtLink to="/" class="liquid-nav__brand focus-ring" aria-label="forkvdo 首页">
              <BrandLogo />
            </NuxtLink>

            <nav class="liquid-nav__links" aria-label="页面导航">
              <NuxtLink
                v-for="item in navigation"
                :key="item.to"
                :to="item.to"
                class="liquid-nav__link focus-ring"
                :class="{ 'is-active': isActive(item.to) }"
              >
                <span>{{ item.label }}</span>
              </NuxtLink>
            </nav>

            <div class="liquid-nav__actions">
              <div class="liquid-nav__status" title="服务状态正常">
                <span class="liquid-nav__status-dot" />
                <span>在线</span>
              </div>

              <ClientOnly>
                <UTooltip :text="isDark ? '切换到浅色模式' : '切换到深色模式'">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
                    :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
                    class="liquid-nav__icon-button"
                    @click="toggleTheme"
                  />
                </UTooltip>
                <template #fallback>
                  <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-moon" aria-label="切换颜色模式" disabled class="liquid-nav__icon-button" />
                </template>
              </ClientOnly>

              <UserAccountMenu />

              <UButton to="/studio" color="primary" size="sm" trailing-icon="i-lucide-arrow-up-right" class="liquid-nav__cta">
                开始创作
              </UButton>

              <UDropdownMenu :items="navigation" class="md:hidden">
                <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-menu" aria-label="打开菜单" class="liquid-nav__icon-button" />
              </UDropdownMenu>
            </div>
          </template>
        </GlassSurface>
      </div>
    </header>

    <main :class="mainClass">
      <slot />
    </main>
  </div>
</template>
