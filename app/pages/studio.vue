<script setup lang="ts">
import type { AspectRatio, GenerationMode, GenerationRecord, MediaInput, MediaType, ProviderCapability, Resolution } from '#shared/types/generation'
import { getMediaValidationIssue, MEDIA_META, MODE_META, resolveModelCapability, SMART_DURATION } from '#shared/types/generation'
import { useElementSize, useIntervalFn } from '@vueuse/core'

const { data: providerCatalog } = await useFetch<ProviderCapability[]>('/api/providers')

const providerId = ref<string>()
const capability = computed(() => providerCatalog.value?.find(item => item.id === providerId.value))
watch(providerCatalog, () => {
  if (!capability.value)
    providerId.value = providerCatalog.value?.[0]?.id
}, { immediate: true })

const model = ref('')
const mode = ref<GenerationMode>('text')
const prompt = ref('夜幕下，一列复古列车穿过无边的盐湖。镜头贴近水面低速跟随，远处闪电短暂照亮群山，电影级光影，细腻胶片颗粒。')
const negativePrompt = ref('')
const media = ref<MediaInput[]>([])
const resolution = ref<Resolution>('1080P')
const ratio = ref<AspectRatio>('16:9')
const duration = ref(5)
const smartDuration = ref(false)
const audio = ref(true)
const promptExtend = ref(true)
const watermark = ref(false)
const seed = ref<number | undefined>()
const advancedOpen = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const task = ref<GenerationRecord>()

const providerItems = computed(() => (providerCatalog.value || []).map(item => ({
  label: item.enabled ? item.name : `${item.name} · 未配置凭据`,
  value: item.id,
  disabled: !item.enabled,
})))

const modelItems = computed(() => (capability.value?.models || []).map(item => ({
  label: item.badge ? `${item.name} · ${item.badge}` : item.name,
  value: item.id,
})))

const selectedModel = computed(() => capability.value?.models.find(item => item.id === model.value))
const effectiveCapability = computed(() => capability.value
  ? resolveModelCapability(capability.value, model.value, resolution.value)
  : undefined)

const modeOptions = computed(() => (effectiveCapability.value?.modes || []).map(id => ({
  ...MODE_META[id],
  value: id,
})))

const resolutionOptions = computed(() => effectiveCapability.value?.resolutions || [])
const ratioOptions = computed(() => effectiveCapability.value?.ratios || [])

const referenceSlots = computed<MediaType[]>(() =>
  (effectiveCapability.value?.media || []).filter(type => type.startsWith('reference_')),
)

const durationSteps = computed(() => effectiveCapability.value?.duration.steps)
const effectiveDuration = computed(() => smartDuration.value ? SMART_DURATION : duration.value)
const durationSliderValue = computed<number | number[]>({
  get: () => duration.value,
  set: (value) => {
    const next = Array.isArray(value) ? value[0] : value
    if (next !== undefined)
      duration.value = next
  },
})

const selectedModelName = computed(() => selectedModel.value?.name || model.value)

const actualVideoRatio = ref<number>()

function onVideoLoaded(event: Event) {
  const el = event.target as HTMLVideoElement
  if (el && el.videoWidth && el.videoHeight) {
    actualVideoRatio.value = el.videoWidth / el.videoHeight
  }
}

watch(() => task.value?.id, () => {
  actualVideoRatio.value = undefined
})

const activeRatioStr = computed(() => {
  if (task.value?.usage?.ratio)
    return task.value.usage.ratio
  if (task.value?.ratio)
    return task.value.ratio
  return ratio.value
})

const numericRatio = computed(() => {
  if (task.value?.status === 'SUCCEEDED' && actualVideoRatio.value)
    return actualVideoRatio.value

  const str = activeRatioStr.value
  if (str === 'adaptive')
    return 16 / 9

  const [w, h] = str.split(':').map(Number)
  if (w && h && !Number.isNaN(w) && !Number.isNaN(h))
    return w / h
  return 16 / 9
})

