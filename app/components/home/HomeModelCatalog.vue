<script setup lang="ts">
import type { ModelSpec, ProviderCapability } from '#shared/types/generation'
import { resolveModelCapability } from '#shared/types/generation'
import { useClipboard } from '@vueuse/core'

const props = defineProps<{ providers: ProviderCapability[] }>()
const selectedProviderId = ref('')
const selectedModelId = ref('')
const { copy, copied } = useClipboard({ copiedDuring: 1800 })

const selectedProvider = computed(() => props.providers.find(item => item.id === selectedProviderId.value) ?? props.providers[0])
const selectedModel = computed(() => selectedProvider.value?.models.find(item => item.id === selectedModelId.value) ?? selectedProvider.value?.models[0])
const modelCount = computed(() => props.providers.reduce((sum, item) => sum + item.models.length, 0))
const modelItems = computed(() => props.providers.flatMap(provider => provider.models.map(model => ({ label: `${cleanName(model.name)} · ${provider.name}`, value: `${provider.id}:${model.id}` }))))
const selectedKey = computed({
  get: () => selectedProvider.value && selectedModel.value ? `${selectedProvider.value.id}:${selectedModel.value.id}` : '',
  set: (value: string) => {
    const separator = value.indexOf(':')
    selectedProviderId.value = value.slice(0, separator)
    selectedModelId.value = value.slice(separator + 1)
  },
})

watch(() => props.providers, (providers) => {
  if (!providers.some(item => item.id === selectedProviderId.value))
    selectedProviderId.value = providers[0]?.id ?? ''
}, { immediate: true })

watch(selectedProvider, (provider) => {
  if (provider && !provider.models.some(item => item.id === selectedModelId.value))
    selectedModelId.value = provider.models[0]?.id ?? ''
}, { immediate: true })

function cleanName(name: string) {
  return name.replace(/（百炼）$/, '')
}

function chooseProvider(id: string) {
  selectedProviderId.value = id
  selectedModelId.value = props.providers.find(item => item.id === id)?.models[0]?.id ?? ''
}

function specs(provider: ProviderCapability, model: ModelSpec) {
  const cap = resolveModelCapability(provider, model.id)
  const modeNames = [cap.modes.includes('text') && '文生', cap.modes.includes('frames') && (cap.media.includes('last_frame') ? '首尾帧' : '首帧'), cap.modes.includes('reference') && '参考生'].filter(Boolean).join(' · ')
  const duration = cap.duration.steps?.length ? cap.duration.steps.map(value => `${value}s`).join(' / ') : `${cap.duration.min}–${cap.duration.max}s`
  const media = [cap.media.includes('first_frame') && '首帧', cap.media.includes('last_frame') && '尾帧', cap.media.includes('reference_image') && '参考图', cap.media.includes('reference_video') && '视频', cap.media.includes('reference_audio') && '音频'].filter(Boolean).join(' · ') || '纯文本'
  return [
    { label: '生成方式', icon: 'i-lucide-wand-sparkles', value: modeNames },
    { label: '清晰度', icon: 'i-lucide-scan', value: cap.resolutions.join(' / ') },
    { label: '输出时长', icon: 'i-lucide-timer', value: cap.duration.smart ? `${duration} / 智能` : duration },
    { label: '画幅比例', icon: 'i-lucide-frame', value: cap.ratios.length ? cap.ratios.map(value => value === 'adaptive' ? '自适应' : value).join(' / ') : '跟随素材' },
    { label: '音频模式', icon: 'i-lucide-audio-lines', value: cap.supportsAudio ? '支持生成音频' : '无声' },
    { label: '输入素材', icon: 'i-lucide-folder-input', value: media },
  ]
}
</script>

<template>
  <section id="capabilities" class="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
    <div class="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <p class="type-kicker">
          MODEL CATALOG
        </p><h2 class="type-section-title mt-2">
          全生态视频模型矩阵，统一契约调度
        </h2><p class="type-body mt-2 max-w-2xl">
          深度适配 {{ providers.length }} 家供应商、{{ modelCount }} 款视频模型，参数与生成能力自动对齐。
        </p>
      </div>
      <USelect v-model="selectedKey" :items="modelItems" class="w-full md:w-72" aria-label="选择模型" />
    </div>
    <div class="mt-7 flex flex-wrap gap-2">
      <button v-for="provider in providers" :key="provider.id" type="button" class="rounded-full border px-3 py-1.5 text-sm font-medium transition" :class="selectedProvider?.id === provider.id ? 'border-signal-500 bg-signal-500 text-white' : 'border-default bg-elevated text-muted hover:border-accented hover:text-highlighted'" @click="chooseProvider(provider.id)">
        {{ provider.name }} <span class="ml-1 opacity-70">{{ provider.models.length }}</span>
      </button>
    </div>

    <div v-if="selectedProvider && selectedModel" class="mt-6 grid overflow-hidden rounded-2xl border border-default bg-elevated shadow-card lg:grid-cols-[0.9fr_1.1fr]">
      <div class="border-b border-default p-5 md:p-7 lg:border-b-0 lg:border-r">
        <p class="type-kicker">
          {{ selectedProvider.name }} · {{ selectedProvider.vendor }}
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <h3 class="text-2xl font-650 tracking-tight text-highlighted">
            {{ cleanName(selectedModel.name) }}
          </h3><UBadge v-if="selectedModel.badge" color="primary" variant="subtle">
            {{ selectedModel.badge }}
          </UBadge>
        </div>
        <p class="mt-3 text-sm leading-7 text-muted">
          {{ selectedModel.description }}
        </p>
        <div class="mt-5 flex items-center justify-between gap-3 rounded-lg border border-default bg-muted/40 px-3 py-2">
          <code class="truncate text-xs text-toned">{{ selectedModel.id }}</code><button type="button" class="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted hover:text-highlighted" @click="copy(selectedModel.id)">
            <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3.5" />{{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <p v-if="selectedModel.capabilities?.notes || selectedProvider.notes" class="mt-4 rounded-lg bg-signal-50 p-3 text-xs leading-6 text-signal-800 dark:bg-signal-950/30 dark:text-signal-200">
          {{ selectedModel.capabilities?.notes || selectedProvider.notes }}
        </p>
        <UButton :to="`/studio?provider=${selectedProvider.id}&model=${selectedModel.id}`" class="mt-5" trailing-icon="i-lucide-arrow-up-right">
          去创作台使用
        </UButton>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="item in specs(selectedProvider, selectedModel)" :key="item.label" class="min-h-32 border-b border-r border-default p-5 last:border-b-0">
          <div class="flex items-center justify-between text-xs text-dimmed">
            <span>{{ item.label }}</span><UIcon :name="item.icon" class="size-4 text-signal-500" />
          </div><strong class="mt-3 block text-sm leading-6 text-highlighted">{{ item.value }}</strong>
        </div>
      </div>
    </div>
  </section>
</template>
