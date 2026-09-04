<script setup lang="ts">
import type { GenerationRecord } from '#shared/types/generation'
import { MEDIA_META } from '#shared/types/generation'
import { useClipboard } from '@vueuse/core'

const props = withDefaults(defineProps<{
  record: GenerationRecord
  mode?: 'grid' | 'masonry'
}>(), {
  mode: 'grid',
})

const emit = defineEmits<{
  select: [record: GenerationRecord]
}>()

const { copy } = useClipboard()
const copiedPrompt = ref(false)
const cardRef = ref<HTMLElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const actualRatio = ref<number>()
const isHovering = ref(false)
const shouldLoadVideo = ref(false)
let visibilityObserver: IntersectionObserver | undefined

const statusText: Record<GenerationRecord['status'], string> = {
  PENDING: '排队中',
  RUNNING: '生成中',
  SUCCEEDED: '已完成',
  FAILED: '失败',
  UNKNOWN: '未知',
}

const statusTone: Record<GenerationRecord['status'], string> = {
  PENDING: 'signal',
  RUNNING: 'signal',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  UNKNOWN: 'neutral',
}

const isVertical = computed(() => {
  const ratio = props.record.usage?.ratio || props.record.ratio
  return ratio === '9:16' || ratio === '3:4'
})

const ratioLabel = computed(() => {
  const ratio = props.record.usage?.ratio || props.record.ratio
  if (ratio === '9:16' || ratio === '3:4')
    return '竖屏'
  if (ratio === '1:1')
    return '方形'
  return '横屏'
})

const ratioStyle = computed(() => {
  if (props.mode === 'grid')
    return '4 / 3'
  if (actualRatio.value)
    return String(actualRatio.value)
  const ratio = props.record.usage?.ratio || props.record.ratio
  if (ratio === 'adaptive')
    return '16 / 9'
  return ratio.replace(':', ' / ')
})

const mediaSummary = computed(() => {
  const media = props.record.media || []
  if (!media.length)
    return '纯文本'
  const groups = new Map<string, number>()
  for (const item of media) {
    const key = item.type.includes('frame') ? '关键帧' : MEDIA_META[item.type]?.label || item.type
    groups.set(key, (groups.get(key) || 0) + 1)
  }
  return Array.from(groups.entries()).map(([label, count]) => `${label} ×${count}`).join(' · ')
})

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function onVideoLoaded(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.videoWidth && video.videoHeight)
    actualRatio.value = video.videoWidth / video.videoHeight
}

async function onMouseEnter() {
  isHovering.value = true
  if (!props.record.videoUrl)
    return
  shouldLoadVideo.value = true
  await nextTick()
  if (!videoRef.value)
    return
  videoRef.value.currentTime = 0
  videoRef.value.play().catch(() => undefined)
}

function onMouseLeave() {
  isHovering.value = false
  if (!videoRef.value)
    return
  videoRef.value.pause()
  videoRef.value.currentTime = 0
}

onMounted(() => {
  if (!cardRef.value || !props.record.videoUrl)
    return

  visibilityObserver = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) {
      shouldLoadVideo.value = true
      return
    }

    videoRef.value?.pause()
  }, { rootMargin: '240px 0px' })

  visibilityObserver.observe(cardRef.value)
})

onBeforeUnmount(() => {
  visibilityObserver?.disconnect()
  videoRef.value?.pause()
})

function copyPrompt(event: Event) {
  event.stopPropagation()
  if (!props.record.prompt)
    return
  copy(props.record.prompt)
  copiedPrompt.value = true
  window.setTimeout(() => {
    copiedPrompt.value = false
  }, 1600)
}
</script>

