<script setup lang="ts" generic="T extends string">
defineProps<{ items: Array<{ value: T, label: string, icon: string, hint?: string }>, label: string }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="studio-mode-picker" role="group" :aria-label="label">
    <button v-for="item in items" :key="item.value" type="button" class="studio-mode-picker__item" :class="{ 'is-active': model === item.value }" :aria-pressed="model === item.value" :title="item.hint" @click="model = item.value">
      <UIcon :name="item.icon" class="size-4 shrink-0" />
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>
