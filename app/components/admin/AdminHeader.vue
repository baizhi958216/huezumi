<script setup lang="ts">
import { adminNavigation } from '~/utils/admin-navigation'

const route = useRoute()
const current = computed(() => adminNavigation.find(item => item.to === route.path) || adminNavigation[0]!)
</script>

<template>
  <header class="border-b border-default pb-5">
    <p class="mb-2 text-xs font-medium tracking-widest text-muted">
      HUEZUMI / 控制面板
    </p>
    <h1 class="text-2xl font-semibold text-highlighted">
      {{ current.label }}
    </h1>
    <p class="mt-2 text-sm text-muted">
      {{ current.description }}
    </p>
  </header>
</template>
