<script setup lang="ts">
const props = defineProps<{ items: Array<{ label: string, prompt: string }>, maxlength: number }>()
const model = defineModel<string>({ required: true })
function apply(prompt: string) {
  model.value = model.value.trim() ? `${model.value}\n${prompt}` : prompt
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" aria-label="灵感示例">
    <span class="text-xs text-dimmed">试试灵感</span>
    <button v-for="item in items" :key="item.label" type="button" class="studio-idea" :disabled="model.length + item.prompt.length + (model.trim() ? 1 : 0) > props.maxlength" :title="model.trim() ? '追加到当前描述' : '填入创作描述'" @click="apply(item.prompt)">
      {{ item.label }}<UIcon name="i-lucide-plus" class="size-3" />
    </button>
  </div>
</template>
