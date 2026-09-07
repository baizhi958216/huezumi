<script setup lang="ts">
import type { GenerationRecord, MediaInput } from '#shared/types/generation'
import { MEDIA_META, MODE_META } from '#shared/types/generation'
import { useClipboard } from '@vueuse/core'
import MediaPreviewModal from './MediaPreviewModal.vue'

const props = defineProps<{
  record?: GenerationRecord
  open: boolean
  currentIndex?: number
  totalCount?: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'prev': []
  'next': []
  'refresh': [record: GenerationRecord]
}>()

const router = useRouter()
const { copy } = useClipboard()
const copiedKey = ref<string>()

function copyText(text: string, key: string) {
  copy(text)
  copiedKey.value = key
  setTimeout(() => {
    if (copiedKey.value === key)
      copiedKey.value = undefined
  }, 2000)
}

const statusText: Record<string, string> = {
  PENDING: '排队中',
  RUNNING: '生成中',
  SUCCEEDED: '已完成',
  FAILED: '生成失败',
  UNKNOWN: '状态未知',
}

const statusColor: Record<string, 'warning' | 'info' | 'success' | 'error' | 'neutral'> = {
  PENDING: 'warning',
  RUNNING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'error',
  UNKNOWN: 'neutral',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

// 视频播放控制与真实画幅计算
const videoRef = ref<HTMLVideoElement | null>()
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isMuted = ref(false)
const isLooping = ref(true)
const playbackRate = ref(1)
const actualVideoRatio = ref<number>()

function onVideoLoadedMetadata() {
  if (videoRef.value) {
    duration.value = videoRef.value.duration || 0
    if (videoRef.value.videoWidth && videoRef.value.videoHeight) {
      actualVideoRatio.value = videoRef.value.videoWidth / videoRef.value.videoHeight
    }
  }
}

function onTimeUpdate() {
  if (videoRef.value)
    currentTime.value = videoRef.value.currentTime
}

function togglePlay() {
  if (!videoRef.value)
    return
  if (videoRef.value.paused) {
    videoRef.value.play()
    isPlaying.value = true
  }
  else {
    videoRef.value.pause()
    isPlaying.value = false
  }
}

function onSeek(event: Event) {
  const target = event.target as HTMLInputElement
  const time = Number(target.value)
  if (videoRef.value && Number.isFinite(time)) {
    videoRef.value.currentTime = time
    currentTime.value = time
  }
}

function setPlaybackRate(rate: number) {
  playbackRate.value = rate
  if (videoRef.value)
    videoRef.value.playbackRate = rate
}

function toggleMute() {
  isMuted.value = !isMuted.value
  if (videoRef.value)
    videoRef.value.muted = isMuted.value
}

function toggleFullscreen() {
  if (!videoRef.value)
    return
  if (document.fullscreenElement) {
    document.exitFullscreen()
  }
  else {
    videoRef.value.requestFullscreen()
  }
}

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0)
    return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// 重置视频状态
watch(() => props.record?.id, () => {
  actualVideoRatio.value = undefined
  isPlaying.value = false
  currentTime.value = 0
  duration.value = 0
  playbackRate.value = 1
})

const ratioNum = computed(() => {
  if (actualVideoRatio.value)
    return actualVideoRatio.value
  const str = props.record?.usage?.ratio || props.record?.ratio || '16:9'
  if (str === 'adaptive')
    return 16 / 9
  const [w, h] = str.split(':').map(Number)
  if (w && h && !Number.isNaN(w) && !Number.isNaN(h))
    return w / h
  return 16 / 9
})

const isVertical = computed(() => ratioNum.value < 0.95)

// 原图/参考素材放大预览
const activeMediaPreview = ref<MediaInput>()
const mediaPreviewOpen = ref(false)

function openMediaPreview(item: MediaInput) {
  activeMediaPreview.value = item
  mediaPreviewOpen.value = true
}

