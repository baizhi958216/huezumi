<script setup lang="ts">
import type { PlatformSettings } from '#shared/types/platform'

const { data: overview, error, refresh } = await useFetch<Record<string, number>>('/api/admin/overview')
const { data: settings, error: settingsError } = await useFetch<PlatformSettings>('/api/admin/settings')
const metrics = [
  { key: 'users', label: '注册用户', icon: 'i-lucide-users', to: '/admin/users' },
  { key: 'creativeTasks', label: '创作任务累计', icon: 'i-lucide-layers', to: '/admin/tasks' },
  { key: 'activeCreativeTasks', label: '进行中的创作任务', icon: 'i-lucide-loader-circle', to: '/admin/tasks' },
  { key: 'reviewTasks', label: '待人工核对', icon: 'i-lucide-list-checks', to: '/admin/tasks' },
]
const missing = computed(() => settings.value ? [!settings.value.defaultTextConnectionId ? '文案' : '', !settings.value.defaultImageConnectionId ? '图片' : '', !settings.value.defaultVideoConnectionId ? '视频' : ''].filter(Boolean) : [])
const shortcuts = [
  { title: '接入生成服务', description: '新建连接 → 分配用途 → 配置价格', to: '/admin/services', icon: 'i-lucide-network' },
  { title: '管理用户额度', description: '查找账户，调整可用额度或停用账户', to: '/admin/users', icon: 'i-lucide-users' },
  { title: '管理注册与预算', description: '注册方式、赠送额度和任务上限', to: '/admin/settings', icon: 'i-lucide-settings' },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert v-if="error" color="error" title="总览加载失败">
      <template #actions>
        <UButton @click="refresh()">
          重试
        </UButton>
      </template>
    </UAlert>
    <div v-else class="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <NuxtLink v-for="metric in metrics" :key="metric.key" :to="metric.to" class="rounded-xl border border-default bg-default p-5 transition-colors hover:border-primary">
        <div class="flex items-center justify-between text-muted">
          <span class="text-xs">{{ metric.label }}</span><UIcon :name="metric.icon" class="size-4" />
        </div><p class="mt-4 text-3xl font-semibold tabular-nums">
          {{ overview?.[metric.key] ?? '—' }}
        </p>
      </NuxtLink>
    </div>
    <section class="rounded-xl border border-default bg-default p-5 sm:p-6">
      <h2 class="mb-4 font-semibold">
        需要处理
      </h2>
      <div v-if="overview && overview.reviewTasks" class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning/10 p-4">
        <div>
          <p class="text-sm font-medium">
            {{ overview.reviewTasks }} 个任务等待人工核对
          </p><p class="mt-1 text-xs text-muted">
            先查明供应商结果，再处理预留额度。
          </p>
        </div><UButton to="/admin/tasks" color="warning" variant="soft">
          处理任务
        </UButton>
      </div>
      <p v-else-if="overview && !error" class="text-sm text-muted">
        当前没有待人工核对的任务。
      </p>
      <UAlert v-if="settingsError" class="mt-4" color="error" title="用途分配状态加载失败" />
      <div v-else-if="missing.length" class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
        <p class="text-sm">
          {{ missing.join('、') }}尚未分配生成服务
        </p><UButton to="/admin/services" variant="outline" color="neutral">
          配置服务
        </UButton>
      </div>
    </section>
    <div class="grid gap-4 xl:grid-cols-3">
      <NuxtLink v-for="item in shortcuts" :key="item.to" :to="item.to" class="rounded-xl border border-default p-5 transition-colors hover:bg-elevated">
        <UIcon :name="item.icon" class="mb-4 size-5 text-primary" /><h2 class="text-sm font-semibold">
          {{ item.title }}
        </h2><p class="mt-2 text-xs leading-6 text-muted">
          {{ item.description }}
        </p>
      </NuxtLink>
    </div>
    <p class="text-xs text-muted">
      创作任务统计包含文案、图片与视频。当前素材占用 {{ ((overview?.assetBytes || 0) / 1024 / 1024).toFixed(1) }} MB。
    </p>
  </div>
</template>
