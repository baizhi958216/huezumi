<script setup lang="ts">
import type { GenerationRecord } from '#shared/types/generation'
import { MEDIA_META } from '#shared/types/generation'
import { useClipboard } from '@vueuse/core'

const props = defineProps<{
  record: GenerationRecord
}>()

const emit = defineEmits<{
  select: [record: GenerationRecord]
}>()

const { copy } = useClipboard()
const copiedPrompt = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)
const actualRatio = ref<number>()
const isHovering = ref(false)

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

const ratioLabel = computed(() => {
  const ratio = props.record.usage?.ratio || props.record.ratio
  if (ratio === '9:16' || ratio === '3:4')
    return '竖屏'
  if (ratio === '1:1')
    return '方形'
  return '横屏'
})

const ratioStyle = computed(() => {
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
    return '纯文本生成'
  const groups = new Map<string, number>()
  for (const item of media) {
    const key = item.type.includes('frame') ? '关键帧' : MEDIA_META[item.type]?.label || item.type
    groups.set(key, (groups.get(key) || 0) + 1)
  }
  return Array.from(groups.entries()).map(([label, count]) => `${label} ×${count}`).join(' · ')
})

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function onVideoLoaded(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.videoWidth && video.videoHeight)
    actualRatio.value = video.videoWidth / video.videoHeight
}

function onMouseEnter() {
  isHovering.value = true
  if (!videoRef.value || !props.record.videoUrl)
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
    class="generation-card"
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
        :src="record.videoUrl"
        muted
        playsinline
        loop
        autoplay
        @loadedmetadata="onVideoLoaded"
      />
      <div v-else class="generation-card__placeholder">
        <UIcon :name="record.status === 'FAILED' ? 'i-lucide-circle-x' : 'i-lucide-loader-circle'" class="size-6" :class="[{ 'animate-spin': record.status !== 'FAILED' }]" />
        <span>{{ record.status === 'FAILED' ? '生成失败' : '正在渲染' }}</span>
      </div>
      <div class="generation-card__gradient" />
      <div class="generation-card__topline">
        <span class="generation-card__ratio">{{ ratioLabel }} <b>{{ record.ratio }}</b></span>
        <span v-if="record.videoArchived" class="generation-card__archive"><UIcon name="i-lucide-cloud-check" class="size-3" /> 已归档</span>
      </div>
      <div class="generation-card__status" :class="`is-${statusTone[record.status]}`">
        <span v-if="record.status === 'RUNNING'" class="generation-card__status-dot" />
        {{ statusText[record.status] }}
      </div>
      <div v-if="record.videoUrl" class="generation-card__play" :class="{ 'is-hidden': isHovering }">
        <UIcon name="i-lucide-play" class="size-4" />
      </div>
      <span v-if="record.duration" class="generation-card__duration">{{ record.duration === -1 ? '智能' : `${record.duration}s` }}</span>
    </div>

    <div class="generation-card__body">
      <p class="generation-card__prompt" :title="record.prompt || '参考素材生成'">
        {{ record.prompt || '参考素材生成' }}
      </p>
      <div class="generation-card__meta">
        <span class="generation-card__media-count"><UIcon name="i-lucide-paperclip" class="size-3" />{{ mediaSummary }}</span>
        <span>{{ record.model || '默认模型' }}</span>
      </div>
      <div class="generation-card__footer">
        <span>{{ record.provider }} <i>·</i> {{ formatDate(record.createdAt) }}</span>
        <div class="generation-card__actions">
          <button type="button" :title="copiedPrompt ? '提示词已复制' : '复制提示词'" @click="copyPrompt">
            <UIcon :name="copiedPrompt ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3.5" />
          </button>
          <UIcon name="i-lucide-arrow-up-right" class="generation-card__arrow size-3.5" />
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.generation-card {
  --card-surface: color-mix(in srgb, var(--ui-bg-elevated) 86%, transparent);
  --card-line: color-mix(in srgb, var(--ui-border) 72%, transparent);
  --card-ink: var(--ui-text-highlighted);
  --card-muted: var(--ui-text-muted);
  --card-dim: var(--ui-text-dimmed);
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--card-line);
  border-radius: 0.95rem;
  background: var(--card-surface);
  cursor: pointer;
  outline: none;
  box-shadow: 0 1rem 2rem -1.5rem rgb(0 0 0 / 60%);
  transition:
    border-color 220ms ease,
    background 220ms ease,
    transform 260ms var(--ease-cinematic),
    box-shadow 260ms var(--ease-cinematic);
}

