<script setup lang="ts">
import type { AspectRatio, GenerationRecord } from '#shared/types/generation'
import { useElementSize } from '@vueuse/core'

const props = defineProps<{ task?: GenerationRecord, ratio: AspectRatio }>()
const emit = defineEmits<{ refresh: [] }>()
const viewport = ref<HTMLElement | null>(null)
const actualVideoRatio = ref<number>()
const { width, height } = useElementSize(viewport)
const activeRatio = computed(() => props.task?.usage?.ratio || props.task?.ratio || props.ratio)
const numericRatio = computed(() => {
  if (props.task?.status === 'SUCCEEDED' && actualVideoRatio.value)
    return actualVideoRatio.value
  if (activeRatio.value === 'adaptive')
    return 16 / 9
  const [w, h] = activeRatio.value.split(':').map(Number)
  return w && h ? w / h : 16 / 9
})
const ratioLabel = computed(() => ({ '16:9': '16:9 · 横屏', '9:16': '9:16 · 竖屏', '1:1': '1:1 · 正方形', '4:3': '4:3 · 标准横屏', '3:4': '3:4 · 肖像竖屏', '21:9': '21:9 · 宽银幕', 'adaptive': '自适应画幅' }[activeRatio.value] || activeRatio.value))
const stageDimensions = computed(() => {
  const availableWidth = Math.floor(width.value - 32)
  const availableHeight = Math.floor(height.value - 32)
  if (availableWidth <= 50 || availableHeight <= 50)
    return { width: '100%', aspectRatio: String(numericRatio.value) }
  let stageWidth = availableWidth
  let stageHeight = Math.floor(stageWidth / numericRatio.value)
  if (stageHeight > availableHeight) {
    stageHeight = availableHeight
    stageWidth = Math.floor(stageHeight * numericRatio.value)
  }
  return { width: `${stageWidth}px`, height: `${stageHeight}px` }
})

function onVideoLoaded(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.videoWidth && video.videoHeight)
    actualVideoRatio.value = video.videoWidth / video.videoHeight
}

watch(() => props.task?.id, () => {
  actualVideoRatio.value = undefined
})
</script>

<template>
  <UCard class="studio-result" :ui="{ body: 'p-0 sm:p-0' }">
    <div class="studio-result__header">
      <h2 class="flex items-center gap-2 text-sm font-semibold">
        <UIcon name="i-lucide-video" class="size-4 text-primary" />视频预览
      </h2>
      <UButton to="/projects?kind=video" variant="ghost" color="neutral" size="xs" trailing-icon="i-lucide-arrow-up-right">
        作品库
      </UButton>
    </div>
    <StudioEmptyState v-if="!task" icon="i-lucide-video" title="让每一个想法，都有下一帧" description="描述场景与镜头，或用参考素材开始。生成的视频会在这里播放，并保存到作品库。" />
    <div v-else class="p-5">
      <div class="mb-4 flex flex-wrap gap-2">
        <UBadge v-for="badge in [task.model, task.resolution, ratioLabel, task.duration === -1 ? '智能时长' : `${task.duration} 秒`]" :key="badge" color="neutral" variant="subtle">
          {{ badge }}
        </UBadge>
      </div>
      <div v-if="task.status === 'SUCCEEDED' && task.videoUrl" ref="viewport" class="flex h-[32rem] items-center justify-center rounded-xl bg-muted/40">
        <video :src="task.videoUrl" controls loop class="max-h-full max-w-full rounded-lg object-contain" :style="stageDimensions" @loadedmetadata="onVideoLoaded" />
      </div>
      <StudioEmptyState v-else :icon="task.status === 'FAILED' || task.status === 'UNKNOWN' ? 'i-lucide-circle-alert' : 'i-lucide-video'" :busy="task.status === 'PENDING' || task.status === 'RUNNING'" :title="task.status === 'FAILED' ? '视频生成失败' : task.status === 'UNKNOWN' ? '任务结果待核对' : task.status === 'SUCCEEDED' ? '视频已生成，等待保存' : task.status === 'PENDING' ? '任务已排队' : '你的镜头正在生成'" :description="task.error || (task.status === 'UNKNOWN' ? '提交结果暂不明确，请同步状态或等待管理员核对。' : '结果会自动保存，你可以离开页面，稍后到作品库查看。')">
        <UProgress v-if="task.status === 'PENDING' || task.status === 'RUNNING'" size="xs" aria-label="视频生成中" />
        <UButton v-if="task.status === 'UNKNOWN'" color="neutral" variant="soft" size="sm" icon="i-lucide-refresh-cw" @click="emit('refresh')">
          同步状态
        </UButton>
      </StudioEmptyState>
    </div>
  </UCard>
</template>
