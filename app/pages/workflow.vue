<script setup lang="ts">
const route = useRoute()
await navigateTo({ path: '/studio/workflow', query: route.query }, { redirectCode: 301 })
</script>

<template>
  <div />
</template>