.dark .generation-card {
  --card-surface: rgb(18 20 25 / 86%);
  --card-line: rgb(255 255 255 / 10%);
}
.generation-card:hover,
.generation-card:focus-visible {
  border-color: color-mix(in srgb, var(--color-signal-500) 52%, var(--card-line));
  background: var(--ui-bg-elevated);
  transform: translateY(-4px);
  box-shadow: 0 1.5rem 2.5rem -1.5rem rgb(0 0 0 / 75%);
}
.generation-card:focus-visible {
  box-shadow:
    0 0 0 3px rgb(255 77 53 / 18%),
    0 1.5rem 2.5rem -1.5rem rgb(0 0 0 / 75%);
}
.generation-card__media {
  position: relative;
  display: flex;
  min-height: 11rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #090a0d;
}
.generation-card__media video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition:
    transform 500ms var(--ease-cinematic),
    filter 280ms ease;
}
.generation-card:hover .generation-card__media video {
  transform: scale(1.025);
  filter: saturate(1.05);
}
.generation-card__placeholder {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  color: #9298a3;
  font-size: 0.72rem;
}
.generation-card__placeholder span:first-child {
  color: var(--color-signal-500);
  font-size: 1.5rem;
}
.generation-card__gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgb(0 0 0 / 44%), transparent 32%, transparent 66%, rgb(0 0 0 / 64%));
  pointer-events: none;
}
.generation-card__topline {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  left: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  color: white;
  font-size: 0.62rem;
}
.generation-card__ratio,
.generation-card__archive,
.generation-card__duration {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  padding: 0.27rem 0.45rem;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 0.35rem;
  background: rgb(0 0 0 / 34%);
  backdrop-filter: blur(10px);
}
.generation-card__ratio b {
  color: rgb(255 255 255 / 68%);
  font-weight: 500;
}
.generation-card__archive {
  color: #9ae7be;
}
.generation-card__status {
  position: absolute;
  right: 0.75rem;
  bottom: 0.72rem;
  padding: 0.25rem 0.45rem;
  border-radius: 0.35rem;
  background: rgb(0 0 0 / 42%);
  color: rgb(255 255 255 / 82%);
  font-size: 0.62rem;
  font-weight: 650;
  backdrop-filter: blur(10px);
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
  width: 0.32rem;
  height: 0.32rem;
  margin-right: 0.2rem;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0.45rem currentColor;
}
.generation-card__play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: white;
  opacity: 0.8;
  transition:
    opacity 220ms ease,
    transform 240ms var(--ease-cinematic);
}
.generation-card__play span {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  padding-left: 0.13rem;
  border: 1px solid rgb(255 255 255 / 32%);
  border-radius: 50%;
  background: rgb(0 0 0 / 35%);
  font-size: 0.95rem;
  backdrop-filter: blur(8px);
}
.generation-card:hover .generation-card__play {
  color: white;
  opacity: 1;
  transform: scale(1.08);
}
.generation-card__play.is-hidden {
  opacity: 0;
}
.generation-card__duration {
  position: absolute;
  right: 0.75rem;
  bottom: 0.7rem;
  color: white;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  transform: translateX(-4.4rem);
}
.generation-card__body {
  display: flex;
  min-height: 8.8rem;
  flex: 1;
  flex-direction: column;
  padding: 0.9rem 1rem 0.85rem;
}
.generation-card__prompt {
  display: -webkit-box;
  overflow: hidden;
  min-height: 2.55rem;
  color: var(--card-ink);
  font-size: 0.76rem;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.generation-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.75rem;
  color: var(--card-dim);
  font-size: 0.64rem;
}
.generation-card__meta > span:last-child {
  max-width: 44%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.generation-card__media-count {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.28rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.generation-card__media-count > span {
  color: var(--color-signal-500);
  font-size: 0.73rem;
}
.generation-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 0.8rem;
  border-top: 1px solid var(--card-line);
  color: var(--card-dim);
  font-size: 0.63rem;
}
.generation-card__footer > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.generation-card__footer i {
  padding-inline: 0.2rem;
  font-style: normal;
}
.generation-card__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.35rem;
}
.generation-card__actions button {
  display: grid;
  width: 1.7rem;
  height: 1.7rem;
  place-items: center;
  border-radius: 0.4rem;
  color: var(--card-dim);
}
.generation-card__actions button:hover {
  background: color-mix(in srgb, var(--ui-bg) 70%, transparent);
  color: var(--card-ink);
}
.generation-card__actions button .i-lucide-check {
  color: #53dba0;
}
.generation-card__arrow {
  color: var(--card-dim);
  transition:
    color 180ms ease,
    transform 180ms var(--ease-cinematic);
}
.generation-card:hover .generation-card__arrow {
  color: var(--color-signal-400);
  transform: translate(2px, -2px);
}

@media (max-width: 560px) {
  .generation-card__media {
    min-height: 12rem;
  }
  .generation-card__body {
    min-height: 8.5rem;
    padding-inline: 0.85rem;
  }
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
