<script setup lang="ts">
defineProps<{ icon: string, title: string, description: string, busy?: boolean }>()
</script>

<template>
  <div class="studio-empty" role="status">
    <div class="studio-empty__art" aria-hidden="true">
      <div class="studio-empty__paper">
        <UIcon :name="busy ? 'i-lucide-loader-circle' : icon" class="size-8" :class="{ 'animate-spin': busy }" />
      </div>
      <span class="studio-empty__spark"><UIcon name="i-lucide-sparkles" class="size-4" /></span>
    </div>
    <h3 class="text-lg font-semibold text-highlighted">
      {{ title }}
    </h3>
    <p class="mt-3 max-w-sm text-sm leading-7 text-muted">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-7 w-full max-w-md">
      <slot />
    </div>
  </div>
</template>
