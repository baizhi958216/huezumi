<script setup lang="ts">
import type { GenerationRecord } from '#shared/types/generation'
import { formatGenerationDate, generationRatioLabel, generationRatioStyle, generationStatusClasses, generationStatusLabel } from '~/utils/generation-display'

defineProps<{ record: GenerationRecord, total: number }>()
const emit = defineEmits<{ select: [record: GenerationRecord] }>()
</script>

<template>
  <section class="mt-8 grid overflow-hidden rounded-3xl border border-default bg-elevated shadow-card lg:grid-cols-[1.2fr_0.8fr]">
    <button type="button" class="group relative min-h-80 overflow-hidden bg-zinc-950 text-left lg:min-h-[480px]" @click="emit('select', record)">
      <video v-if="record.videoUrl" :src="record.videoUrl" muted playsinline preload="metadata" class="absolute inset-0 size-full object-contain" :style="{ aspectRatio: generationRatioStyle(record) }" />
      <div v-else class="absolute inset-0 grid place-items-center text-white/70">
        <span class="flex items-center gap-2 text-sm"><UIcon :name="record.status === 'FAILED' ? 'i-lucide-circle-x' : 'i-lucide-loader-circle'" class="size-5" :class="record.status === 'FAILED' ? '' : 'animate-spin'" />{{ record.status === 'FAILED' ? '生成失败' : '正在渲染' }}</span>
      </div>
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
      <div class="absolute left-5 right-5 top-5 flex justify-between text-xs font-semibold text-white">
        <span>01 / {{ total.toString().padStart(2, '0') }}</span><span class="rounded-full bg-black/35 px-2.5 py-1 backdrop-blur">{{ generationRatioLabel(record) }} · {{ record.ratio }}</span>
      </div>
      <span class="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur transition group-hover:scale-110"><UIcon name="i-lucide-play" class="size-5" /></span>
      <div class="absolute bottom-5 left-5 right-5 flex justify-between text-xs text-white/80">
        <span>点击检视完整画面</span><span v-if="record.videoArchived" class="flex items-center gap-1"><UIcon name="i-lucide-cloud-check" class="size-3.5" />已归档</span>
      </div>
    </button>
    <div class="flex flex-col justify-between p-6 md:p-8">
      <div>
        <p class="type-kicker">
          LATEST GENERATION
        </p><div class="mt-5 flex items-center justify-between gap-3">
          <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="generationStatusClasses(record.status)">{{ generationStatusLabel(record.status) }}</span><span class="text-xs text-dimmed">{{ formatGenerationDate(record.createdAt, true) }}</span>
        </div><h2 class="mt-5 line-clamp-4 text-2xl font-650 leading-10 text-highlighted">
          {{ record.prompt || '参考素材生成' }}
        </h2><p class="mt-3 text-sm text-muted">
          {{ record.model || '默认模型' }} · {{ record.provider }} · {{ record.mode === 'text' ? '文字生成' : '多模态生成' }}
        </p>
      </div>
      <div>
        <div class="mt-8 grid grid-cols-3 rounded-xl border border-default">
          <div v-for="item in [{ label: '画幅', value: record.ratio }, { label: '清晰度', value: record.resolution }, { label: '时长', value: record.duration === -1 ? '智能' : `${record.duration}s` }]" :key="item.label" class="border-r border-default p-3 last:border-r-0">
            <span class="block text-[11px] text-dimmed">{{ item.label }}</span><strong class="mt-1 block text-sm text-highlighted">{{ item.value }}</strong>
          </div>
        </div><button type="button" class="mt-5 flex w-full items-center justify-between border-t border-default pt-5 text-sm font-semibold text-highlighted hover:text-signal-500" @click="emit('select', record)">
          <span>{{ record.media?.length ? `${record.media.length} 份参考素材` : '纯文本生成' }}</span><span class="flex items-center gap-1">检视作品 <UIcon name="i-lucide-arrow-up-right" class="size-4" /></span>
        </button>
      </div>
    </div>
  </section>
</template>
