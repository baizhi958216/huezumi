<script setup lang="ts">
import type { AspectRatio, ProviderCapability, Resolution } from '#shared/types/generation'
import StudioModelPicker from './StudioModelPicker.vue'
import StudioSpecGrid from './StudioSpecGrid.vue'

const props = defineProps<{
  effectiveCapability?: ProviderCapability
  resolutionOptions: Resolution[]
  ratioOptions: AspectRatio[]
  durationSteps?: number[]
  durationSliderValue: number | number[]
  selectedModelName: string
  projectOptions?: Array<{ id: string, name: string }>
  projectCursor?: string | null
}>()

const emit = defineEmits<{
  'update:durationSliderValue': [value: number | number[]]
  'moreProjects': []
}>()

const open = defineModel<boolean>('open', { default: false })
const activeTab = defineModel<'specs' | 'project' | 'advanced'>('tab', { default: 'specs' })

const projectId = defineModel<string>('projectId', { default: '' })
const resolution = defineModel<Resolution>('resolution', { required: true })
const ratio = defineModel<AspectRatio>('ratio', { required: true })
const duration = defineModel<number>('duration', { required: true })
const smartDuration = defineModel<boolean>('smartDuration', { required: true })
const audio = defineModel<boolean>('audio', { required: true })
const negativePrompt = defineModel<string>('negativePrompt', { required: true })
const promptExtend = defineModel<boolean>('promptExtend', { required: true })
const watermark = defineModel<boolean>('watermark', { required: true })
const seed = defineModel<number | undefined>('seed')

const tabs = [
  { id: 'specs' as const, label: '规格参数', icon: 'i-lucide-monitor' },
  { id: 'project' as const, label: '归属项目', icon: 'i-lucide-folder' },
  { id: 'advanced' as const, label: '高级控制', icon: 'i-lucide-sliders-horizontal' },
]

function resetDefaults() {
  if (props.resolutionOptions.length)
    resolution.value = props.resolutionOptions[0]!
  if (props.ratioOptions.length)
    ratio.value = props.ratioOptions[0]!
  if (props.durationSteps?.length)
    duration.value = props.durationSteps[0]!
  smartDuration.value = false
  audio.value = true
  negativePrompt.value = ''
  promptExtend.value = true
  watermark.value = false
  seed.value = undefined
}
</script>

<template>
  <UModal
    v-model:open="open"
    description="配置输出规格、项目与高级生成控制"
    :ui="{ content: 'sm:max-w-xl max-w-[94vw] overflow-hidden' }"
  >
    <template #title>
      <span class="flex items-center gap-2.5">
        <span class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-lucide-sliders" class="size-4.5" />
        </span>
        生成参数设置
      </span>
    </template>

    <template #close>
      <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" aria-label="关闭" />
    </template>

    <template #body>
      <div class="space-y-4">
        <!-- 分组导航 Tab 栏 -->
        <div class="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 border border-default/50">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            class="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all"
            :class="activeTab === t.id ? 'bg-elevated text-highlighted shadow-xs font-semibold' : 'text-muted hover:text-toned'"
            @click="activeTab = t.id"
          >
            <UIcon :name="t.icon" class="size-3.5" />
            <span>{{ t.label }}</span>
          </button>
        </div>

        <!-- Tab 1: 规格参数 -->
        <div v-show="activeTab === 'specs'" class="space-y-4 pt-1">
          <StudioSpecGrid
            v-model:resolution="resolution"
            v-model:ratio="ratio"
            v-model:duration="duration"
            v-model:smart-duration="smartDuration"
            v-model:audio="audio"
            :effective-capability="effectiveCapability"
            :resolution-options="resolutionOptions"
            :ratio-options="ratioOptions"
            :duration-steps="durationSteps"
            :duration-slider-value="durationSliderValue"
            :selected-model-name="selectedModelName"
            @update:duration-slider-value="emit('update:durationSliderValue', $event)"
          />
        </div>

        <!-- Tab 2: 归属项目 -->
        <div v-show="activeTab === 'project'" class="space-y-4 pt-1">
          <StudioModelPicker
            v-model:project-id="projectId"
            :project-options="projectOptions"
            :project-cursor="projectCursor"
            @more-projects="emit('moreProjects')"
          />
        </div>

        <!-- Tab 3: 高级控制 -->
        <div v-show="activeTab === 'advanced'" class="space-y-4 pt-1">
          <div class="rounded-lg bg-muted/30 p-3 border border-default/40">
            <p class="text-xs text-muted leading-relaxed">
              高级参数根据各供应商模型能力动态生效。若留空或使用默认值，系统将以最优配置生成。
            </p>
          </div>

          <UFormField v-if="effectiveCapability?.supportsNegativePrompt" label="反向提示词" size="sm">
            <UTextarea
              v-model="negativePrompt"
              size="sm"
              :rows="3"
              class="w-full text-xs"
              placeholder="输入不希望在画面中出现的元素、变形或瑕疵…"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UCheckbox
              v-if="effectiveCapability?.supportsPromptExtend"
              v-model="promptExtend"
              size="sm"
              label="智能扩写优化"
              description="由大模型智能丰富镜头细节与光影描述"
              class="text-xs"
            />
            <UCheckbox
              v-if="effectiveCapability?.supportsWatermark"
              v-model="watermark"
              size="sm"
              label="保留 AI 水印"
              description="保留模型合规可见标识"
              class="text-xs"
            />
          </div>

          <UFormField v-if="effectiveCapability?.supportsSeed" label="随机种子 (Seed)" hint="可选" size="sm">
            <UInput
              v-model.number="seed"
              type="number"
              min="0"
              max="2147483647"
              placeholder="留空自动随机生成"
              size="sm"
              class="w-full text-xs"
            />
          </UFormField>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-1.5 text-xs text-dimmed truncate max-w-[260px] sm:max-w-none">
          <UIcon name="i-lucide-check-circle-2" class="size-3.5 text-success shrink-0" />
          <span class="truncate">{{ resolution }} · {{ ratio }} · {{ smartDuration ? '智能时长' : `${duration}s` }}</span>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            @click="resetDefaults"
          >
            恢复默认
          </UButton>
          <UButton
            color="primary"
            size="sm"
            @click="open = false"
          >
            应用设置
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
