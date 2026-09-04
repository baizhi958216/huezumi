<script setup lang="ts">
import type { MediaTypeFilter, RatioFilter, SortBy, ViewMode } from '~/types/projects'

defineProps<{ providers: string[], hasFilters: boolean }>()
const emit = defineEmits<{ reset: [] }>()
const search = defineModel<string>('search', { required: true })
const ratio = defineModel<RatioFilter>('ratio', { required: true })
const provider = defineModel<string>('provider', { required: true })
const mediaType = defineModel<MediaTypeFilter>('mediaType', { required: true })
const sort = defineModel<SortBy>('sort', { required: true })
const view = defineModel<ViewMode>('view', { required: true })

const ratioPills: Array<{ value: RatioFilter, label: string, icon: string }> = [
  { value: 'ALL', label: '全部画幅', icon: 'i-lucide-ratio' },
  { value: 'HORIZONTAL', label: '横屏', icon: 'i-lucide-rectangle-horizontal' },
  { value: 'VERTICAL', label: '竖屏', icon: 'i-lucide-rectangle-vertical' },
  { value: 'SQUARE', label: '方形', icon: 'i-lucide-square' },
]

const mediaItems: Array<{ value: MediaTypeFilter, label: string }> = [
  { value: 'ALL', label: '所有素材' },
  { value: 'IMAGE', label: '参考图 / 帧' },
  { value: 'VIDEO', label: '参考视频' },
  { value: 'AUDIO', label: '参考音频' },
  { value: 'TEXT_ONLY', label: '纯文本' },
]

const viewItems: Array<{ value: ViewMode, icon: string, label: string }> = [
  { value: 'grid', icon: 'i-lucide-layout-grid', label: '等高网格' },
  { value: 'masonry', icon: 'i-lucide-columns-3', label: '自适应瀑布流' },
  { value: 'list', icon: 'i-lucide-list', label: '列表视图' },
]

const selectClass = 'h-9 appearance-none rounded-lg border border-default bg-elevated px-2.5 pr-7 text-xs font-medium text-toned outline-none transition focus:border-signal-500'
</script>

<template>
  <section class="sticky top-16 z-20 mt-3 rounded-xl border border-default bg-default/90 p-2.5 shadow-soft backdrop-blur-xl sm:mt-4" aria-label="作品检索与筛选">
    <div class="flex flex-col gap-2.5 xl:flex-row xl:items-center">
      <!-- Search Input -->
      <label class="relative min-w-0 flex-1">
        <span class="sr-only">搜索作品</span>
        <UIcon name="i-lucide-search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dimmed" />
        <input
          v-model="search"
          type="search"
          class="h-9 w-full rounded-lg border border-default bg-elevated pl-9 pr-8 text-xs text-highlighted outline-none transition placeholder:text-dimmed focus:border-signal-500 sm:text-sm"
          placeholder="搜索提示词、模型或任务 ID"
        >
        <button
          v-if="search"
          type="button"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-dimmed hover:text-highlighted"
          aria-label="清除搜索"
          @click="search = ''"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </label>

      <!-- Ratio Quick Switcher Pills -->
      <div class="flex items-center rounded-lg border border-default bg-elevated p-0.5">
        <button
          v-for="pill in ratioPills"
          :key="pill.value"
          type="button"
          class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition"
          :class="ratio === pill.value
            ? 'bg-zinc-950 text-white shadow-xs dark:bg-white dark:text-zinc-950'
            : 'text-muted hover:text-highlighted'"
          @click="ratio = pill.value"
        >
          <UIcon :name="pill.icon" class="size-3" />
          <span>{{ pill.label }}</span>
        </button>
      </div>

      <!-- Filters & View Mode -->
      <div class="flex flex-wrap items-center gap-2">
        <label v-if="providers.length > 1" class="relative">
          <span class="sr-only">平台</span>
          <select v-model="provider" :class="selectClass">
            <option value="ALL">所有平台</option>
            <option v-for="item in providers" :key="item" :value="item">{{ item }}</option>
          </select>
          <UIcon name="i-lucide-chevron-down" class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-dimmed" />
        </label>

        <label class="relative">
          <span class="sr-only">素材</span>
          <select v-model="mediaType" :class="selectClass">
            <option v-for="item in mediaItems" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
          <UIcon name="i-lucide-chevron-down" class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-dimmed" />
        </label>

        <label class="relative">
          <span class="sr-only">排序</span>
          <select v-model="sort" :class="selectClass">
            <option value="newest">最新创建</option>
            <option value="oldest">最早创建</option>
          </select>
          <UIcon name="i-lucide-arrow-down-up" class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-dimmed" />
        </label>

        <!-- View Mode Switcher -->
        <div class="flex h-9 items-center overflow-hidden rounded-lg border border-default bg-elevated p-0.5">
          <button
            v-for="item in viewItems"
            :key="item.value"
            type="button"
            class="grid size-8 place-items-center rounded-md transition"
            :class="view === item.value
              ? 'bg-zinc-950 text-white shadow-xs dark:bg-white dark:text-zinc-950'
              : 'text-muted hover:bg-muted/50 hover:text-highlighted'"
            :title="item.label"
            :aria-label="item.label"
            @click="view = item.value"
          >
            <UIcon :name="item.icon" class="size-3.5" />
          </button>
        </div>

        <UButton
          v-if="hasFilters"
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-x"
          @click="emit('reset')"
        >
          清除
        </UButton>
      </div>
    </div>
  </section>
</template>
