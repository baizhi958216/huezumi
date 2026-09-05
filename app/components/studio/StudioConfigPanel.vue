<script setup lang="ts">
import type { AspectRatio, GenerationMode, MediaInput, MediaType, ModelSpec, ProviderCapability, Resolution } from '#shared/types/generation'

defineProps<{
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
}>()

const emit = defineEmits<{
  'setMedia': [type: MediaType, values: MediaInput[]]
  'generate': []
  'update:durationSliderValue': [value: number | number[]]
}>()

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

function updateDurationSlider(value: number | number[] | undefined) {
  if (value !== undefined)
    emit('update:durationSliderValue', value)
}
</script>

<template>
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
              :model-value="durationSliderValue"
              size="sm"
              :min="effectiveCapability?.duration.min ?? 2"
              :max="effectiveCapability?.duration.max ?? 30"
              :step="1"
              :disabled="smartDuration"
              @update:model-value="updateDurationSlider"
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
        @click="emit('generate')"
      >
        {{ submitting ? '正在处理…' : quote ? `确认消耗 ${quote.estimatedCredits} 额度并生成` : '获取额度报价' }}
      </UButton>
      <p class="type-caption text-center text-[11px] text-dimmed leading-4">
        {{ quote ? `${quote.sourceLabel} · 报价 10 分钟内有效` : `按当前参数计算 ${capability?.name || ''} 额度` }}
      </p>
    </div>
  </UCard>
</template>
