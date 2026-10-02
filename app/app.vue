<script setup lang="ts">
import { zh_cn } from '@nuxt/ui/locale'
</script>

<template>
  <UApp :locale="zh_cn" :toaster="{ position: 'bottom-right', expand: false, max: 5 }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
