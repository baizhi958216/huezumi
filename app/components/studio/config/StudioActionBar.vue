<script setup lang="ts">
import type { ProviderCapability } from '#shared/types/generation'

defineProps<{
  submitting: boolean
  errorMessage: string
  quote?: { estimatedCredits: number, sourceLabel: string }
  capability?: ProviderCapability
}>()

const emit = defineEmits<{
  generate: []
}>()
</script>

<template>
  <div class="shrink-0 border-t border-default bg-surface/90 backdrop-blur-md px-4 py-3 sm:px-5 sm:py-3.5 space-y-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.25)]">
    <!-- 校验与错误提示 -->
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="errorMessage"
      size="sm"
      class="text-xs"
    />

    <!-- 报价状态微卡片（报价生效时呈现） -->
    <div
      v-if="quote"
      class="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-1.5 text-xs text-primary font-medium"
    >
      <span class="flex items-center gap-1.5">
        <UIcon name="i-lucide-coins" class="size-3.5 shrink-0" />
        <span>预估扣减 <strong>{{ quote.estimatedCredits }}</strong> 额度</span>
      </span>
      <span class="text-[11px] opacity-80">
        10分钟锁定
      </span>
    </div>

    <!-- 核心操作主按钮 -->
    <UButton
      color="primary"
      size="lg"
      block
      :loading="submitting"
      :disabled="submitting || !capability?.enabled"
      class="h-10 text-xs sm:text-sm font-semibold shadow-xs justify-between"
      @click="emit('generate')"
    >
      <span class="flex items-center gap-2">
        <UIcon
          :name="submitting ? 'i-lucide-loader-circle' : quote ? 'i-lucide-sparkles' : 'i-lucide-calculator'"
          class="size-4 shrink-0"
          :class="{ 'animate-spin': submitting }"
        />
        <span>{{ submitting ? '正在提交任务…' : quote ? `确认消耗 ${quote.estimatedCredits} 额度并生成` : '获取额度报价' }}</span>
      </span>
      <span class="hidden sm:inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono tracking-tight bg-white/20 dark:bg-black/20 text-current border border-white/20 dark:border-black/20">
        ⌘↵
      </span>
    </UButton>

    <p class="type-caption text-center text-[11px] text-dimmed leading-4">
      {{ quote ? `${quote.sourceLabel} · 报价生成期间额度预留` : capability?.enabled ? `按当前所选模型与时长计算 ${capability.name} 额度` : '服务平台未配置凭据，无法生成' }}
    </p>
  </div>
</template>
