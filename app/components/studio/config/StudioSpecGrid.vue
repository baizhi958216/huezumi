<script setup lang="ts">
import type { AspectRatio, ProviderCapability, Resolution } from '#shared/types/generation'

defineProps<{
  effectiveCapability?: ProviderCapability
  resolutionOptions: Resolution[]
  ratioOptions: AspectRatio[]
  durationSteps?: number[]
  durationSliderValue: number | number[]
  selectedModelName: string
}>()

const emit = defineEmits<{
  'update:durationSliderValue': [value: number | number[]]
}>()

const resolution = defineModel<Resolution>('resolution', { required: true })
const ratio = defineModel<AspectRatio>('ratio', { required: true })
const duration = defineModel<number>('duration', { required: true })
const smartDuration = defineModel<boolean>('smartDuration', { required: true })
const audio = defineModel<boolean>('audio', { required: true })

function updateDurationSlider(value: number | number[] | undefined) {
  if (value !== undefined)
    emit('update:durationSliderValue', value)
}
</script>

<template>
  <div class="space-y-4 border-t border-default/60 pt-4">
    <!-- 清晰度 -->
    <div>
      <div class="type-label mb-1.5 text-xs font-semibold text-toned flex items-center justify-between">
        <span>清晰度</span>
        <span class="type-caption text-[11px] text-dimmed font-normal">更高清晰度需消耗更多额度</span>
      </div>
      <UFieldGroup class="w-full">
        <UButton
          v-for="item in resolutionOptions"
          :key="item"
          color="neutral"
          variant="outline"
          size="sm"
          class="flex-1 justify-center text-xs font-medium transition-colors"
          :class="resolution === item ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white shadow-xs' : 'text-muted'"
          :aria-pressed="resolution === item"
          @click="resolution = item"
        >
          {{ item }}
        </UButton>
      </UFieldGroup>
    </div>

    <!-- 画面比例 -->
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
          class="flex-col gap-1.5 px-1 py-2 text-xs font-medium transition-all"
          :class="ratio === item ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white shadow-xs' : 'text-muted'"
          :aria-pressed="ratio === item"
          @click="ratio = item"
        >
          <span
            class="block w-3.5 rounded-[1.5px] border border-current opacity-70"
            :style="{ aspectRatio: item === 'adaptive' ? '16 / 10' : item.replace(':', ' / ') }"
          />
          <span class="text-[10px] leading-none tracking-tight">{{ item === 'adaptive' ? '自适应' : item }}</span>
        </UButton>
      </div>
    </div>

    <!-- 时长调节 -->
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
          class="flex-1 justify-center text-xs font-medium transition-colors"
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

    <!-- 音频伴生生成 -->
    <UCard v-if="effectiveCapability?.supportsAudio" variant="subtle" :ui="{ body: 'p-3 sm:p-3' }">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <div class="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UIcon name="i-lucide-audio-lines" class="size-4" />
          </div>
          <div>
            <div class="text-xs font-semibold text-toned">
              同步生成音频
            </div>
            <p class="type-caption mt-0.5 text-[11px] text-dimmed">
              生成对白、音效和背景音乐
            </p>
          </div>
        </div>
        <USwitch v-model="audio" size="sm" />
      </div>
    </UCard>
    <p v-else-if="effectiveCapability && !effectiveCapability.supportsAudio" class="type-caption text-xs text-dimmed">
      {{ selectedModelName }} 不支持同步生成音频，输出为无声视频。
    </p>
  </div>
</template>
