<script setup lang="ts">
import type { ProviderCapability } from '#shared/types/generation'

useSeoMeta({
  title: '绘小宙 — 创作属于你的小宇宙',
  description: '写故事、设定角色、构思画面、生成视频。在绘小宙，把喜欢的想象慢慢变成自己的作品。',
  ogTitle: '绘小宙 — 故事、角色、画面与视频',
  ogDescription: '从一个故事开头到一段动态镜头，创作属于你的小宇宙。',
})

const { data: providerCatalog, status, error, refresh } = await useFetch<ProviderCapability[]>('/api/providers')
const providers = computed(() => providerCatalog.value ?? [])
</script>

<template>
  <div class="app-home-page bg-default">
    <HomeHero />
    <HomeGenerationModes />
    <HomeUseCases />
    <HomeWorkflow />
    <HomeModelCatalog :providers="providers" :loading="status === 'pending'" :failed="Boolean(error)" @retry="refresh()" />
    <HomeFaqCta />
  </div>
</template>
