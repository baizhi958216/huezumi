<script setup lang="ts">
import { useComfyEvents } from '~/composables/useComfyServer'

const props = defineProps<{ nodeId: string }>()
const { executedOutputs, cachedNodeIds, lastErrorNodeId } = useComfyEvents()
const copied = ref(false)
const copyError = ref(false)
const text = computed(() => {
  const output = executedOutputs.value[props.nodeId]
  if (!output)
    return ''
  const values = output.text !== undefined ? [output.text] : Object.values(output)
  return values.flatMap(value => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === 'string')
    .join('\n\n')
})
watch(text, () => {
  copied.value = false
})
async function copy() {
  copyError.value = false
  try {
    await navigator.clipboard.writeText(text.value)
    copied.value = true
  }
  catch {
    copyError.value = true
  }
}
</script>

<template>
  <div v-if="text" class="comfy-node__prompt-preview nodrag nowheel">
    <div class="flex items-center justify-between gap-2 text-xs text-muted">
      <span>{{ lastErrorNodeId === nodeId ? '本次失败 · 上次结果' : cachedNodeIds.includes(nodeId) ? '复用结果' : '上次执行结果' }}</span>
      <UButton size="xs" color="neutral" variant="ghost" :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" aria-label="复制文本结果" @click.stop="copy" />
    </div>
    <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed select-text">{{ text }}</pre>
    <p v-if="copyError" class="text-xs text-error">
      复制失败，请手动选择文本复制。
    </p>
  </div>
</template>
