<script setup lang="ts">
import type { WorkflowProjectRecord } from '#shared/types/workflow-project'
import type { ViewMode } from '~/types/projects'

defineProps<{ record: WorkflowProjectRecord, view: ViewMode }>()
const open = ref(false)
const coverError = ref(false)
const previewError = ref(false)
const previewVideo = ref<HTMLVideoElement>()

function ratioStyle(ratio: string) {
  return /^\d+:\d+$/.test(ratio) ? ratio.replace(':', ' / ') : '16 / 9'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

watch(open, (isOpen) => {
  if (isOpen) {
    previewError.value = false
    return
  }
  previewVideo.value?.pause()
  if (previewVideo.value)
    previewVideo.value.currentTime = 0
})
</script>

<template>
  <div class="break-inside-avoid">
    <button
      type="button"
      class="mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl border border-default bg-elevated text-left transition hover:border-primary/50 hover:shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="view === 'list' ? 'sm:grid sm:grid-cols-[220px_1fr]' : ''"
      :aria-label="`打开工作流视频 ${record.name}`"
      @click="open = true"
    >
      <div class="relative overflow-hidden bg-zinc-950" :style="{ aspectRatio: ratioStyle(record.ratio) }">
        <video
          v-if="!coverError"
          :src="record.videoUrl"
          muted
          playsinline
          preload="metadata"
          tabindex="-1"
          aria-hidden="true"
          class="pointer-events-none size-full object-contain"
          @error="coverError = true"
        />
        <div v-else class="grid size-full place-items-center text-white/70">
          <UIcon name="i-lucide-video" class="size-8" />
        </div>
        <span class="pointer-events-none absolute inset-0 grid place-items-center bg-black/15">
          <span class="grid size-11 place-items-center rounded-full bg-black/60 text-white shadow-lg">
            <UIcon name="i-lucide-play" class="size-5" />
          </span>
        </span>
      </div>
      <div class="space-y-2 p-3">
        <div class="flex items-center justify-between gap-2">
          <strong class="min-w-0 truncate text-xs font-semibold text-highlighted" :title="record.name">{{ record.name }}</strong>
          <span class="shrink-0 text-[11px] text-dimmed">{{ formatDate(record.createdAt) }}</span>
        </div>
        <p class="line-clamp-2 text-xs text-muted" :title="record.prompt">
          {{ record.prompt || '工作流生成视频' }}
        </p>
        <p class="truncate text-[11px] text-dimmed">
          {{ record.model }} · {{ record.resolution }} · {{ record.ratio }}
        </p>
        <span class="inline-flex items-center gap-1 text-xs text-primary">
          <UIcon name="i-lucide-expand" class="size-3" />点击查看并播放
        </span>
      </div>
    </button>

    <UModal
      v-model:open="open"
      :title="record.name"
      :description="`${record.model} · ${record.resolution} · ${record.ratio}`"
      :ui="{
        content: 'w-[calc(100vw-2rem)] max-w-5xl max-h-[calc(100dvh-2rem)]',
        header: 'min-h-0 px-4 py-3 sm:px-5',
        wrapper: 'min-w-0 pr-9',
        title: 'break-words',
        description: 'truncate',
        body: 'min-h-0 overflow-y-auto p-3 sm:p-4',
      }"
    >
      <template #body>
        <div class="space-y-3">
          <div class="grid min-h-48 place-items-center rounded-lg bg-zinc-950">
            <video
              v-if="open && !previewError"
              ref="previewVideo"
              :src="record.videoUrl"
              controls
              playsinline
              preload="metadata"
              class="max-h-[calc(100dvh-12rem)] w-full object-contain"
              @error="previewError = true"
            >浏览器无法播放该视频。</video>
            <p v-else-if="previewError" role="alert" class="p-6 text-center text-sm text-white/80">
              视频加载失败，请确认 ComfyUI 正在运行，或打开原视频重试。
            </p>
          </div>
          <p v-if="record.prompt" class="text-sm text-muted">
            {{ record.prompt }}
          </p>
          <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
            <NuxtLink
              v-if="record.hasOriginalWorkflow"
              :to="{ path: '/workflow', query: { sourcePromptId: record.promptId } }"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <UIcon name="i-lucide-workflow" class="size-4" />查看原始工作流
            </NuxtLink>
            <a :href="record.videoUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <UIcon name="i-lucide-external-link" class="size-4" />打开原视频
            </a>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
