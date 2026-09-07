<script setup lang="ts">
import type { AspectRatio, GenerationMode, GenerationRecord, MediaInput, MediaType, ProviderCapability, Resolution } from '#shared/types/generation'
import { getMediaValidationIssue, MEDIA_META, MODE_META, resolveModelCapability, SMART_DURATION } from '#shared/types/generation'
import { useIntervalFn } from '@vueuse/core'

const { data: providerCatalog } = await useFetch<ProviderCapability[]>('/api/providers')
const { user, authDialogOpen } = useAuth()

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
const quote = ref<{ id: string, estimatedCredits: number, expiresAt: string, sourceLabel: string, idempotencyKey: string }>()

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

  if (!user.value) {
    authDialogOpen.value = true
    return
  }

  submitting.value = true
  try {
    const request = {
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
    }
    if (!quote.value || new Date(quote.value.expiresAt).getTime() <= Date.now()) {
      const response = await $fetch<{ id: string, estimatedCredits: number, expiresAt: string, sourceLabel: string }>('/api/billing/quote', { method: 'POST', body: request })
      quote.value = { ...response, idempotencyKey: crypto.randomUUID() }
      return
    }
    task.value = await $fetch<GenerationRecord>('/api/generations', {
      method: 'POST',
      body: {
        ...request,
        quoteId: quote.value.id,
        idempotencyKey: quote.value.idempotencyKey,
      },
    })
    quote.value = undefined
    polling.resume()
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.statusMessage || error?.message || '提交失败，请检查配置'
  }
  finally {
    submitting.value = false
  }
}

watch([providerId, model, mode, prompt, negativePrompt, media, resolution, ratio, effectiveDuration, audio, promptExtend, watermark, seed], () => {
  quote.value = undefined
}, { deep: true })

async function refreshTaskExplicitly() {
  if (!task.value)
    return
  await $fetch(`/api/generations/${task.value.id}/refresh`, { method: 'POST' })
  task.value = await $fetch<GenerationRecord>(`/api/generations/${task.value.id}`)
  if (['PENDING', 'RUNNING'].includes(task.value.status))
    polling.resume()
}

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
  <main class="min-h-[calc(100svh-72px)] overflow-x-hidden bg-muted/35 p-3 md:p-4 xl:h-[calc(100svh-72px)]">
    <div class="mx-auto grid h-full max-w-[1600px] gap-4 xl:grid-cols-[400px_1fr] 2xl:grid-cols-[420px_1fr]">
      <StudioConfigPanel
        v-model:provider-id="providerId"
        v-model:model="model"
        v-model:mode="mode"
        v-model:prompt="prompt"
        v-model:negative-prompt="negativePrompt"
        v-model:resolution="resolution"
        v-model:ratio="ratio"
        v-model:duration="duration"
        v-model:smart-duration="smartDuration"
        v-model:audio="audio"
        v-model:prompt-extend="promptExtend"
        v-model:watermark="watermark"
        v-model:seed="seed"
        v-model:advanced-open="advancedOpen"
        v-model:reused-from-id="reusedFromId"
        :capability="capability"
        :selected-model="selectedModel"
        :effective-capability="effectiveCapability"
        :provider-items="providerItems"
        :model-items="modelItems"
        :mode-options="modeOptions"
        :resolution-options="resolutionOptions"
        :ratio-options="ratioOptions"
        :reference-slots="referenceSlots"
        :duration-steps="durationSteps"
        :duration-slider-value="durationSliderValue"
        :selected-model-name="selectedModelName"
        :submitting="submitting"
        :error-message="errorMessage"
        :quote="quote"
        :media-values="mediaValues"
        :media-slot-max="mediaSlotMax"
        :set-media="setMedia"
        @update:duration-slider-value="durationSliderValue = $event"
        @generate="generate"
      />
      <StudioPreviewPanel
        v-model:prompt="prompt"
        :task="task"
        :selected-model-name="selectedModelName"
        :resolution="resolution"
        :ratio="ratio"
        :smart-duration="smartDuration"
        :duration="duration"
        :audio="audio"
        :progress="progress"
        @refresh="refreshTaskExplicitly"
      />
    </div>
  </main>
</template>
