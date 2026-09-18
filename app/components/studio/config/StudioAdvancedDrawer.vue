<script setup lang="ts">
import type { ProviderCapability } from '#shared/types/generation'

defineProps<{
  effectiveCapability?: ProviderCapability
}>()

const advancedOpen = defineModel<boolean>('advancedOpen', { required: true })
const negativePrompt = defineModel<string>('negativePrompt', { required: true })
const promptExtend = defineModel<boolean>('promptExtend', { required: true })
const watermark = defineModel<boolean>('watermark', { required: true })
const seed = defineModel<number | undefined>('seed')
</script>

<template>
  <div class="border-t border-default/60 pt-2">
    <UCollapsible v-model:open="advancedOpen">
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        block
        icon="i-lucide-sliders-horizontal"
        trailing-icon="i-lucide-chevron-down"
        class="justify-between text-xs text-muted hover:text-highlighted px-1"
      >
        <span class="font-medium">高级设置</span>
      </UButton>
      <template #content>
        <div class="space-y-3 pt-3">
          <UFormField v-if="effectiveCapability?.supportsNegativePrompt" label="反向提示词" size="sm">
            <UInput
              v-model="negativePrompt"
              size="sm"
              class="w-full text-xs"
              placeholder="输入不希望在画面中出现的元素或瑕疵"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-2.5">
            <UCheckbox
              v-if="effectiveCapability?.supportsPromptExtend"
              v-model="promptExtend"
              size="sm"
              label="智能改写"
              description="由大模型优化扩写细节"
              class="text-xs"
            />
            <UCheckbox
              v-if="effectiveCapability?.supportsWatermark"
              v-model="watermark"
              size="sm"
              label="AI 水印"
              description="保留模型合规可见水印"
              class="text-xs"
            />
          </div>
          <UFormField v-if="effectiveCapability?.supportsSeed" label="随机种子" hint="可选" size="sm">
            <UInput
              v-model.number="seed"
              type="number"
              min="0"
              max="2147483647"
              placeholder="留空自动随机"
              size="sm"
              class="w-full text-xs"
            />
          </UFormField>
        </div>
      </template>
    </UCollapsible>
  </div>
</template>
