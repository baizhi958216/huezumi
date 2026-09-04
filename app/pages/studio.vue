<script setup lang="ts">
import type { AspectRatio, GenerationMode, GenerationRecord, MediaInput, MediaType, ProviderCapability, Resolution } from '#shared/types/generation'
import { getMediaValidationIssue, MEDIA_META, MODE_META, resolveModelCapability, SMART_DURATION } from '#shared/types/generation'
import { useIntervalFn } from '@vueuse/core'

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

const previewRatio = computed(() =>
  ratio.value === 'adaptive' ? '16 / 9' : ratio.value.replace(':', ' / '))

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

onBeforeUnmount(polling.pause)
</script>

<template>
  <div class="min-h-[calc(100svh-72px)] bg-muted/35 p-3 md:p-4">
    <div class="mx-auto grid max-w-[1680px] gap-4 xl:grid-cols-[460px_1fr]">
      <!-- ============ 左侧：参数面板 ============ -->
      <UCard class="overflow-hidden" :ui="{ body: 'p-0 sm:p-0' }">
        <div class="border-b border-default px-5 py-5 sm:px-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="type-kicker">
                视频生成
              </p>
              <h1 class="mt-1.5 text-2xl font-650 tracking-[-0.02em]">
                新建任务
              </h1>
            </div>
            <UBadge :color="capability?.enabled ? 'success' : 'warning'" variant="subtle" size="md">
              {{ capability?.enabled ? `${capability.name} 在线` : '未配置凭据' }}
            </UBadge>
          </div>
          <UFieldGroup class="mt-5 w-full">
            <UButton
              v-for="item in modeOptions"
              :key="item.value"
              color="neutral"
              variant="outline"
              class="min-w-0 flex-1 justify-center whitespace-nowrap px-2 text-base"
              :class="mode === item.value ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white' : ''"
              :aria-pressed="mode === item.value"
              @click="mode = item.value"
            >
              <span :class="item.icon" class="hidden sm:inline-block" />
              {{ item.label }}
            </UButton>
          </UFieldGroup>
          <p class="type-caption mt-2.5">
            {{ modeOptions.find(item => item.value === mode)?.hint }}
          </p>
        </div>

        <div class="panel-scroll studio-scroll space-y-6 px-5 py-6 sm:px-6 xl:max-h-[calc(100svh-206px)] xl:overflow-y-auto">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="服务平台">
              <USelect v-model="providerId" :items="providerItems" class="w-full" placeholder="选择平台" />
            </UFormField>
            <UFormField label="生成模型">
              <USelect v-model="model" :items="modelItems" class="w-full" placeholder="选择模型" :disabled="!modelItems.length" />
            </UFormField>
          </div>
          <p v-if="selectedModel" class="type-caption -mt-3">
            {{ selectedModel.description }}<template v-if="effectiveCapability?.notes">
              ；{{ effectiveCapability.notes }}
            </template>
          </p>

          <UFormField label="提示词" :hint="`${prompt.length} / 20K`">
            <UTextarea
              v-model="prompt"
              :rows="6"
              autoresize
              :maxrows="9"
              class="w-full"
              placeholder="说明主体、场景、动作、镜头和声音要求"
            />
          </UFormField>

          <!-- 素材输入：由供应商能力声明驱动 -->
          <div v-if="mode === 'frames'" class="grid gap-3">
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

          <div v-if="mode === 'reference'" class="grid gap-3">
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

          <div class="space-y-5 border-t border-default pt-6">
            <div>
              <div class="type-label mb-2">
                清晰度
              </div>
              <UFieldGroup class="w-full">
                <UButton
                  v-for="item in resolutionOptions"
                  :key="item"
                  color="neutral"
                  variant="outline"
                  class="flex-1 justify-center"
                  :class="resolution === item ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white' : ''"
                  :aria-pressed="resolution === item"
                  @click="resolution = item"
                >
                  {{ item }}
                </UButton>
              </UFieldGroup>
            </div>

            <div v-if="ratioOptions.length">
              <div class="mb-2 flex items-center justify-between">
                <span class="type-label">画面比例</span>
                <span v-if="!ratioOptions.includes('adaptive')" class="type-caption">图生视频将跟随首帧画幅</span>
              </div>
              <div class="grid grid-cols-6 gap-2">
                <UButton
                  v-for="item in ratioOptions"
                  :key="item"
                  color="neutral"
                  variant="outline"
                  class="flex-col gap-1.5 px-1 py-2.5"
                  :class="ratio === item ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white' : ''"
                  :aria-pressed="ratio === item"
                  @click="ratio = item"
                >
                  <span
                    class="block w-5 rounded-[2px] border border-current opacity-70"
                    :style="{ aspectRatio: item === 'adaptive' ? '16 / 10' : item.replace(':', ' / ') }"
                  />
                  <span class="text-base">{{ item === 'adaptive' ? '自适应' : item }}</span>
                </UButton>
              </div>
            </div>

            <div>
              <div class="mb-2 flex items-center justify-between">
                <span class="type-label">片段时长</span>
                <UBadge color="primary" variant="subtle">
                  {{ smartDuration ? '智能时长' : `${duration} 秒` }}
                </UBadge>
              </div>
              <UFieldGroup v-if="durationSteps" class="w-full">
                <UButton
                  v-for="step in durationSteps"
                  :key="step"
                  color="neutral"
                  variant="outline"
                  class="flex-1 justify-center"
                  :class="!smartDuration && duration === step ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white' : ''"
                  :aria-pressed="!smartDuration && duration === step"
                  @click="duration = step; smartDuration = false"
                >
                  {{ step }} 秒
                </UButton>
              </UFieldGroup>
              <template v-else>
                <USlider
                  v-model="durationSliderValue"
                  :min="effectiveCapability?.duration.min ?? 2"
                  :max="effectiveCapability?.duration.max ?? 30"
                  :step="1"
                  :disabled="smartDuration"
                />
                <div class="mt-2 flex justify-between text-base text-dimmed">
                  <span>{{ effectiveCapability?.duration.min }} 秒</span>
                  <span>{{ effectiveCapability?.duration.max }} 秒</span>
                </div>
              </template>
              <UCheckbox
                v-if="effectiveCapability?.duration.smart"
                v-model="smartDuration"
                label="智能时长 · 由模型根据内容决定"
                class="mt-3"
              />
            </div>
          </div>

          <UCard v-if="effectiveCapability?.supportsAudio" variant="subtle" :ui="{ body: 'p-4 sm:p-4' }">
            <div class="flex items-center justify-between gap-5">
              <div>
                <div class="text-base text-toned font-600">
                  同步生成音频
                </div>
                <p class="type-caption mt-1">
                  生成对白、音效和背景音乐
                </p>
              </div>
              <USwitch v-model="audio" />
            </div>
          </UCard>
          <p v-else-if="effectiveCapability && !effectiveCapability.supportsAudio" class="type-caption -mt-3">
            {{ selectedModelName }} 不支持同步生成音频，输出为无声视频。
          </p>

          <UCollapsible v-model:open="advancedOpen">
            <UButton color="neutral" variant="ghost" block trailing-icon="i-lucide-chevron-down" class="justify-between">
              高级设置
            </UButton>
            <template #content>
              <div class="space-y-4 pt-4">
                <UFormField v-if="effectiveCapability?.supportsNegativePrompt" label="反向提示词">
                  <UInput v-model="negativePrompt" class="w-full" placeholder="不希望出现的元素" />
                </UFormField>
                <div class="grid grid-cols-2 gap-3">
                  <UCheckbox v-if="effectiveCapability?.supportsPromptExtend" v-model="promptExtend" label="智能改写" />
                  <UCheckbox v-if="effectiveCapability?.supportsWatermark" v-model="watermark" label="AI 水印" />
                </div>
                <UFormField v-if="effectiveCapability?.supportsSeed" label="随机种子" hint="可选">
                  <UInput v-model.number="seed" type="number" min="0" max="2147483647" placeholder="自动" class="w-full" />
                </UFormField>
              </div>
            </template>
          </UCollapsible>

          <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage" />
          <UButton
            color="primary"
            size="xl"
            block
            icon="i-lucide-sparkles"
            :loading="submitting"
            :disabled="submitting || !capability?.enabled"
            @click="generate"
          >
            {{ submitting ? '正在提交…' : '生成视频' }}
          </UButton>
          <p class="type-caption text-center leading-5">
            按实际生成参数消耗 {{ capability?.name }} 额度
          </p>
        </div>
      </UCard>

      <!-- ============ 右侧：预览区 ============ -->
      <UCard class="min-h-[720px] overflow-hidden xl:min-h-[calc(100svh-92px)]" :ui="{ body: 'flex h-full min-h-[inherit] flex-col p-5 sm:p-7' }">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default pb-5">
          <div class="flex items-center gap-2 text-base text-toned font-600">
            <span class="i-lucide-clapperboard text-primary" />任务预览
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="subtle">
              {{ selectedModelName || '—' }}
            </UBadge>
            <UBadge color="neutral" variant="subtle">
              {{ resolution }}
            </UBadge>
            <UBadge color="neutral" variant="subtle">
              {{ ratio === 'adaptive' ? '自适应' : ratio }}
            </UBadge>
            <UBadge color="neutral" variant="subtle">
              {{ smartDuration ? '智能' : `${duration} 秒` }}
            </UBadge>
            <UBadge v-if="audio" color="neutral" variant="subtle" icon="i-lucide-audio-lines">
              有声
            </UBadge>
          </div>
        </div>

        <div class="flex flex-1 items-center justify-center py-8">
          <div
            class="relative max-h-[720px] w-full max-w-[980px] overflow-hidden rounded-lg bg-zinc-950 shadow-cinema ring-1 ring-black/10"
            :style="{ aspectRatio: previewRatio }"
          >
            <video v-if="task?.status === 'SUCCEEDED' && task.videoUrl" :src="task.videoUrl" controls autoplay loop class="h-full w-full object-contain" />
            <div v-else class="surface-rule absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 p-8 text-center text-white">
              <template v-if="task">
                <div class="h-14 w-14 flex items-center justify-center rounded-xl bg-white/8 ring-1 ring-white/10">
                  <span :class="task.status === 'FAILED' ? 'i-lucide-circle-x text-red-400' : 'i-lucide-loader-circle animate-spin text-zinc-300'" class="text-2xl" />
                </div>
                <h2 class="mt-5 text-lg font-600">
                  {{ task.status === 'FAILED' ? '任务失败' : task.status === 'PENDING' ? '等待处理' : '正在生成视频' }}
                </h2>
                <p class="mt-2 max-w-md text-base text-white/60 leading-7">
                  {{ task.error || '通常需要 1–5 分钟。离开页面不会中断任务，结果会自动保存到作品库。' }}
                </p>
                <UProgress :model-value="progress" class="mt-6 w-full max-w-xs" />
                <span class="type-mono mt-3 text-white/35">
                  任务 {{ task.providerTaskId.slice(0, 8).toUpperCase() }}
                </span>
              </template>
              <template v-else>
                <div class="h-16 w-16 flex items-center justify-center rounded-xl bg-white/7 ring-1 ring-white/10">
                  <span class="i-lucide-play text-2xl text-zinc-300" />
                </div>
                <h2 class="mt-5 text-lg font-600">
                  设置完成后开始生成
                </h2>
                <p class="mt-2 max-w-md text-base text-white/60 leading-7">
                  选择一种输入方式，描述你需要的画面；生成状态和结果会在这里实时更新。
                </p>
              </template>
            </div>
          </div>
        </div>

        <div v-if="!task" class="border-t border-default pt-5">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-base text-toned font-600">从常用场景开始</span><span class="type-caption">点击即可填入提示词</span>
          </div>
          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <UButton
              v-for="item in promptPresets"
              :key="item.title"
              color="neutral"
              variant="outline"
              :icon="item.icon"
              class="justify-start"
              @click="prompt = item.prompt"
            >
              {{ item.title }}
            </UButton>
          </div>
        </div>
        <div class="mt-5 flex items-center justify-between">
          <span class="type-caption">生成结果自动保存</span>
          <UButton to="/projects" color="neutral" variant="link" trailing-icon="i-lucide-arrow-right" class="px-0">
            查看作品库
          </UButton>
        </div>
      </UCard>
    </div>
  </div>
</template>