<template>
  <article
    ref="cardRef"
    class="generation-card"
    :class="[`mode-${mode}`, { 'is-vertical': isVertical }]"
    tabindex="0"
    @click="emit('select', record)"
    @keydown.enter="emit('select', record)"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div class="generation-card__media" :style="{ aspectRatio: ratioStyle }">
      <video
        v-if="record.videoUrl"
        ref="videoRef"
        :src="shouldLoadVideo ? record.videoUrl : undefined"
        muted
        playsinline
        loop
        preload="metadata"
        @loadedmetadata="onVideoLoaded"
      />
      <div v-else class="generation-card__placeholder">
        <UIcon :name="record.status === 'FAILED' ? 'i-lucide-circle-x' : 'i-lucide-loader-circle'" class="size-5" :class="[{ 'animate-spin': record.status !== 'FAILED' }]" />
        <span>{{ record.status === 'FAILED' ? '生成失败' : '正在渲染' }}</span>
      </div>
      <div class="generation-card__gradient" />

      <div class="generation-card__topline">
        <span class="generation-card__ratio">{{ ratioLabel }} <b>{{ record.ratio }}</b></span>
        <span v-if="record.videoArchived" class="generation-card__archive"><UIcon name="i-lucide-cloud-check" class="size-3" />已归档</span>
      </div>

      <div class="generation-card__status" :class="`is-${statusTone[record.status]}`">
        <span v-if="record.status === 'RUNNING'" class="generation-card__status-dot" />
        {{ statusText[record.status] }}
      </div>

      <div v-if="record.videoUrl" class="generation-card__play" :class="{ 'is-hidden': isHovering }">
        <UIcon name="i-lucide-play" class="size-3.5" />
      </div>

      <span v-if="record.duration" class="generation-card__duration">{{ record.duration === -1 ? '智能' : `${record.duration}s` }}</span>
    </div>

    <div class="generation-card__body">
      <p class="generation-card__prompt" :title="record.prompt || '参考素材生成'">
        {{ record.prompt || '参考素材生成' }}
      </p>

      <div class="generation-card__meta">
        <span class="generation-card__media-count" :title="mediaSummary">
          <UIcon name="i-lucide-paperclip" class="size-3" />
          <span>{{ mediaSummary }}</span>
        </span>
        <span class="generation-card__model" :title="record.model || '默认模型'">
          {{ record.model || '默认模型' }}
        </span>
      </div>

      <div class="generation-card__footer">
        <span class="generation-card__source">{{ record.provider }} <i>·</i> {{ formatDate(record.createdAt) }}</span>
        <div class="generation-card__actions">
          <button type="button" :title="copiedPrompt ? '提示词已复制' : '复制提示词'" @click="copyPrompt">
            <UIcon :name="copiedPrompt ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3" />
          </button>
          <UIcon name="i-lucide-arrow-up-right" class="generation-card__arrow size-3" />
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.generation-card {
  --card-surface: color-mix(in srgb, var(--ui-bg-elevated) 90%, transparent);
  --card-line: color-mix(in srgb, var(--ui-border) 60%, transparent);
  --card-ink: var(--ui-text-highlighted);
  --card-muted: var(--ui-text-muted);
  --card-dim: var(--ui-text-dimmed);
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--card-line);
  border-radius: 0.75rem;
  background: var(--card-surface);
  cursor: pointer;
  outline: none;
  box-shadow: 0 0.5rem 1.25rem -0.75rem rgb(0 0 0 / 40%);
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 220ms var(--ease-cinematic),
    box-shadow 220ms var(--ease-cinematic);
}

.dark .generation-card {
  --card-surface: rgb(18 20 25 / 92%);
  --card-line: rgb(255 255 255 / 8%);
}

.generation-card:hover,
.generation-card:focus-visible {
  border-color: color-mix(in srgb, var(--color-signal-500) 60%, var(--card-line));
  background: var(--ui-bg-elevated);
  transform: translateY(-3px);
  box-shadow: 0 1rem 1.75rem -0.75rem rgb(0 0 0 / 60%);
}

.generation-card:focus-visible {
  box-shadow:
    0 0 0 3px rgb(255 77 53 / 18%),
    0 1rem 1.75rem -0.75rem rgb(0 0 0 / 60%);
}

.mode-masonry {
  break-inside: avoid;
  margin-bottom: 0.875rem;
}

.generation-card__media {
  position: relative;
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #090a0d;
}

.generation-card__media video {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition:
    transform 400ms var(--ease-cinematic),
    filter 240ms ease;
}

.generation-card:hover .generation-card__media video {
  transform: scale(1.02);
  filter: saturate(1.04);
}

.generation-card__placeholder {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 0.4rem;
  color: #9298a3;
  font-size: 0.7rem;
}

