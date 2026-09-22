<script setup lang="ts">
defineProps<{ title: string, description: string, icon: string }>()
</script>

<template>
  <div class="studio-panel-header">
    <div class="studio-panel-header__icon">
      <UIcon :name="icon" class="size-5" />
    </div>
    <div class="min-w-0 flex-1">
      <h2 class="text-base font-semibold text-highlighted">
        {{ title }}
      </h2>
      <p class="mt-1 text-xs leading-relaxed text-muted">
        {{ description }}
      </p>
    </div>
    <slot />
  </div>
</template>
