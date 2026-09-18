<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  description?: string
}>(), {
  title: '',
  description: '',
})

const route = useRoute()

const navItems = [
  {
    label: '系统概览',
    to: '/admin',
    icon: 'i-lucide-layout-dashboard',
    isActive: computed(() => route.path === '/admin'),
  },
  {
    label: '连接与平台设置',
    to: '/admin/settings',
    icon: 'i-lucide-sliders',
    isActive: computed(() => route.path.startsWith('/admin/settings')),
  },
  {
    label: '邀请码管理',
    to: '/admin/invitations',
    icon: 'i-lucide-ticket',
    isActive: computed(() => route.path.startsWith('/admin/invitations')),
  },
]

const currentMeta = computed(() => {
  if (props.title) {
    return { title: props.title, description: props.description }
  }
  if (route.path.startsWith('/admin/settings')) {
    return {
      title: '连接与平台设置',
      description: '模型供应商凭据、注册与额度策略及运行环境',
    }
  }
  if (route.path.startsWith('/admin/invitations')) {
    return {
      title: '邀请码管理',
      description: '生成与管理注册邀请凭证，追踪发放与兑换状态',
    }
  }
  return {
    title: '系统概览',
    description: '系统运行状态、用户额度及近期任务概览',
  }
})
</script>

<template>
  <header class="flex flex-col gap-4 border-b border-default/70 pb-5 sm:flex-row sm:items-center sm:justify-between">
    <div class="min-w-0">
      <div class="flex items-center gap-2.5">
        <h1 class="text-xl font-bold tracking-tight text-highlighted sm:text-2xl">
          {{ currentMeta.title }}
        </h1>
        <UBadge color="neutral" variant="subtle" size="sm" class="font-normal">
          管理控制台
        </UBadge>
      </div>
      <p class="mt-1 text-xs text-muted">
        {{ currentMeta.description }}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <!-- Persistent Admin Navigation Tabs -->
      <nav class="flex items-center gap-1 rounded-lg border border-default bg-muted/60 p-1" aria-label="管理后台导航">
        <UButton
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          size="sm"
          :variant="item.isActive.value ? 'solid' : 'ghost'"
          :color="item.isActive.value ? 'primary' : 'neutral'"
          :icon="item.icon"
          class="transition-colors duration-150"
        >
          {{ item.label }}
        </UButton>
      </nav>

      <!-- Page specific action slot -->
      <slot name="actions" />
    </div>
  </header>
</template>