// 键盘快捷键监听
function onKeyDown(e: KeyboardEvent) {
  if (!props.open)
    return
  if (e.key === 'Escape') {
    if (mediaPreviewOpen.value) {
      mediaPreviewOpen.value = false
    }
    else {
      emit('update:open', false)
    }
  }
  else if (e.key === 'ArrowLeft' && !mediaPreviewOpen.value) {
    emit('prev')
  }
  else if (e.key === 'ArrowRight' && !mediaPreviewOpen.value) {
    emit('next')
  }
  else if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault()
    togglePlay()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

function reuseInStudio() {
  if (!props.record)
    return
  emit('update:open', false)
  router.push({ path: '/studio', query: { from: props.record.id } })
}

const refreshing = ref(false)
async function triggerRefresh() {
  if (!props.record)
    return
  refreshing.value = true
  try {
    emit('refresh', props.record)
  }
  finally {
    setTimeout(() => {
      refreshing.value = false
    }, 600)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-98"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-98"
    >
      <div
        v-if="open && record"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-md dark:bg-black/85 sm:p-6"
        @click.self="emit('update:open', false)"
      >
        <!-- 弹窗主框体 -->
        <div class="relative flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-default bg-elevated shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 lg:h-[88vh]">
          <!-- 顶栏导航与状态条 -->
          <div class="flex shrink-0 items-center justify-between border-b border-default bg-elevated px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/60 sm:px-6">
            <div class="flex items-center gap-3">
              <UBadge :color="statusColor[record.status]" variant="solid" size="md">
                {{ statusText[record.status] }}
              </UBadge>
              <UBadge color="neutral" variant="subtle" size="md">
                {{ record.provider }} · {{ record.model || '默认模型' }}
              </UBadge>
              <UBadge v-if="isVertical" color="primary" variant="subtle" size="md">
                竖屏 {{ record.ratio }}
              </UBadge>
              <UBadge v-else color="neutral" variant="subtle" size="md">
                横屏 {{ record.ratio }}
              </UBadge>
              <UBadge v-if="record.videoArchived" color="success" variant="subtle" size="md">
                <UIcon name="i-lucide-circle-check" class="mr-1 size-3.5" />
                OSS 已持久归档
              </UBadge>
            </div>

            <!-- 上下件切换与关闭按钮 -->
            <div class="flex items-center gap-1.5 sm:gap-2">
              <span v-if="currentIndex !== undefined && totalCount" class="mr-2 font-mono text-xs text-muted dark:text-zinc-400">
                {{ currentIndex + 1 }} / {{ totalCount }}
              </span>
              <button
                type="button"
                class="rounded-lg p-1.5 text-muted transition hover:bg-muted hover:text-highlighted dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white disabled:opacity-30"
                :disabled="currentIndex === 0"
                title="上一个作品 (Left Arrow)"
                @click="emit('prev')"
              >
                <UIcon name="i-lucide-chevron-left" class="size-5" />
              </button>
              <button
                type="button"
                class="rounded-lg p-1.5 text-muted transition hover:bg-muted hover:text-highlighted dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white disabled:opacity-30"
                :disabled="currentIndex !== undefined && totalCount !== undefined && currentIndex >= totalCount - 1"
                title="下一个作品 (Right Arrow)"
                @click="emit('next')"
              >
                <UIcon name="i-lucide-chevron-right" class="size-5" />
              </button>
              <div class="mx-1 h-4 w-px bg-default dark:bg-zinc-800" />
              <button
                type="button"
                class="rounded-lg p-1.5 text-muted transition hover:bg-muted hover:text-highlighted dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                title="关闭 (Esc)"
                @click="emit('update:open', false)"
              >
                <UIcon name="i-lucide-x" class="size-5" />
              </button>
            </div>
          </div>

          <!-- 双栏主体：左侧视频舞台，右侧规格与素材检视器 -->
          <div class="flex flex-1 flex-col overflow-hidden lg:flex-row">
            <!-- 左侧：真实画幅视频主舞台 -->
            <div class="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-black/95 p-3 sm:p-5">
              <!-- 视频主呈现区：保证无论横屏竖屏都严格按真实宽高比呈现，决不裁切！ -->
              <div class="relative h-full max-h-[72vh] w-full flex items-center justify-center">
                <template v-if="record.videoUrl">
                  <div
                    class="relative flex items-center justify-center overflow-hidden rounded-xl shadow-2xl"
                    :style="{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      aspectRatio: `${ratioNum}`,
                    }"
                  >
                    <video
                      ref="videoRef"
                      :src="record.videoUrl"
                      :loop="isLooping"
                      playsinline
                      class="h-full w-full object-contain"
                      @loadedmetadata="onVideoLoadedMetadata"
                      @timeupdate="onTimeUpdate"
                      @play="isPlaying = true"
                      @pause="isPlaying = false"
                      @ended="isPlaying = false"
                      @click="togglePlay"
                    />

                    <!-- 点击中央播放遮罩 -->
                    <button
                      v-if="!isPlaying"
                      type="button"
                      class="absolute inset-0 flex items-center justify-center bg-black/25 transition hover:bg-black/10"
                      @click="togglePlay"
                    >
                      <div class="h-16 w-16 flex items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition hover:scale-110 hover:bg-primary">
                        <UIcon name="i-lucide-play" class="ml-0.5 size-7" />
                      </div>
                    </button>
                  </div>
                </template>

                <!-- 非成功状态占位 -->
                <div v-else class="flex flex-col items-center justify-center gap-3 text-center">
                  <div
                    class="h-16 w-16 flex items-center justify-center rounded-2xl"
                    :class="record.status === 'FAILED' ? 'bg-red-500/10 text-red-400' : 'bg-primary/10 text-primary'"
                  >
                    <UIcon
                      :name="record.status === 'FAILED' ? 'i-lucide-circle-x' : 'i-lucide-loader-circle'"
                      class="size-8"
                      :class="{ 'animate-spin': record.status !== 'FAILED' }"
                    />
                  </div>
                  <div>
                    <p class="text-base font-medium text-zinc-200">
                      {{ record.status === 'FAILED' ? (record.error || '生成失败') : '任务进行中' }}
                    </p>
                    <p class="mt-1 text-xs text-zinc-400">
                      {{ record.status === 'FAILED' ? '请检查参数设置或重试' : '云端正在调度算力渲染视频画面，请稍候' }}
                    </p>
                  </div>
                  <UButton
                    v-if="record.status === 'FAILED' || record.status === 'UNKNOWN'"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-refresh-cw"
                    :loading="refreshing"
                    @click="triggerRefresh"
                  >
                    重新查询原任务
                  </UButton>
                </div>
              </div>

              <!-- 播放器控制条 -->
              <div v-if="record.videoUrl" class="mt-3 w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-2.5 backdrop-blur-md">
                <!-- 进度条 -->
                <div class="flex items-center gap-3">
                  <span class="text-[11px] font-mono text-zinc-400">{{ formatTime(currentTime) }}</span>
                  <input
                    type="range"
                    min="0"
                    :max="duration || 100"
                    step="0.05"
                    :value="currentTime"
                    class="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-zinc-700 accent-primary"
                    @input="onSeek"
                  >
                  <span class="text-[11px] font-mono text-zinc-400">{{ formatTime(duration) }}</span>
                </div>

                <!-- 控制按钮组 -->
                <div class="mt-2 flex items-center justify-between">
                  <div class="flex items-center gap-1 sm:gap-2">
                    <button
                      type="button"
                      class="rounded-lg p-1.5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      :title="isPlaying ? '暂停 (Space)' : '播放 (Space)'"
                      @click="togglePlay"
                    >
                      <UIcon :name="isPlaying ? 'i-lucide-pause' : 'i-lucide-play'" class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="rounded-lg p-1.5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      :title="isLooping ? '循环播放: 开启' : '循环播放: 关闭'"
                      :class="{ 'text-primary': isLooping }"
                      @click="isLooping = !isLooping"
                    >
                      <UIcon name="i-lucide-rotate-ccw" class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="rounded-lg p-1.5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      :title="isMuted ? '取消静音' : '静音'"
                      @click="toggleMute"
                    >
                      <UIcon :name="isMuted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'" class="size-4" />
                    </button>

                    <!-- 倍速切换 -->
                    <div class="ml-1 flex items-center rounded-lg border border-white/10 bg-zinc-800/80 p-0.5 text-xs">
                      <button
                        v-for="rate in [0.5, 1.0, 1.5, 2.0]"
                        :key="rate"
                        type="button"
                        class="rounded px-1.5 py-0.5 font-mono text-[10px] transition"
                        :class="playbackRate === rate ? 'bg-primary text-white font-semibold' : 'text-zinc-400 hover:text-white'"
                        @click="setPlaybackRate(rate)"
                      >
                        {{ rate }}x
                      </button>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <a
                      :href="record.videoUrl"
                      target="_blank"
                      download
                      class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      title="下载视频"
                    >
                      <UIcon name="i-lucide-download" class="size-3.5" />
                      <span class="hidden sm:inline">下载</span>
                    </a>
                    <button
                      type="button"
                      class="rounded-lg p-1.5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      title="全屏播放"
                      @click="toggleFullscreen"
                    >
                      <UIcon name="i-lucide-maximize" class="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 右侧：全维度生成检视面板 (Prompt, Reference Materials, Parameters) -->
            <div class="studio-scroll flex flex-col overflow-y-auto border-t border-default bg-default dark:border-zinc-800 dark:bg-zinc-900/40 lg:w-[460px] lg:border-l lg:border-t-0">
              <!-- 快捷创作联动卡片 -->
              <div class="border-b border-default bg-muted/50 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/70 sm:p-5">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-sm font-semibold text-highlighted dark:text-zinc-100">
                      {{ MODE_META[record.mode]?.label || 'AI 视频生成' }}
                    </h3>
                    <p class="mt-0.5 text-xs text-muted dark:text-zinc-400">
                      {{ formatDate(record.createdAt) }}
                    </p>
                  </div>
                  <UButton
                    color="primary"
                    size="sm"
                    icon="i-lucide-sparkles"
                    @click="reuseInStudio"
                  >
                    在创作台中复用
                  </UButton>
                </div>
              </div>

              <!-- 提示词模块 -->
              <div class="space-y-4 border-b border-default p-4 dark:border-zinc-800/80 sm:p-5">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="type-kicker text-xs text-muted dark:text-zinc-400">PROMPT / 正向提示词</span>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted transition hover:bg-muted hover:text-highlighted dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                      @click="copyText(record.prompt, 'prompt')"
                    >
                      <UIcon :name="copiedKey === 'prompt' ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3.5" :class="{ 'text-emerald-400': copiedKey === 'prompt' }" />
                      <span>{{ copiedKey === 'prompt' ? '已复制' : '复制' }}</span>
                    </button>
                  </div>
                  <div class="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-default bg-muted/50 p-3 text-xs leading-relaxed text-toned dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200">
                    {{ record.prompt || '（无提示词）' }}
                  </div>
                </div>

                <!-- 反向提示词 -->
                <div v-if="record.negativePrompt">
                  <div class="flex items-center justify-between">
                    <span class="type-kicker text-xs text-muted dark:text-zinc-400">NEGATIVE PROMPT / 负向提示词</span>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted transition hover:bg-muted hover:text-highlighted dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                      @click="copyText(record.negativePrompt, 'negativePrompt')"
                    >
                      <UIcon :name="copiedKey === 'negativePrompt' ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3.5" :class="{ 'text-emerald-400': copiedKey === 'negativePrompt' }" />
                      <span>{{ copiedKey === 'negativePrompt' ? '已复制' : '复制' }}</span>
                    </button>
                  </div>
                  <div class="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl border border-default bg-muted/50 p-3 text-xs leading-relaxed text-toned dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
                    {{ record.negativePrompt }}
                  </div>
                </div>
              </div>

              <!-- 原始参考素材展区 (Reference Materials) -->
              <div class="border-b border-default dark:border-zinc-800/80 p-4 sm:p-5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="type-kicker text-xs text-muted dark:text-zinc-400">REFERENCE MEDIA / 原始参考素材</span>
                    <UBadge color="neutral" variant="subtle" size="xs">
                      {{ record.media?.length || 0 }}
                    </UBadge>
                  </div>
                  <span class="text-[11px] text-dimmed dark:text-zinc-500">点击可原尺寸放大或试听</span>
                </div>

                <!-- 素材列表 -->
                <div v-if="record.media?.length" class="mt-3 space-y-2">
                  <div
                    v-for="(item, idx) in record.media"
                    :key="`${item.url}-${idx}`"
                    class="group flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-default bg-elevated p-2.5 transition hover:border-accented hover:bg-muted/70 dark:border-zinc-800/90 dark:bg-zinc-950/50 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80"
                    @click="openMediaPreview(item)"
                  >
                    <div class="min-w-0 flex items-center gap-2.5">
                      <!-- 缩略图或图标 -->
                      <div class="relative h-11 w-11 shrink-0 flex items-center justify-center overflow-hidden rounded-lg bg-muted dark:bg-zinc-900">
                        <img
                          v-if="item.type.includes('frame') || item.type === 'reference_image'"
                          :src="item.url"
                          :alt="item.name || '参考图'"
                          class="h-full w-full object-cover transition group-hover:scale-105"
                        >
                        <UIcon v-else-if="item.type === 'reference_video'" name="i-lucide-video" class="size-6 text-amber-400" />
                        <UIcon v-else-if="item.type === 'reference_audio'" name="i-lucide-audio-lines" class="size-6 text-emerald-400" />
                        <UIcon v-else name="i-lucide-file-text" class="size-6 text-muted dark:text-zinc-400" />
                      </div>

                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5">
                          <UBadge
                            :color="item.type.includes('frame') ? 'warning' : item.type === 'reference_video' ? 'info' : item.type === 'reference_audio' ? 'success' : 'neutral'"
                            variant="subtle"
                            size="xs"
                          >
                            {{ MEDIA_META[item.type]?.label || item.type }}
                          </UBadge>
                          <span v-if="item.duration" class="text-[10px] font-mono text-muted dark:text-zinc-400">
                            {{ item.duration }}秒
                          </span>
                        </div>
                        <p class="mt-1 truncate text-xs text-toned group-hover:text-highlighted dark:text-zinc-300 dark:group-hover:text-white" :title="item.name || item.url">
                          {{ item.name || item.url }}
                        </p>
                      </div>
                    </div>

                    <UIcon name="i-lucide-external-link" class="size-3.5 shrink-0 text-dimmed transition group-hover:text-toned dark:text-zinc-500 dark:group-hover:text-zinc-300" />
                  </div>
                </div>

                <div v-else class="mt-2 rounded-xl border border-dashed border-default dark:border-zinc-800/80 py-4 text-center">
                  <p class="text-xs text-dimmed dark:text-zinc-500">
                    此任务为纯文本生成，未附带原始参考素材。
                  </p>
                </div>
              </div>

              <!-- 规格参数清单 (Technical Parameters) -->
              <div class="p-4 sm:p-5 space-y-3">
                <span class="type-kicker text-xs text-muted dark:text-zinc-400">SPECIFICATIONS / 技术参数</span>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div class="rounded-lg border border-default bg-muted/50 dark:border-zinc-800/70 dark:bg-zinc-950/40 p-2.5">
                    <span class="text-dimmed dark:text-zinc-500">供应商平台</span>
                    <p class="mt-0.5 font-medium text-toned dark:text-zinc-200">
                      {{ record.provider }}
                    </p>
                  </div>
                  <div class="rounded-lg border border-default bg-muted/50 dark:border-zinc-800/70 dark:bg-zinc-950/40 p-2.5">
                    <span class="text-dimmed dark:text-zinc-500">模型版本</span>
                    <p class="mt-0.5 truncate font-medium text-toned dark:text-zinc-200" :title="record.model">
                      {{ record.model || '标准默认' }}
                    </p>
                  </div>
                  <div class="rounded-lg border border-default bg-muted/50 dark:border-zinc-800/70 dark:bg-zinc-950/40 p-2.5">
                    <span class="text-dimmed dark:text-zinc-500">清晰度</span>
                    <p class="mt-0.5 font-medium text-toned dark:text-zinc-200">
                      {{ record.resolution }}
                    </p>
                  </div>
                  <div class="rounded-lg border border-default bg-muted/50 dark:border-zinc-800/70 dark:bg-zinc-950/40 p-2.5">
                    <span class="text-dimmed dark:text-zinc-500">设定画幅</span>
                    <p class="mt-0.5 font-medium text-toned dark:text-zinc-200">
                      {{ record.ratio }}
                    </p>
                  </div>
                  <div class="rounded-lg border border-default bg-muted/50 dark:border-zinc-800/70 dark:bg-zinc-950/40 p-2.5">
                    <span class="text-dimmed dark:text-zinc-500">生成时长</span>
                    <p class="mt-0.5 font-medium text-toned dark:text-zinc-200">
                      {{ record.duration === -1 ? '模型智能决策' : `${record.duration} 秒` }}
                    </p>
                  </div>
                  <div class="rounded-lg border border-default bg-muted/50 dark:border-zinc-800/70 dark:bg-zinc-950/40 p-2.5">
                    <span class="text-dimmed dark:text-zinc-500">生成音频</span>
                    <p class="mt-0.5 font-medium text-toned dark:text-zinc-200">
                      {{ record.audio ? '开启声画同步' : '纯画面静音' }}
                    </p>
                  </div>
                  <div class="rounded-lg border border-default bg-muted/50 dark:border-zinc-800/70 dark:bg-zinc-950/40 p-2.5">
                    <div class="flex items-center justify-between">
                      <span class="text-dimmed dark:text-zinc-500">随机种子 (Seed)</span>
                      <button
                        v-if="record.seed !== undefined"
                        type="button"
                        class="text-[10px] text-muted dark:text-zinc-400 hover:text-highlighted dark:hover:text-white"
                        @click="copyText(String(record.seed), 'seed')"
                      >
                        {{ copiedKey === 'seed' ? '已复制' : '复制' }}
                      </button>
                    </div>
                    <p class="mt-0.5 font-mono text-toned dark:text-zinc-200">
                      {{ record.seed ?? '随机自动' }}
                    </p>
                  </div>
                  <div class="rounded-lg border border-default bg-muted/50 dark:border-zinc-800/70 dark:bg-zinc-950/40 p-2.5">
                    <span class="text-dimmed dark:text-zinc-500">智能改写 / 水印</span>
                    <p class="mt-0.5 font-medium text-toned dark:text-zinc-200">
                      {{ record.promptExtend ? '改写:开' : '改写:关' }} · {{ record.watermark ? '带水印' : '无水印' }}
                    </p>
                  </div>
                </div>

                <!-- 任务与持久化存储状态 -->
                <div class="space-y-2 rounded-xl border border-default bg-muted/50 p-3 text-xs dark:border-zinc-800/80 dark:bg-zinc-950/60">
                  <div class="flex items-center justify-between">
                    <span class="text-dimmed dark:text-zinc-500">本地任务 ID</span>
                    <button
                      type="button"
                      class="font-mono text-[11px] text-muted dark:text-zinc-400 transition hover:text-highlighted dark:hover:text-white"
                      @click="copyText(record.id, 'taskId')"
                    >
                      {{ record.id.slice(0, 16) }}...
                      <UIcon :name="copiedKey === 'taskId' ? 'i-lucide-check' : 'i-lucide-copy'" class="inline size-3" :class="{ 'text-emerald-400': copiedKey === 'taskId' }" />
                    </button>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-dimmed dark:text-zinc-500">供应商任务 ID</span>
                    <span class="font-mono text-[11px] text-muted dark:text-zinc-400">
                      {{ record.providerTaskId ? `${record.providerTaskId.slice(0, 16)}...` : '—' }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-dimmed dark:text-zinc-500">创建时间</span>
                    <span class="text-[11px] text-toned dark:text-zinc-300">{{ formatDate(record.createdAt) }}</span>
                  </div>
                  <div class="flex items-center justify-between border-t border-default dark:border-zinc-800/80 pt-2">
                    <span class="text-dimmed dark:text-zinc-500">OSS 结果归档</span>
                    <div class="flex items-center gap-1.5">
                      <UBadge
                        :color="record.videoArchived ? 'success' : record.outputArchive?.status === 'failed' ? 'warning' : 'neutral'"
                        variant="subtle"
                        size="xs"
                      >
                        {{ record.videoArchived ? '已持久归档' : record.outputArchive?.status === 'failed' ? '归档失败' : '供应商临时链接' }}
                      </UBadge>
                      <button
                        v-if="record.status === 'SUCCEEDED' && !record.videoArchived"
                        type="button"
                        class="text-[11px] text-primary transition hover:underline"
                        :disabled="refreshing"
                        @click="triggerRefresh"
                      >
                        {{ record.outputArchive?.status === 'failed' ? '重试归档' : '立即归档' }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 原图/素材独立弹窗 -->
    <MediaPreviewModal
      v-model:open="mediaPreviewOpen"
      :item="activeMediaPreview"
    />
  </Teleport>
</template>
