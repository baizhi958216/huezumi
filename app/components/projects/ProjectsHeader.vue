<script setup lang="ts">
import type { ProjectCounts, StatusFilter } from '~/types/projects'
import { formatGenerationDate } from '~/utils/generation-display'

const props = defineProps<{ counts: ProjectCounts, latestCreatedAt?: string, loading: boolean }>()
const emit = defineEmits<{ refresh: [] }>()
const statusFilter = defineModel<StatusFilter>('statusFilter', { required: true })

const items: Array<{ key: StatusFilter, label: string, icon: string, count: keyof ProjectCounts }> = [
  { key: 'ALL', label: '全部', icon: 'i-lucide-layers-3', count: 'total' },
  { key: 'ACTIVE', label: '生成中', icon: 'i-lucide-loader-circle', count: 'active' },
  { key: 'SUCCEEDED', label: '已完成', icon: 'i-lucide-circle-check', count: 'succeeded' },
  { key: 'FAILED', label: '失败', icon: 'i-lucide-circle-x', count: 'failed' },
  { key: 'ARCHIVED', label: '已归档', icon: 'i-lucide-cloud-check', count: 'archived' },
]

function select(key: StatusFilter) {
  statusFilter.value = statusFilter.value === key && key !== 'ALL' ? 'ALL' : key
}
</script>

<template>
  <header class="flex flex-col gap-3 sm:gap-4">
    <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div class="flex flex-wrap items-center gap-2.5">
        <h1 class="text-xl font-bold tracking-tight text-highlighted sm:text-2xl">
          作品库
        </h1>
        <UBadge color="neutral" variant="subtle" size="sm" class="font-normal">
          共 {{ counts.total }} 个作品
        </UBadge>
        <UBadge v-if="counts.active" color="primary" variant="subtle" size="sm">
          <span class="mr-1.5 size-1.5 animate-pulse rounded-full bg-signal-500" />
          {{ counts.active }} 个渲染中
        </UBadge>
      </div>

      <div class="flex items-center gap-2 self-end sm:self-auto">
        <span v-if="latestCreatedAt" class="hidden text-xs text-dimmed md:inline">
          同步于 {{ formatGenerationDate(latestCreatedAt) }}
        </span>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="loading"
          aria-label="刷新作品库"
          @click="emit('refresh')"
        />
        <UButton to="/studio" icon="i-lucide-plus" size="sm" color="primary">
          新建作品
        </UButton>
      </div>
    </div>

    <!-- Compact status navigation tabs -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" aria-label="作品状态筛选">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition"
        :class="statusFilter === item.key
          ? 'bg-signal-500/10 text-signal-600 ring-1 ring-inset ring-signal-500/30 dark:bg-signal-500/15 dark:text-signal-400'
          : 'text-muted hover:bg-muted/60 hover:text-highlighted'"
        @click="select(item.key)"
      >
        <UIcon :name="item.icon" class="size-3.5" :class="item.key === 'ACTIVE' && counts.active ? 'animate-spin' : ''" />
        <span>{{ item.label }}</span>
        <span
          class="rounded px-1.5 py-0.2 text-[11px] tabular-nums"
          :class="statusFilter === item.key ? 'bg-signal-500/20 text-signal-600 dark:text-signal-300' : 'bg-muted text-dimmed'"
        >
          {{ props.counts[item.count] }}
        </span>
      </button>
    </div>
  </header>
</template>