const previewRatioCss = computed(() => {
  if (task.value?.status === 'SUCCEEDED' && actualVideoRatio.value)
    return `${actualVideoRatio.value}`

  const str = activeRatioStr.value
  if (str === 'adaptive')
    return '16 / 9'

  return str.replace(':', ' / ')
})

const RATIO_LABELS: Record<string, string> = {
  '16:9': '16:9 · 横屏',
  '9:16': '9:16 · 竖屏',
  '1:1': '1:1 · 正方形',
  '4:3': '4:3 · 标准横屏',
  '3:4': '3:4 · 肖像竖屏',
  '21:9': '21:9 · 宽银幕',
  'adaptive': '自适应画幅',
}

const ratioLabel = computed(() => RATIO_LABELS[activeRatioStr.value] || activeRatioStr.value)

const previewViewportRef = ref<HTMLElement | null>(null)
const { width: viewportWidth, height: viewportHeight } = useElementSize(previewViewportRef)

const stageDimensions = computed(() => {
  const padX = 32
  const padY = 32
  const availW = Math.floor(viewportWidth.value - padX)
  const availH = Math.floor(viewportHeight.value - padY)

  if (availW > 50 && availH > 50) {
    const r = numericRatio.value
    let w = availW
    let h = Math.floor(w / r)
    if (h > availH) {
      h = availH
      w = Math.floor(h * r)
    }
    return {
      width: `${w}px`,
      height: `${h}px`,
    }
  }

  return {
    width: numericRatio.value > 1 ? '100%' : 'auto',
    height: numericRatio.value <= 1 ? '100%' : 'auto',
    aspectRatio: previewRatioCss.value,
  }
})

/** 切换供应商后先选择该供应商的默认模型。 */
watch(capability, (cap) => {
  if (!cap)
    return
  if (!cap.models.some(item => item.id === model.value))
    model.value = cap.models[0]?.id || ''
}, { immediate: true })

/** 切换模型、清晰度后，把现有选择收敛到模型级能力范围。 */
watch(effectiveCapability, (cap) => {
  if (!cap)
    return
  if (!cap.modes.includes(mode.value))
    mode.value = cap.modes[0] || 'text'
  if (!cap.resolutions.includes(resolution.value))
    resolution.value = cap.resolutions.at(-1) || '1080P'
  if (cap.ratios.length && !cap.ratios.includes(ratio.value))
    ratio.value = cap.ratios.includes('16:9') ? '16:9' : (cap.ratios[0] || 'adaptive')
  media.value = media.value.filter(item => cap.media.includes(item.type))
  const d = cap.duration
  if (d.steps && !d.steps.includes(duration.value))
    duration.value = d.steps[0] || d.min
  if (!d.steps && (duration.value < d.min || duration.value > d.max))
    duration.value = Math.min(Math.max(5, d.min), d.max)
  smartDuration.value = false
  if (!cap.supportsAudio)
    audio.value = false
  if (!cap.supportsPromptExtend)
    promptExtend.value = false
  const mediaIssue = getMediaValidationIssue(cap, media.value)
  errorMessage.value = mediaIssue ? formatMediaValidationIssue(mediaIssue) : ''
}, { immediate: true })

watch(mode, () => {
  media.value = []
  errorMessage.value = ''
})

function formatMediaValidationIssue(issue: ReturnType<typeof getMediaValidationIssue>) {
  if (!issue)
    return ''
  if (issue.kind === 'unsupported')
    return `${selectedModelName.value} 不支持${MEDIA_META[issue.type].label}`
  if (issue.kind === 'count')
    return `「${MEDIA_META[issue.type].label}」最多允许 ${issue.max} 份`
  if (issue.kind === 'duration_required')
    return `「${MEDIA_META[issue.type].label}」必须提供素材自身时长（秒）`
  if (issue.kind === 'duration_range')
    return `「${MEDIA_META[issue.type].label}」时长需在 ${issue.min}–${issue.max} 秒之间`
  return issue.limit.message
}

