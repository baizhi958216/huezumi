<script setup lang="ts">
import type { AspectRatio, GenerationMode, MediaInput, MediaType, ModelSpec, ProviderCapability, Resolution } from '#shared/types/generation'
import { useEventListener } from '@vueuse/core'
import StudioActionBar from './config/StudioActionBar.vue'
import StudioMediaZone from './config/StudioMediaZone.vue'
import StudioModeSegment from './config/StudioModeSegment.vue'
import StudioPromptArea from './config/StudioPromptArea.vue'
import StudioSettingsModal from './config/StudioSettingsModal.vue'
import StudioSpecPills from './config/StudioSpecPills.vue'

const props = defineProps<{
  capability?: ProviderCapability
  selectedModel?: ModelSpec
  effectiveCapability?: ProviderCapability
  providerItems: Array<{ label: string, value: string, disabled: boolean }>
  modelItems: Array<{ label: string, value: string }>
  modeOptions: Array<{ value: GenerationMode, label: string, hint: string, icon: string }>
  resolutionOptions: Resolution[]
  ratioOptions: AspectRatio[]
  referenceSlots: MediaType[]
  durationSteps?: number[]
  durationSliderValue: number | number[]
  selectedModelName: string
  submitting: boolean
  errorMessage: string
  quote?: { estimatedCredits: number, sourceLabel: string }
  mediaValues: (type: MediaType) => MediaInput[]
  mediaSlotMax: (type: MediaType) => number | undefined
  setMedia: (type: MediaType, values: MediaInput[]) => void
  projectOptions?: Array<{ id: string, name: string }>
  projectCursor?: string | null
  sourceText?: string
}>()

const emit = defineEmits<{
  'setMedia': [type: MediaType, values: MediaInput[]]
  'generate': []
  'update:durationSliderValue': [value: number | number[]]
  'moreProjects': []
  'fillExcerptToPrompt': []
}>()

const projectId = defineModel<string>('projectId', { default: '' })
const sourceVersionId = defineModel<string | undefined>('sourceVersionId')
const sourceExcerpt = defineModel<string | undefined>('sourceExcerpt')
const providerId = defineModel<string | undefined>('providerId')
const model = defineModel<string>('model', { required: true })
const mode = defineModel<GenerationMode>('mode', { required: true })
const prompt = defineModel<string>('prompt', { required: true })
const negativePrompt = defineModel<string>('negativePrompt', { required: true })
const resolution = defineModel<Resolution>('resolution', { required: true })
const ratio = defineModel<AspectRatio>('ratio', { required: true })
const duration = defineModel<number>('duration', { required: true })
const smartDuration = defineModel<boolean>('smartDuration', { required: true })
const audio = defineModel<boolean>('audio', { required: true })
const promptExtend = defineModel<boolean>('promptExtend', { required: true })
const watermark = defineModel<boolean>('watermark', { required: true })
const seed = defineModel<number | undefined>('seed')
const advancedOpen = defineModel<boolean>('advancedOpen', { required: true })
const reusedFromId = defineModel<string | undefined>('reusedFromId')

const settingsModalOpen = ref(false)
const settingsModalTab = ref<'specs' | 'model' | 'advanced'>('specs')

function openSettings(tab: 'specs' | 'model' | 'advanced' = 'specs') {
  settingsModalTab.value = tab
  settingsModalOpen.value = true
}

watch(advancedOpen, (val) => {
  if (val) {
    settingsModalTab.value = 'advanced'
    settingsModalOpen.value = true
  }
})

watch(settingsModalOpen, (val) => {
  if (!val) {
    advancedOpen.value = false
  }
})

const hasAdvancedSettings = computed(() => Boolean(
  (negativePrompt.value && negativePrompt.value.trim().length > 0)
  || seed.value !== undefined
  || watermark.value === true
  || promptExtend.value === false,
))

// 快捷键支持：按 Cmd+Enter / Ctrl+Enter 直接触发生成或报价
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    if (!props.submitting && props.capability?.enabled) {
      event.preventDefault()
      emit('generate')
    }
  }
})
</script>

