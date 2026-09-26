<script setup lang="ts">
import type { AspectRatio, GenerationMode, GenerationRecord, MediaInput, MediaType, ProviderCapability, Resolution } from '#shared/types/generation'
import type { ModelOption } from '#shared/types/platform'
import type { PlatformQuote } from '~/composables/usePlatformApi'
import { getMediaValidationIssue, MEDIA_META, MODE_META, resolveModelCapability, SMART_DURATION } from '#shared/types/generation'
import { useIntervalFn } from '@vueuse/core'

const route = useRoute()
const platform = usePlatformApi()
const { data: modelCatalog, refresh: refreshModels } = await useFetch<ModelOption[]>('/api/catalog/models')
const providerCatalog = computed<ProviderCapability[]>(() => {
  const ids = [...new Set((modelCatalog.value || []).filter(m => m.kind === 'video').map(m => m.connectionId))]
  return ids.flatMap((id) => {
    const items = modelCatalog.value!.filter(m => m.connectionId === id)
    const first = items[0]
    if (!first?.capability)
      return []
    return [{ ...first.capability, id, name: first.label.split(' · ')[0]!, enabled: items.some(m => m.available), models: items.flatMap(i => first.capability!.models.filter(m => m.id === i.model)) }]
  })
})
const { items: projectOptions, cursor: projectCursor, loadMore: moreProjects } = await useProjectOptions()
const projectId = ref('')
const sourceVersionId = ref<string>()
const sourceExcerpt = ref<string>()
const sourceText = ref('')
const runId = ref<string>()
const { user, authDialogOpen } = useAuth()
watch(user, () => {
  if (user.value)
    refreshModels()
})
const providerId = ref<string>()
const capability = computed(() => providerCatalog.value?.find(item => item.id === providerId.value))
watch(providerCatalog, () => {
  if (!capability.value)
    providerId.value = providerCatalog.value?.[0]?.id
}, { immediate: true })
const model = ref('')
const mode = ref<GenerationMode>('text')
const prompt = ref('')
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
const quoteRevision = ref(0)
const errorMessage = ref('')
const task = ref<GenerationRecord>()
const active = computed(() => !!task.value && ['PENDING', 'RUNNING'].includes(task.value.status))
const modelAvailable = computed(() => modelCatalog.value?.some(item => item.connectionId === providerId.value && item.model === model.value && item.available))
const quote = ref<PlatformQuote & {
  idempotencyKey: string
  sourceLabel: string
}>()
const effectiveCapability = computed(() => capability.value
  ? resolveModelCapability(capability.value, model.value, resolution.value)
  : undefined)