/** 将跨类型总数限制折算成当前素材槽位的可添加数量，减少无效上传。 */
function mediaSlotMax(type: MediaType) {
  const cap = effectiveCapability.value
  const baseMax = cap?.mediaLimits[type]?.max
  if (!cap)
    return baseMax

  let max = baseMax
  for (const limit of cap.mediaCombinationLimits || []) {
    if (!limit.types.includes(type))
      continue
    const active = !limit.whenTypes || limit.whenTypes.every(trigger => trigger === type || media.value.some(item => item.type === trigger))
    if (!active)
      continue
    const otherCount = media.value.filter(item => item.type !== type && limit.types.includes(item.type)).length
    const remaining = Math.max(limit.max - otherCount, 0)
    max = max === undefined ? remaining : Math.min(max, remaining)
  }
  return max
}

function setMedia(type: MediaType, values: MediaInput[]) {
  const next = [...media.value.filter(item => item.type !== type), ...values]
  const mediaIssue = effectiveCapability.value && getMediaValidationIssue(effectiveCapability.value, next)
  if (mediaIssue) {
    errorMessage.value = formatMediaValidationIssue(mediaIssue)
    return
  }
  media.value = next
  errorMessage.value = ''
}

function mediaValues(type: MediaType) {
  return media.value.filter(item => item.type === type)
}

const progress = computed(() => {
  if (!task.value)
    return 0
  if (task.value.status === 'PENDING')
    return 18
  if (task.value.status === 'RUNNING')
    return 62
  return 100
})

