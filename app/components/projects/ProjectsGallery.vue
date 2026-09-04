<script setup lang="ts">
import type { GenerationRecord } from '#shared/types/generation'
import type { ViewMode } from '~/types/projects'
import { formatGenerationDate, generationRatioStyle, generationStatusClasses, generationStatusLabel } from '~/utils/generation-display'

defineProps<{
  records: GenerationRecord[]
  view: ViewMode
  filtered: boolean
}>()

const emit = defineEmits<{
  select: [record: GenerationRecord]
}>()
</script>

<template>
  <section class="pb-10 pt-4 sm:pt-5">
    <div class="mb-3 flex items-center justify-between text-xs text-dimmed">
      <span>{{ filtered ? '筛选结果' : '全部作品' }}（{{ records.length }}）</span>
      <span class="hidden sm:inline">
        {{ view === 'list' ? '按创建时间排列' : view === 'masonry' ? '自适应瀑布流展示' : '等高标准画框展示' }}
      </span>
    </div>

    <!-- Grid Mode: Uniform Frame Heights -->
    <div
      v-if="view === 'grid'"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-3.5"
    >
      <GenerationCard
        v-for="record in records"
        :key="record.id"
        :record="record"
        mode="grid"
        @select="emit('select', $event)"
      />
    </div>

    <!-- Masonry Mode: Dynamic Aspect Ratios with Zero Row Gaps -->
    <div
      v-else-if="view === 'masonry'"
      class="columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 sm:gap-3.5 [column-fill:_balance]"
    >
      <GenerationCard
        v-for="record in records"
        :key="record.id"
        :record="record"
        mode="masonry"
        @select="emit('select', $event)"
      />
    </div>

    <!-- List Mode: Compact Data Rows -->
    <div
      v-else-if="view === 'list'"
      class="overflow-hidden rounded-xl border border-default bg-elevated"
    >
      <button
        v-for="record in records"
        :key="record.id"
        type="button"
        class="grid w-full grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-default p-2.5 text-left transition last:border-b-0 hover:bg-muted/40 sm:grid-cols-[64px_1fr_120px_100px_130px_20px]"
        @click="emit('select', record)"
      >
        <div class="grid h-12 w-14 place-items-center overflow-hidden rounded-md bg-zinc-950 text-white/70">
          <video
            v-if="record.videoUrl"
            :src="record.videoUrl"
            muted
            playsinline
            preload="none"
            class="size-full object-contain"
            :style="{ aspectRatio: generationRatioStyle(record) }"
          />
          <UIcon
            v-else
            :name="record.status === 'FAILED' ? 'i-lucide-circle-x' : 'i-lucide-loader-circle'"
            class="size-4"
            :class="record.status === 'FAILED' ? '' : 'animate-spin'"
          />
        </div>

        <div class="min-w-0">
          <strong class="block truncate text-xs font-medium text-highlighted sm:text-sm">
            {{ record.prompt || '参考素材生成' }}
          </strong>
          <span class="mt-0.5 block truncate text-[11px] text-dimmed">
            {{ record.model || '默认模型' }} · {{ record.provider }}
          </span>
        </div>

        <div class="hidden text-xs text-toned sm:block">
          <span class="font-medium">{{ record.ratio }}</span>
          <span class="block text-[11px] text-dimmed">{{ record.resolution }} · {{ record.duration === -1 ? '智能' : `${record.duration}s` }}</span>
        </div>

        <span
          class="hidden rounded-md px-2 py-0.5 text-center text-[11px] font-medium sm:block"
          :class="generationStatusClasses(record.status)"
        >
          {{ generationStatusLabel(record.status) }}
        </span>

        <span class="hidden text-xs text-dimmed sm:block">
          {{ formatGenerationDate(record.createdAt) }}
        </span>

        <UIcon name="i-lucide-arrow-up-right" class="size-4 text-dimmed" />
      </button>
    </div>
  </section>
</template>
