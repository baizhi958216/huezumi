<script setup lang="ts">
import type { AspectRatio, GenerationRecord, Resolution } from '#shared/types/generation'
import { useElementSize } from '@vueuse/core'

const props = defineProps<{ task?: GenerationRecord, selectedModelName: string, resolution: Resolution, ratio: AspectRatio, smartDuration: boolean, duration: number, audio: boolean, progress: number }>()
const emit = defineEmits<{ refresh: [] }>()
const prompt = defineModel<string>('prompt', { required: true })
const viewport = ref<HTMLElement | null>(null)
const actualVideoRatio = ref<number>()
const { width, height } = useElementSize(viewport)
const presets = [
  { title: '二次元追逐', icon: 'i-lucide-sparkles', prompt: '雨夜的霓虹街区，二次元少女骑着机车高速穿行，低机位跟拍，水花飞溅，赛璐璐质感，动作流畅。' },
  { title: '科幻短剧', icon: 'i-lucide-orbit', prompt: '废弃空间站的走廊里，两名宇航员发现一道正在扩张的裂隙，缓慢推镜，冷色体积光，紧张电影氛围。' },
  { title: '商品展示', icon: 'i-lucide-shopping-bag', prompt: '纯净柔光棚拍，一款耳机悬浮旋转，镜头展示金属细节与佩戴场景，节奏明快，适合电商竖屏广告。' },
  { title: '知识科普', icon: 'i-lucide-atom', prompt: '用清晰的三维动画展示光合作用过程，从叶片微观结构进入细胞，信息准确，镜头平稳，教育科普风格。' },
]
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
  <UCard class="flex h-full flex-col overflow-hidden" :ui="{ body: 'flex flex-col flex-1 min-h-0 p-4 sm:p-5' }">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-default pb-3.5">
      <div class="flex items-center gap-2 text-sm font-semibold text-toned">
        <UIcon name="i-lucide-clapperboard" class="size-4 text-primary" />任务预览
      </div><div class="flex flex-wrap gap-1.5">
        <UBadge v-for="badge in [selectedModelName || '—', resolution, ratio === 'adaptive' ? '自适应' : ratio, smartDuration ? '智能' : `${duration} 秒`]" :key="badge" color="neutral" variant="subtle" size="sm">
          {{ badge }}
        </UBadge><UBadge v-if="audio" color="neutral" variant="subtle" size="sm" icon="i-lucide-audio-lines">
          有声
        </UBadge>
      </div>
    </div>
    <div ref="viewport" class="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-xl border border-default/40 bg-zinc-100/60 p-3 dark:bg-zinc-950/40">
      <div class="relative flex select-none items-center justify-center overflow-hidden rounded-xl border border-default/80 bg-white shadow-xs transition-[width,height] duration-400 dark:bg-zinc-900" :style="stageDimensions">
        <span class="pointer-events-none absolute left-2.5 top-2.5 z-10 rounded border border-default/70 bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-muted dark:bg-zinc-800">{{ ratioLabel }}</span><video v-if="task?.status === 'SUCCEEDED' && task.videoUrl" :src="task.videoUrl" controls autoplay loop class="relative z-10 size-full rounded-xl object-contain" @loadedmetadata="onVideoLoaded" />
      </div>
      <div v-if="task?.status !== 'SUCCEEDED' || !task?.videoUrl" class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6 text-center">
        <div class="pointer-events-auto flex w-full max-w-60 flex-col items-center">
          <template v-if="task">
            <template v-if="task.status === 'FAILED'">
              <UIcon name="i-lucide-circle-alert" class="mb-2 size-8 text-red-500" /><p class="text-sm font-semibold text-red-600 dark:text-red-400">
                生成失败
              </p><p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                {{ task.error || '任务处理异常，请检查配置后重试。' }}
              </p>
            </template><template v-else>
              <UIcon name="i-lucide-loader-circle" class="mb-2.5 size-8 animate-spin text-primary-500" /><p class="text-sm font-semibold text-highlighted">
                {{ task.status === 'UNKNOWN' ? '正在确认任务状态…' : task.status === 'PENDING' ? '排队等待处理…' : '正在生成视频…' }}
              </p><p class="mt-1 whitespace-nowrap text-xs text-muted">
                {{ task.error || '通常需要 1–3 分钟，结果自动保存' }}
              </p><UProgress :model-value="progress" class="mt-3.5 w-44" size="xs" /><span class="type-mono mt-2 text-[10px] text-dimmed">ID: {{ task.providerTaskId.slice(0, 8).toUpperCase() }}</span><UButton v-if="task.status === 'UNKNOWN'" color="neutral" variant="soft" size="xs" icon="i-lucide-refresh-cw" class="mt-2.5" @click="emit('refresh')">
                刷新状态
              </UButton>
            </template>
          </template>
          <template v-else>
            <UIcon name="i-lucide-video" class="mb-2 size-8 text-muted/70" /><p class="text-sm font-semibold text-highlighted">
              任务预览
            </p><p class="mt-1 whitespace-nowrap text-xs text-muted">
              在左侧配置参数并点击“生成视频”
            </p>
          </template>
        </div>
      </div>
    </div>
    <div v-if="!task" class="shrink-0 border-t border-default pt-2.5">
      <div class="mb-1.5 flex items-center justify-between">
        <span class="text-xs font-semibold text-toned">从常用场景开始</span><UButton to="/projects" color="neutral" variant="link" size="xs" trailing-icon="i-lucide-arrow-right" class="px-0">
          查看作品库
        </UButton>
      </div><div class="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
        <UButton v-for="item in presets" :key="item.title" color="neutral" variant="outline" size="xs" :icon="item.icon" class="justify-start py-1.5 text-xs text-muted" @click="prompt = item.prompt">
          {{ item.title }}
        </UButton>
      </div>
    </div>
    <div v-else class="flex shrink-0 items-center justify-between border-t border-default pt-2.5">
      <span class="text-[11px] text-dimmed">生成结果自动保存</span><UButton to="/projects" color="neutral" variant="link" size="xs" trailing-icon="i-lucide-arrow-right" class="px-0">
        查看作品库
      </UButton>
    </div>
  </UCard>
</template>
