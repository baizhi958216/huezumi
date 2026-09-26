<script setup lang="ts">
import type { AspectRatio, GenerationMode, MediaInput, MediaType, ProviderCapability, Resolution } from '#shared/types/generation'
import StudioMediaZone from './config/StudioMediaZone.vue'
import StudioPromptArea from './config/StudioPromptArea.vue'
import StudioSettingsModal from './config/StudioSettingsModal.vue'

defineProps<{
  effectiveCapability?: ProviderCapability
  modeOptions: Array<{ value: GenerationMode, label: string, hint: string, icon: string }>
  resolutionOptions: Resolution[]
  ratioOptions: AspectRatio[]
  referenceSlots: MediaType[]
  durationSteps?: number[]
  durationSliderValue: number | number[]
  selectedModelName: string
  submitting: boolean
  active: boolean
  modelAvailable: boolean
  errorMessage: string
  quote?: { estimatedCredits: number, sourceLabel: string }
  mediaValues: (type: MediaType) => MediaInput[]
  mediaSlotMax: (type: MediaType) => number | undefined
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
const settingsModalTab = ref<'specs' | 'project' | 'advanced'>('specs')

function openSettings(tab: 'specs' | 'project' | 'advanced' = 'specs') {
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

const { user } = useAuth()
const promptIdeas = [
  { label: '电影镜头', prompt: '夜幕下，一列复古列车穿过盐湖，镜头贴近水面缓慢跟随，远处闪电照亮群山，电影级光影。' },
  { label: '商品展示', prompt: '柔光棚拍，一款耳机悬浮旋转，镜头缓缓靠近金属细节，简洁背景，适合产品展示。' },
]
</script>

<template>
  <UCard class="studio-composer" :ui="{ body: 'flex min-h-0 flex-1 flex-col p-0 sm:p-0' }">
    <StudioPanelHeader title="视频生成" description="从静止的灵感，到流动的故事。" icon="i-lucide-video" />
    <div class="studio-composer__body">
      <StudioModePicker v-if="modeOptions.length" v-model="mode" :items="modeOptions" label="视频生成模式" />
      <UAlert v-if="user && !modelAvailable" color="warning" variant="subtle" description="视频生成暂不可用，请联系管理员分配生成服务并配置价格。" />
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

      <StudioPromptIdeas v-model="prompt" :items="promptIdeas" :maxlength="20000" />
      <div class="grid grid-cols-2 gap-3">
        <UFormField label="画幅">
          <USelect v-model="ratio" :items="ratioOptions.map(value => ({ label: value === 'adaptive' ? '自适应' : value, value }))" class="w-full" />
        </UFormField>
        <UFormField label="清晰度">
          <USelect v-model="resolution" :items="resolutionOptions" class="w-full" />
        </UFormField>
      </div>
      <UButton color="neutral" variant="outline" icon="i-lucide-settings-2" block @click="openSettings()">
        更多设置 · {{ smartDuration ? '智能时长' : `${duration} 秒` }}{{ audio ? ' · 有声' : '' }}
      </UButton>
    </div>
    <StudioGenerateAction :submitting="submitting" :active="active" :disabled="!!user && !modelAvailable" :quote="quote" :error-message="errorMessage" @generate="emit('generate')" />

    <!-- 4. 参数设置弹窗（规格、项目与高级选项收纳） -->
    <StudioSettingsModal
      v-model:open="settingsModalOpen"
      v-model:tab="settingsModalTab"
      v-model:project-id="projectId"
      v-model:resolution="resolution"
      v-model:ratio="ratio"
      v-model:duration="duration"
      v-model:smart-duration="smartDuration"
      v-model:audio="audio"
      v-model:negative-prompt="negativePrompt"
      v-model:prompt-extend="promptExtend"
      v-model:watermark="watermark"
      v-model:seed="seed"
      :effective-capability="effectiveCapability"
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
