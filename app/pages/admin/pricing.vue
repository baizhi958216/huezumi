<script setup lang="ts">
import type { ConnectionSummary } from '#shared/types/platform'

const { data: connections, error, refresh } = await useFetch<ConnectionSummary[]>('/api/admin/connections')
const tab = ref('text')
const tabs = [{ label: '文案 · 按篇幅', value: 'text' }, { label: '图片 · 按张', value: 'image' }, { label: '视频 · 按公式', value: 'video' }]
</script>

<template>
  <div class="space-y-5">
    <UAlert v-if="error" color="error" title="连接加载失败">
      <template #actions>
        <UButton @click="refresh()">
          重试
        </UButton>
      </template>
    </UAlert>
    <UTabs v-model="tab" :items="tabs" :content="false" class="max-w-xl" />
    <AdminTextPricing v-if="tab === 'text'" :connections="connections || []" />
    <AdminImagePricing v-else-if="tab === 'image'" :connections="connections || []" />
    <AdminVideoPricing v-else />
  </div>
</template>