<template>
  <UCard
    class="flex flex-col overflow-hidden h-full border-default/80"
    :ui="{ body: 'flex flex-col flex-1 min-h-0 p-0 sm:p-0' }"
  >
    <!-- 1. Sticky Header: 标题、在线状态与模式切换 -->
    <div class="shrink-0 border-b border-default px-4 py-3.5 sm:px-5">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="type-kicker text-[11px] font-semibold tracking-wider text-dimmed uppercase">
            视频生成
          </p>
          <h1 class="mt-0.5 text-base sm:text-lg font-650 tracking-[-0.015em] text-highlighted">
            新建任务
          </h1>
        </div>
        <UBadge :color="capability?.enabled ? 'success' : 'warning'" variant="subtle" size="sm">
          {{ capability?.enabled ? `${capability.name} 在线` : '未配置凭据' }}
        </UBadge>
      </div>

      <StudioModeSegment
        v-model="mode"
        :mode-options="modeOptions"
        class="mt-3"
      />
    </div>

    <!-- 2. Scrollable Body: 聚焦于核心创作（提示词、素材、参数胶囊） -->
    <div class="panel-scroll studio-scroll flex-1 min-h-0 space-y-4 px-4 py-4 sm:px-5 overflow-y-auto">
      <!-- 提示词输入与片段关联 -->
      <StudioPromptArea
        v-model:prompt="prompt"
        v-model:source-version-id="sourceVersionId"
        v-model:source-excerpt="sourceExcerpt"
        v-model:reused-from-id="reusedFromId"
        :source-text="sourceText"
        @fill-excerpt-to-prompt="emit('fillExcerptToPrompt')"
      />

      <!-- 动态素材插槽（首尾帧 / 多模态参考） -->
      <StudioMediaZone
        :mode="mode"
        :effective-capability="effectiveCapability"
        :reference-slots="referenceSlots"
        :media-values="mediaValues"
        :media-slot-max="mediaSlotMax"
        @set-media="(type, values) => emit('setMedia', type, values)"
      />

      <!-- 参数摘要胶囊栏（点击直达设置弹窗） -->
      <StudioSpecPills
        :selected-model-name="selectedModelName"
        :resolution="resolution"
        :ratio="ratio"
        :duration="duration"
        :smart-duration="smartDuration"
        :audio="audio"
        :supports-audio="effectiveCapability?.supportsAudio"
        :has-advanced-settings="hasAdvancedSettings"
        :disabled="submitting"
        @open-settings="openSettings"
      />
    </div>

    <!-- 3. Sticky Action Footer: 常驻底部操作栏 -->
    <StudioActionBar
      :submitting="submitting"
      :error-message="errorMessage"
      :quote="quote"
      :capability="capability"
      @generate="emit('generate')"
    />

    <!-- 4. 参数设置弹窗（规格、模型与高级选项收纳） -->
    <StudioSettingsModal
      v-model:open="settingsModalOpen"
      v-model:tab="settingsModalTab"
      v-model:project-id="projectId"
      v-model:provider-id="providerId"
      v-model:model="model"
      v-model:resolution="resolution"
      v-model:ratio="ratio"
      v-model:duration="duration"
      v-model:smart-duration="smartDuration"
      v-model:audio="audio"
      v-model:negative-prompt="negativePrompt"
      v-model:prompt-extend="promptExtend"
      v-model:watermark="watermark"
      v-model:seed="seed"
      :capability="capability"
      :selected-model="selectedModel"
      :effective-capability="effectiveCapability"
      :provider-items="providerItems"
      :model-items="modelItems"
      :resolution-options="resolutionOptions"
      :ratio-options="ratioOptions"
      :duration-steps="durationSteps"
      :duration-slider-value="durationSliderValue"
      :selected-model-name="selectedModelName"
      :project-options="projectOptions"
      :project-cursor="projectCursor"
      @update:duration-slider-value="emit('update:durationSliderValue', $event)"
      @more-projects="emit('moreProjects')"
    />
  </UCard>
</template>