const modeOptions = computed(() => (effectiveCapability.value?.modes || []).map(id => ({
  ...MODE_META[id],
  value: id,
})))
const resolutionOptions = computed(() => effectiveCapability.value?.resolutions || [])
const ratioOptions = computed(() => effectiveCapability.value?.ratios || [])
const referenceSlots = computed<MediaType[]>(() => (effectiveCapability.value?.media || []).filter(type => type.startsWith('reference_')))
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
const selectedModelName = '当前生成配置'
/** 切换供应商后先选择该供应商的默认模型。 */
watch(capability, (cap) => {
  if (!cap)
    return
  if (!cap.models.some(item => item.id === model.value))
    model.value = cap.models[0]?.id || ''
}, { immediate: true })
/** 切换模型、清晰度后，把现有选择收敛到模型级能力范围。 */
function normalizeSpecs(cap: ProviderCapability | undefined) {
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
}
watch(effectiveCapability, normalizeSpecs, { immediate: true })
watch(mode, () => {
  media.value = []
  errorMessage.value = ''
})
function formatMediaValidationIssue(issue: ReturnType<typeof getMediaValidationIssue>) {
  if (!issue)
    return ''
  if (issue.kind === 'unsupported')
    return `${selectedModelName} 不支持${MEDIA_META[issue.type].label}`
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
const polling = useIntervalFn(async () => {
  if (!task.value || ['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(task.value.status)) {
    polling.pause()
    return
  }
  try {
    if (runId.value)
      task.value = (await platform.run(runId.value)).generation
    if (!task.value || ['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(task.value.status))
      polling.pause()
  }
  catch {
  }
}, 12000, { immediate: false })
async function generate() {
  if (submitting.value || active.value)
    return
  if (!user.value) {
    authDialogOpen.value = true
    return
  }
  errorMessage.value = ''
  if (!capability.value || !modelAvailable.value) {
    errorMessage.value = '视频生成暂不可用，请联系管理员分配生成服务并配置价格'
    return
  }
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
      provider: modelCatalog.value?.find(m => m.connectionId === providerId.value)?.provider || '',
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
      const revision = quoteRevision.value
      const response = await platform.quote({ kind: 'video', connectionId: providerId.value!, model: model.value, input: request, projectId: projectId.value || undefined, sourceVersionId: sourceVersionId.value, sourceExcerpt: sourceExcerpt.value })
      if (revision !== quoteRevision.value)
        return
      quote.value = { ...response, sourceLabel: `价格版本 ${response.priceVersion}`, idempotencyKey: crypto.randomUUID() }
      return
    }
    const accepted = await platform.submit(quote.value, quote.value.idempotencyKey)
    runId.value = accepted.id
    task.value = accepted.generation
    await navigateTo({ query: { ...route.query, run: accepted.id } }, { replace: true })
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
watch([projectId, providerId, model, mode, prompt, negativePrompt, media, resolution, ratio, effectiveDuration, audio, promptExtend, watermark, seed, sourceVersionId, sourceExcerpt], () => {
  quote.value = undefined
  quoteRevision.value++
}, { deep: true, flush: 'sync' })
async function refreshTaskExplicitly() {
  if (!task.value)
    return
  if (!runId.value)
    return
  const summary = await platform.run(runId.value)
  const action = summary.allowedActions[0]
  if (!action)
    return
  await platform.command(runId.value, action)
  if (runId.value)
    task.value = (await platform.run(runId.value)).generation
  if (task.value && ['PENDING', 'RUNNING'].includes(task.value.status))
    polling.resume()
}
const reusedFromId = ref<string>()
async function loadFromTask(fromId: string) {
  try {
    const prior = (await platform.run(fromId)).generation
    if (prior) {
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
      await nextTick()
      normalizeSpecs(effectiveCapability.value)
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
onMounted(async () => {
  try {
    if (typeof route.query.run === 'string') {
      runId.value = route.query.run
      const run = await platform.run(runId.value)
      task.value = run.generation
      projectId.value = run.projectId || ''
      if (['PENDING', 'RUNNING'].includes(run.status))
        polling.resume()
    }
    if (typeof route.query.sourceVersion === 'string' && typeof route.query.document === 'string') {
      const version = await $fetch<import('#shared/types/text-creation').TextDocumentVersionRecord>(`/api/documents/${route.query.document}/versions/${route.query.sourceVersion}`)
      sourceVersionId.value = version.id
      projectId.value = version.projectId
      sourceText.value = version.content.content
      sourceExcerpt.value = version.content.content.slice(0, 20000)
      prompt.value = sourceExcerpt.value
    }
  }
  catch (error) {
    errorMessage.value = apiError(error)
  }
})
</script>

<template>
  <StudioWorkspace>
    <template #composer>
      <StudioConfigPanel
        v-model:project-id="projectId"
        v-model:source-version-id="sourceVersionId"
        v-model:source-excerpt="sourceExcerpt"
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
        :effective-capability="effectiveCapability"
        :mode-options="modeOptions"
        :resolution-options="resolutionOptions"
        :ratio-options="ratioOptions"
        :reference-slots="referenceSlots"
        :duration-steps="durationSteps"
        :duration-slider-value="durationSliderValue"
        :selected-model-name="selectedModelName"
        :submitting="submitting"
        :active="active"
        :model-available="!!modelAvailable"
        :error-message="errorMessage"
        :quote="quote"
        :media-values="mediaValues"
        :media-slot-max="mediaSlotMax"
        :project-options="projectOptions"
        :project-cursor="projectCursor"
        :source-text="sourceText"
        @more-projects="moreProjects().catch(e => errorMessage = apiError(e))"
        @fill-excerpt-to-prompt="prompt = sourceExcerpt || ''"
        @update:duration-slider-value="durationSliderValue = $event"
        @generate="generate"
        @set-media="setMedia"
      />
    </template>
    <StudioPreviewPanel
      :task="task"
      :ratio="ratio"
      @refresh="refreshTaskExplicitly"
    />
  </StudioWorkspace>
</template>
