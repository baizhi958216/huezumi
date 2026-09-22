<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

const props = defineProps<{
  submitting: boolean
  disabled?: boolean
  active?: boolean
  errorMessage?: string
  quote?: { estimatedCredits: number }
}>()
const emit = defineEmits<{ generate: [] }>()
const { user } = useAuth()
const blocked = computed(() => props.submitting || props.disabled || props.active)
useEventListener('keydown', (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter' || event.repeat || event.isComposing || blocked.value)
    return
  if (!target?.closest('.studio-composer') || target.closest('[role="dialog"]'))
    return
  event.preventDefault()
  emit('generate')
})
</script>

<template>
  <div class="studio-generate-action">
    <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage" class="mb-3" />
    <div class="mb-3 flex items-center justify-between gap-2 text-xs" aria-live="polite">
      <span class="flex items-center gap-1.5" :class="quote ? 'text-primary' : 'text-muted'"><UIcon name="i-lucide-coins" class="size-3.5" />{{ quote ? `预估 ${quote.estimatedCredits} 额度` : '先查看报价，再确认生成' }}</span>
      <span class="text-dimmed">Ctrl / ⌘ ↵</span>
    </div>
    <UButton block size="lg" :icon="quote ? 'i-lucide-sparkles' : 'i-lucide-arrow-right'" :loading="submitting" :disabled="blocked" class="min-h-12 justify-center" @click="emit('generate')">
      {{ active ? '正在生成…' : !user ? '登录后开始创作' : quote ? `确认生成 · ${quote.estimatedCredits} 额度` : '获取生成报价' }}
    </UButton>
    <p class="mt-2.5 text-center text-xs text-dimmed">
      {{ quote ? '确认后预留额度，修改参数需重新报价' : '结果自动保存，等待时可以离开页面' }}
    </p>
  </div>
</template>
