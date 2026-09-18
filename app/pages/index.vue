<script setup lang="ts">
import type { ProviderCapability } from '#shared/types/generation'

const { data: providerCatalog } = await useFetch<ProviderCapability[]>('/api/providers')
const providers = computed(() => providerCatalog.value ?? [])
const modelCount = computed(() => providers.value.reduce((sum, provider) => sum + provider.models.length, 0))
</script>

<template>
  <div class="app-home-page bg-default">
    <HomeHero :model-count="modelCount" :provider-count="providers.length" />
    <HomeModelCatalog :providers="providers" />
    <HomeGenerationModes />
    <HomeUseCases />
    <HomeWorkflow />
    <HomeFaqCta />
  </div>
</template>