.generation-card__placeholder span:first-child {
  color: var(--color-signal-500);
}

.generation-card__gradient {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: linear-gradient(180deg, rgb(0 0 0 / 40%) 0%, transparent 28%, transparent 68%, rgb(0 0 0 / 58%) 100%);
  pointer-events: none;
}

.generation-card__topline {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  left: 0.5rem;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  color: white;
  font-size: 0.6rem;
}

.generation-card__ratio,
.generation-card__archive,
.generation-card__duration {
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  padding: 0.2rem 0.38rem;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 0.3rem;
  background: rgb(0 0 0 / 40%);
  backdrop-filter: blur(8px);
  line-height: 1;
}

.generation-card__ratio b {
  color: rgb(255 255 255 / 75%);
  font-weight: 500;
}

.generation-card__archive {
  color: #9ae7be;
}

.generation-card__status {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  z-index: 3;
  padding: 0.2rem 0.38rem;
  border-radius: 0.3rem;
  background: rgb(0 0 0 / 50%);
  color: rgb(255 255 255 / 86%);
  font-size: 0.6rem;
  font-weight: 600;
  line-height: 1;
  backdrop-filter: blur(8px);
}

.generation-card__status.is-signal {
  color: #ff9e8d;
}
.generation-card__status.is-success {
  color: #9ae7be;
}
.generation-card__status.is-danger {
  color: #ff9eaf;
}

.generation-card__status-dot {
  display: inline-block;
  width: 0.3rem;
  height: 0.3rem;
  margin-right: 0.18rem;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0.4rem currentColor;
}

.generation-card__play {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  color: white;
  opacity: 0.85;
  transition:
    opacity 180ms ease,
    transform 200ms var(--ease-cinematic);
}

.generation-card__play span {
  display: grid;
  width: 2.2rem;
  height: 2.2rem;
  place-items: center;
  padding-left: 0.1rem;
  border: 1px solid rgb(255 255 255 / 30%);
  border-radius: 50%;
  background: rgb(0 0 0 / 38%);
  backdrop-filter: blur(6px);
}

.generation-card:hover .generation-card__play {
  opacity: 1;
  transform: scale(1.06);
}

.generation-card__play.is-hidden {
  opacity: 0;
  pointer-events: none;
}

.generation-card__duration {
  position: absolute;
  left: 0.5rem;
  bottom: 0.5rem;
  z-index: 3;
  color: white;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.generation-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0.65rem 0.75rem 0.6rem;
}

.generation-card__prompt {
  display: -webkit-box;
  overflow: hidden;
  min-height: 2.2rem;
  color: var(--card-ink);
  font-size: 0.73rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.generation-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  margin-top: 0.5rem;
  color: var(--card-dim);
  font-size: 0.62rem;
}

.generation-card__model {
  max-width: 48%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generation-card__media-count {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.2rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generation-card__media-count > span:first-child {
  color: var(--color-signal-500);
}

.generation-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  margin-top: auto;
  padding-top: 0.5rem;
  border-top: 1px solid var(--card-line);
  color: var(--card-dim);
  font-size: 0.62rem;
}

.generation-card__source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generation-card__source i {
  padding-inline: 0.15rem;
  font-style: normal;
}

.generation-card__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.25rem;
}

.generation-card__actions button {
  display: grid;
  width: 1.45rem;
  height: 1.45rem;
  place-items: center;
  border-radius: 0.35rem;
  color: var(--card-dim);
  transition:
    background 150ms ease,
    color 150ms ease;
}

.generation-card__actions button:hover {
  background: color-mix(in srgb, var(--ui-bg) 80%, transparent);
  color: var(--card-ink);
}

.generation-card__actions button .i-lucide-check {
  color: #53dba0;
}

.generation-card__arrow {
  color: var(--card-dim);
  transition:
    color 160ms ease,
    transform 160ms var(--ease-cinematic);
}

.generation-card:hover .generation-card__arrow {
  color: var(--color-signal-400);
  transform: translate(2px, -2px);
}

@media (prefers-reduced-motion: reduce) {
  .generation-card,
  .generation-card__media video,
  .generation-card__play,
  .generation-card__arrow {
    transition: none;
  }
}
</style>
