<script setup lang="ts">
import type { GenerationMode } from '#shared/types/generation'

defineProps<{
  modeOptions: Array<{ value: GenerationMode, label: string, hint: string, icon: string }>
}>()

const mode = defineModel<GenerationMode>({ required: true })
</script>

<template>
  <div>
    <UFieldGroup class="w-full">
      <UButton
        v-for="item in modeOptions"
        :key="item.value"
        color="neutral"
        variant="outline"
        size="sm"
        class="min-w-0 flex-1 justify-center whitespace-nowrap px-2 text-xs font-medium transition-colors"
        :class="mode === item.value ? 'bg-zinc-950 text-white hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white shadow-xs' : 'text-muted'"
        :aria-pressed="mode === item.value"
        @click="mode = item.value"
      >
        <UIcon :name="item.icon" class="size-3.5 shrink-0" />
        <span>{{ item.label }}</span>
      </UButton>
    </UFieldGroup>
    <p class="type-caption mt-1.5 text-xs text-dimmed leading-relaxed">
      {{ modeOptions.find(item => item.value === mode)?.hint }}
    </p>
  </div>
</template>