const polling = useIntervalFn(async () => {
  if (!task.value || ['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(task.value.status)) {
    polling.pause()
    return
  }
  try {
    task.value = await $fetch<GenerationRecord>(`/api/generations/${task.value.id}`)
    if (['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(task.value.status))
      polling.pause()
  }
  catch {}
}, 12000, { immediate: false })

async function generate() {
  errorMessage.value = ''
  if (!capability.value)
    return
  if (!prompt.value.trim() && !media.value.length) {
    errorMessage.value = '提示词与参考素材至少填写一项'
    return
  }
  if (mode.value === 'frames' && !media.value.some(item => item.type === 'first_frame') && !prompt.value.trim()) {
    errorMessage.value = '首尾帧模式至少上传一张首帧图片，或填写提示词'
    return
  }
  const mediaIssue = effectiveCapability.value && getMediaValidationIssue(effectiveCapability.value, media.value)
  if (mediaIssue) {
    errorMessage.value = formatMediaValidationIssue(mediaIssue)
    return
  }

  submitting.value = true
  try {
    task.value = await $fetch<GenerationRecord>('/api/generations', {
      method: 'POST',
      body: {
        provider: providerId.value,
        model: model.value,
        mode: mode.value,
        prompt: prompt.value,
        negativePrompt: negativePrompt.value || undefined,
        media: media.value,
        resolution: resolution.value,
        ratio: ratio.value,
        duration: effectiveDuration.value,
        audio: audio.value,
        promptExtend: promptExtend.value,
        watermark: watermark.value,
        seed: seed.value,
      },
    })
    polling.resume()
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.statusMessage || error?.message || '提交失败，请检查配置'
  }
  finally {
    submitting.value = false
  }
}

async function refreshTaskExplicitly() {
  if (!task.value)
    return
  task.value = await $fetch<GenerationRecord>(`/api/generations/${task.value.id}?refresh=1`)
  if (['PENDING', 'RUNNING'].includes(task.value.status))
    polling.resume()
}

const promptPresets = [
  { title: '二次元追逐', icon: 'i-lucide-sparkles', prompt: '雨夜的霓虹街区，二次元少女骑着机车高速穿行，低机位跟拍，水花飞溅，赛璐璐质感，动作流畅。' },
  { title: '科幻短剧', icon: 'i-lucide-orbit', prompt: '废弃空间站的走廊里，两名宇航员发现一道正在扩张的裂隙，缓慢推镜，冷色体积光，紧张电影氛围。' },
  { title: '商品展示', icon: 'i-lucide-shopping-bag', prompt: '纯净柔光棚拍，一款耳机悬浮旋转，镜头展示金属细节与佩戴场景，节奏明快，适合电商竖屏广告。' },
  { title: '知识科普', icon: 'i-lucide-atom', prompt: '用清晰的三维动画展示光合作用过程，从叶片微观结构进入细胞，信息准确，镜头平稳，教育科普风格。' },
]

const route = useRoute()
const reusedFromId = ref<string>()

async function loadFromTask(fromId: string) {
  try {
    const prior = await $fetch<GenerationRecord>(`/api/generations/${fromId}`)
    if (prior) {
      if (prior.provider)
        providerId.value = prior.provider
      if (prior.model)
        model.value = prior.model
      if (prior.mode)
        mode.value = prior.mode
      if (prior.prompt)
        prompt.value = prior.prompt
      if (prior.negativePrompt) {
        negativePrompt.value = prior.negativePrompt
        advancedOpen.value = true
      }
      if (prior.media)
        media.value = [...prior.media]
      if (prior.resolution)
        resolution.value = prior.resolution
      if (prior.ratio)
        ratio.value = prior.ratio
      if (prior.duration !== undefined) {
        if (prior.duration === -1) {
          smartDuration.value = true
        }
        else {
          smartDuration.value = false
          duration.value = prior.duration
        }
      }
      if (prior.audio !== undefined)
        audio.value = prior.audio
      if (prior.promptExtend !== undefined)
        promptExtend.value = prior.promptExtend
      if (prior.watermark !== undefined)
        watermark.value = prior.watermark
      if (prior.seed !== undefined) {
        seed.value = prior.seed
        advancedOpen.value = true
      }
      reusedFromId.value = prior.id
    }
  }
  catch (error) {
    console.warn('Failed to load prior task for studio reuse', error)
  }
}

onMounted(() => {
  const fromId = route.query.from
  if (typeof fromId === 'string' && fromId) {
    loadFromTask(fromId)
  }
})

onBeforeUnmount(polling.pause)
</script>

<template>
  <div class="min-h-[calc(100svh-72px)] xl:h-[calc(100svh-72px)] bg-muted/35 p-3 md:p-4 overflow-x-hidden">
    <div class="mx-auto grid h-full max-w-[1600px] gap-4 xl:grid-cols-[400px_1fr] 2xl:grid-cols-[420px_1fr]">
      <!-- ============ 左侧：参数面板 ============ -->
      <UCard class="flex flex-col overflow-hidden h-full" :ui="{ body: 'flex flex-col flex-1 min-h-0 p-0 sm:p-0' }">
        <div class="shrink-0 border-b border-default px-4 py-3.5 sm:px-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="type-kicker text-[11px] font-semibold tracking-wider text-dimmed uppercase">
                视频生成
              </p>
              <h1 class="mt-1 text-lg font-650 tracking-[-0.015em] text-highlighted">
                新建任务
              </h1>
            </div>
            <UBadge :color="capability?.enabled ? 'success' : 'warning'" variant="subtle" size="sm">
              {{ capability?.enabled ? `${capability.name} 在线` : '未配置凭据' }}
            </UBadge>
          </div>
          <div v-if="reusedFromId" class="mt-2.5 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary">
            <span class="flex items-center gap-1.5 truncate">
              <span class="i-lucide-sparkles text-xs shrink-0" />
              <span class="truncate">已回填任务 {{ reusedFromId.slice(0, 8) }} 的生成参数与参考素材</span>
            </span>
            <button type="button" class="ml-2 text-xs hover:underline shrink-0" @click="reusedFromId = undefined">
              关闭
            </button>
          </div>
          <UFieldGroup class="mt-3 w-full">
            <UButton
              v-for="item in modeOptions"
              :key="item.value"
              color="neutral"
              variant="outline"
              size="sm"
              class="min-w-0 flex-1 justify-center whitespace-nowrap px-2 text-xs font-medium"
              :class="mode === item.value ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white shadow-xs' : 'text-muted'"
              :aria-pressed="mode === item.value"
              @click="mode = item.value"
            >
              <span :class="item.icon" class="hidden sm:inline-block text-xs" />
              {{ item.label }}
            </UButton>
          </UFieldGroup>
          <p class="type-caption mt-1.5 text-xs text-dimmed leading-relaxed">
            {{ modeOptions.find(item => item.value === mode)?.hint }}
          </p>
        </div>

        <div class="panel-scroll studio-scroll flex-1 min-h-0 space-y-4 px-4 py-4 sm:px-5 overflow-y-auto">
          <div class="grid grid-cols-2 gap-2.5">
            <UFormField label="服务平台" size="sm">
              <USelect v-model="providerId" :items="providerItems" size="sm" class="w-full text-xs" placeholder="选择平台" />
            </UFormField>
            <UFormField label="生成模型" size="sm">
              <USelect v-model="model" :items="modelItems" size="sm" class="w-full text-xs" placeholder="选择模型" :disabled="!modelItems.length" />
            </UFormField>
          </div>
          <p v-if="selectedModel" class="type-caption -mt-2 text-xs text-dimmed leading-relaxed">
            {{ selectedModel.description }}<template v-if="effectiveCapability?.notes">
              ；{{ effectiveCapability.notes }}
            </template>
          </p>

          <UFormField label="提示词" :hint="`${prompt.length} / 20K`" size="sm">
            <UTextarea
              v-model="prompt"
              :rows="4"
              autoresize
              :maxrows="7"
              size="sm"
              class="w-full text-xs leading-relaxed"
              placeholder="说明主体、场景、动作、镜头和声音要求"
            />
          </UFormField>

          <!-- 素材输入：由供应商能力声明驱动 -->
          <div v-if="mode === 'frames'" class="grid gap-2.5">
            <MediaSlot
              v-if="effectiveCapability?.media.includes('first_frame')"
              label="首帧" hint="上传或粘贴图片公网 URL" icon="i-lucide-panel-top"
              type="first_frame"
              :values="mediaValues('first_frame')"
              :max="mediaSlotMax('first_frame')"
              :accept="effectiveCapability?.mediaLimits.first_frame?.accept"
              :max-bytes="effectiveCapability?.mediaLimits.first_frame?.maxBytes"
              @change="setMedia('first_frame', $event)"
            />
            <MediaSlot
              v-if="effectiveCapability?.media.includes('last_frame')"
              label="尾帧" hint="可选 · 需先提供首帧" icon="i-lucide-panel-bottom"
              type="last_frame"
              :values="mediaValues('last_frame')"
              :max="mediaSlotMax('last_frame')"
              :accept="effectiveCapability?.mediaLimits.last_frame?.accept"
              :max-bytes="effectiveCapability?.mediaLimits.last_frame?.maxBytes"
              @change="setMedia('last_frame', $event)"
            />
          </div>

          <div v-if="mode === 'reference'" class="grid gap-2.5">
            <MediaSlot
              v-for="type in referenceSlots"
              :key="type"
              :label="type === 'reference_image' ? '参考图' : type === 'reference_video' ? '参考视频' : type === 'reference_audio' ? '参考音频' : '素材'"
              :hint="type === 'reference_image' ? '角色 / 场景 / 构图' : type === 'reference_video' ? '运动 / 风格 / 续写' : type === 'reference_audio' ? '节奏 / 语音 / 氛围' : '上传或粘贴公网 URL'"
              :icon="type === 'reference_image' ? 'i-lucide-image' : type === 'reference_video' ? 'i-lucide-video' : type === 'reference_audio' ? 'i-lucide-audio-lines' : 'i-lucide-paperclip'"
              :type="type"
              :values="mediaValues(type)"
              :max="mediaSlotMax(type)"
              :accept="effectiveCapability?.mediaLimits[type]?.accept"
              :max-bytes="effectiveCapability?.mediaLimits[type]?.maxBytes"
              :duration-limit="effectiveCapability?.mediaLimits[type]?.duration"
              :requires-duration="effectiveCapability?.mediaLimits[type]?.requiresDuration"
              @change="setMedia(type, $event)"
            />
          </div>

          <div class="space-y-4 border-t border-default pt-4">
            <div>
              <div class="type-label mb-1.5 text-xs font-semibold text-toned">
                清晰度
              </div>
              <UFieldGroup class="w-full">
                <UButton
                  v-for="item in resolutionOptions"
                  :key="item"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="flex-1 justify-center text-xs font-medium"
                  :class="resolution === item ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white shadow-xs' : 'text-muted'"
                  :aria-pressed="resolution === item"
                  @click="resolution = item"
                >
                  {{ item }}
                </UButton>
              </UFieldGroup>
            </div>

            <div v-if="ratioOptions.length">
              <div class="mb-1.5 flex items-center justify-between">
                <span class="type-label text-xs font-semibold text-toned">画面比例</span>
                <span v-if="!ratioOptions.includes('adaptive')" class="type-caption text-[11px] text-dimmed">图生视频将跟随首帧画幅</span>
              </div>
              <div class="grid grid-cols-6 gap-1.5">
                <UButton
                  v-for="item in ratioOptions"
                  :key="item"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  class="flex-col gap-1 px-1 py-2 text-xs font-medium"
                  :class="ratio === item ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white shadow-xs' : 'text-muted'"
                  :aria-pressed="ratio === item"
                  @click="ratio = item"
                >
                  <span
                    class="block w-4 rounded-[2px] border border-current opacity-70"
                    :style="{ aspectRatio: item === 'adaptive' ? '16 / 10' : item.replace(':', ' / ') }"
                  />
                  <span class="text-[11px] leading-none">{{ item === 'adaptive' ? '自适应' : item }}</span>
                </UButton>
              </div>
            </div>

            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <span class="type-label text-xs font-semibold text-toned">片段时长</span>
                <UBadge color="primary" variant="subtle" size="sm">
                  {{ smartDuration ? '智能时长' : `${duration} 秒` }}
                </UBadge>
              </div>
              <UFieldGroup v-if="durationSteps" class="w-full">
                <UButton
                  v-for="step in durationSteps"
                  :key="step"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="flex-1 justify-center text-xs font-medium"
                  :class="!smartDuration && duration === step ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white shadow-xs' : 'text-muted'"
                  :aria-pressed="!smartDuration && duration === step"
                  @click="duration = step; smartDuration = false"
                >
                  {{ step }} 秒
                </UButton>
              </UFieldGroup>
              <template v-else>
                <USlider
                  v-model="durationSliderValue"
                  size="sm"
                  :min="effectiveCapability?.duration.min ?? 2"
                  :max="effectiveCapability?.duration.max ?? 30"
                  :step="1"
                  :disabled="smartDuration"
                />
                <div class="mt-1 flex justify-between text-[11px] text-dimmed">
                  <span>{{ effectiveCapability?.duration.min }} 秒</span>
                  <span>{{ effectiveCapability?.duration.max }} 秒</span>
                </div>
              </template>
              <UCheckbox
                v-if="effectiveCapability?.duration.smart"
                v-model="smartDuration"
                label="智能时长 · 由模型根据内容决定"
                size="sm"
                class="mt-2 text-xs"
              />
            </div>
          </div>

          <UCard v-if="effectiveCapability?.supportsAudio" variant="subtle" :ui="{ body: 'p-3 sm:p-3' }">
            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-xs font-semibold text-toned">
                  同步生成音频
                </div>
                <p class="type-caption mt-0.5 text-[11px] text-dimmed">
                  生成对白、音效和背景音乐
                </p>
              </div>
              <USwitch v-model="audio" size="sm" />
            </div>
          </UCard>
          <p v-else-if="effectiveCapability && !effectiveCapability.supportsAudio" class="type-caption -mt-2 text-xs text-dimmed">
            {{ selectedModelName }} 不支持同步生成音频，输出为无声视频。
          </p>

          <UCollapsible v-model:open="advancedOpen">
            <UButton color="neutral" variant="ghost" size="sm" block trailing-icon="i-lucide-chevron-down" class="justify-between text-xs text-muted">
              高级设置
            </UButton>
            <template #content>
              <div class="space-y-3 pt-3">
                <UFormField v-if="effectiveCapability?.supportsNegativePrompt" label="反向提示词" size="sm">
                  <UInput v-model="negativePrompt" size="sm" class="w-full text-xs" placeholder="不希望出现的元素" />
                </UFormField>
                <div class="grid grid-cols-2 gap-2.5">
                  <UCheckbox v-if="effectiveCapability?.supportsPromptExtend" v-model="promptExtend" size="sm" label="智能改写" class="text-xs" />
                  <UCheckbox v-if="effectiveCapability?.supportsWatermark" v-model="watermark" size="sm" label="AI 水印" class="text-xs" />
                </div>
                <UFormField v-if="effectiveCapability?.supportsSeed" label="随机种子" hint="可选" size="sm">
                  <UInput v-model.number="seed" type="number" min="0" max="2147483647" placeholder="自动" size="sm" class="w-full text-xs" />
                </UFormField>
              </div>
            </template>
          </UCollapsible>

          <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage" size="sm" />
          <UButton
            color="primary"
            size="lg"
            block
            icon="i-lucide-sparkles"
            :loading="submitting"
            :disabled="submitting || !capability?.enabled"
            class="h-10 text-sm font-600 shadow-sm"
            @click="generate"
          >
            {{ submitting ? '正在提交…' : '生成视频' }}
          </UButton>
          <p class="type-caption text-center text-[11px] text-dimmed leading-4">
            按实际生成参数消耗 {{ capability?.name }} 额度
          </p>
        </div>
      </UCard>

      <!-- ============ 右侧：预览区 ============ -->
      <UCard class="flex flex-col overflow-hidden h-full" :ui="{ body: 'flex flex-col flex-1 min-h-0 p-4 sm:p-5' }">
        <div class="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-default pb-3.5">
          <div class="flex items-center gap-2 text-xs sm:text-sm text-toned font-semibold">
            <span class="i-lucide-clapperboard text-primary" />任务预览
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ selectedModelName || '—' }}
            </UBadge>
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ resolution }}
            </UBadge>
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ ratio === 'adaptive' ? '自适应' : ratio }}
            </UBadge>
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ smartDuration ? '智能' : `${duration} 秒` }}
            </UBadge>
            <UBadge v-if="audio" color="neutral" variant="subtle" size="sm" icon="i-lucide-audio-lines">
              有声
            </UBadge>
          </div>
        </div>

        <div ref="previewViewportRef" class="relative flex flex-1 items-center justify-center p-3 min-h-0 w-full overflow-hidden rounded-xl bg-zinc-100/60 dark:bg-zinc-950/40 border border-default/40">
          <div
            class="preview-stage relative overflow-hidden rounded-xl bg-white dark:bg-zinc-900 border border-default/80 shadow-xs transition-[width,height] duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] flex items-center justify-center select-none will-change-[width,height]"
            :style="stageDimensions"
          >
            <!-- 极简画幅标记 -->
            <span class="pointer-events-none absolute top-2.5 left-2.5 z-10 rounded px-1.5 py-0.5 text-[10px] font-mono text-muted bg-zinc-100 dark:bg-zinc-800 border border-default/70">
              {{ ratioLabel }}
            </span>

            <!-- 视频播放器 -->
            <video
              v-if="task?.status === 'SUCCEEDED' && task.videoUrl"
              :src="task.videoUrl"
              controls
              autoplay
              loop
              class="relative z-10 h-full w-full object-contain rounded-xl"
              @loadedmetadata="onVideoLoaded"
            />
          </div>

          <!-- 静态中心内容层：绝对居中于固定外层视口，物理坐标完全静止，彻底解决 Edge 下 DirectWrite 重排抖动 -->
          <div
            v-if="task?.status !== 'SUCCEEDED' || !task?.videoUrl"
            class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6 text-center select-none"
          >
            <div class="pointer-events-auto flex flex-col items-center justify-center max-w-[240px] w-full [transform:translateZ(0)] [backface-visibility:hidden]">
              <template v-if="task">
                <!-- 失败状态 -->
                <template v-if="task.status === 'FAILED'">
                  <UIcon name="i-lucide-circle-alert" class="size-8 text-red-500 mb-2 [transform:translateZ(0)]" />
                  <p class="text-sm font-semibold text-red-600 dark:text-red-400">
                    生成失败
                  </p>
                  <p class="mt-1 max-w-xs text-xs text-muted leading-relaxed line-clamp-2">
                    {{ task.error || '任务处理异常，请检查配置后重试。' }}
                  </p>
                </template>

                <!-- 进行中状态 -->
                <template v-else>
                  <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-primary-500 mb-2.5 [transform:translateZ(0)]" />
                  <p class="text-sm font-semibold text-highlighted">
                    {{ task.status === 'UNKNOWN' ? '正在确认任务状态…' : task.status === 'PENDING' ? '排队等待处理…' : '正在生成视频…' }}
                  </p>
                  <p class="mt-1 max-w-xs text-xs text-muted leading-relaxed whitespace-nowrap">
                    {{ task.error || '通常需要 1–3 分钟，结果自动保存' }}
                  </p>
                  <UProgress :model-value="progress" class="mt-3.5 w-44" size="xs" />
                  <span class="type-mono mt-2 text-[10px] text-dimmed">
                    ID: {{ task.providerTaskId.slice(0, 8).toUpperCase() }}
                  </span>
                  <UButton
                    v-if="task.status === 'UNKNOWN'"
                    color="neutral"
                    variant="soft"
                    size="xs"
                    icon="i-lucide-refresh-cw"
                    class="mt-2.5 text-xs"
                    @click="refreshTaskExplicitly"
                  >
                    刷新状态
                  </UButton>
                </template>
              </template>

              <!-- 未生成时的极简就绪占位 -->
              <template v-else>
                <UIcon name="i-lucide-video" class="size-8 text-muted/70 mb-2 [transform:translateZ(0)] [backface-visibility:hidden]" />
                <p class="text-sm font-semibold text-highlighted">
                  任务预览
                </p>
                <p class="mt-1 text-xs text-muted whitespace-nowrap">
                  在左侧配置参数并点击“生成视频”
                </p>
              </template>
            </div>
          </div>
        </div>

        <div v-if="!task" class="shrink-0 border-t border-default pt-2.5">
          <div class="mb-1.5 flex items-center justify-between">
            <span class="text-xs font-semibold text-toned">从常用场景开始</span>
            <div class="flex items-center gap-2">
              <span class="type-caption text-[11px] text-dimmed">点击填入提示词</span>
              <span class="text-dimmed/40 text-xs">·</span>
              <UButton to="/projects" color="neutral" variant="link" size="xs" trailing-icon="i-lucide-arrow-right" class="px-0 text-xs text-muted hover:text-highlighted">
                查看作品库
              </UButton>
            </div>
          </div>
          <div class="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
            <UButton
              v-for="item in promptPresets"
              :key="item.title"
              color="neutral"
              variant="outline"
              size="xs"
              :icon="item.icon"
              class="justify-start py-1.5 text-xs text-muted hover:text-highlighted"
              @click="prompt = item.prompt"
            >
              {{ item.title }}
            </UButton>
          </div>
        </div>
        <div v-else class="shrink-0 flex items-center justify-between border-t border-default pt-2.5">
          <span class="type-caption text-[11px] text-dimmed">生成结果自动保存</span>
          <UButton to="/projects" color="neutral" variant="link" size="xs" trailing-icon="i-lucide-arrow-right" class="px-0 text-xs">
            查看作品库
          </UButton>
        </div>
      </UCard>
    </div>
  </div>
</template>
