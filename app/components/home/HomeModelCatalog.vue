<script setup lang="ts">
import type { ModelSpec, ProviderCapability } from '#shared/types/generation'
import { resolveModelCapability } from '#shared/types/generation'
import { useClipboard } from '@vueuse/core'

const props = defineProps<{ providers: ProviderCapability[], loading?: boolean, failed?: boolean }>()
defineEmits<{ retry: [] }>()
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
  const modeNames = [cap.modes.includes('text') && '文生视频', cap.modes.includes('frames') && (cap.media.includes('last_frame') ? '首尾帧过渡' : '首帧生成'), cap.modes.includes('reference') && '参考生视频'].filter(Boolean).join(' · ')
  const duration = cap.duration.steps?.length ? cap.duration.steps.map(value => `${value}s`).join(' / ') : `${cap.duration.min}–${cap.duration.max}s`
  const media = [cap.media.includes('first_frame') && '首帧图', cap.media.includes('last_frame') && '尾帧图', cap.media.includes('reference_image') && '参考图', cap.media.includes('reference_video') && '参考视频', cap.media.includes('reference_audio') && '参考音频'].filter(Boolean).join(' · ') || '纯文本提示'
  return [
    { label: '生成模式', icon: 'i-lucide-wand-sparkles', value: modeNames },
    { label: '分辨率支持', icon: 'i-lucide-scan', value: cap.resolutions.join(' / ') },
    { label: '输出时长', icon: 'i-lucide-timer', value: cap.duration.smart ? `${duration} (支持智能时长)` : duration },
    { label: '画幅比例', icon: 'i-lucide-frame', value: cap.ratios.length ? cap.ratios.map(value => value === 'adaptive' ? '自适应' : value).join(' / ') : '素材自适应' },
    { label: '音频支持', icon: 'i-lucide-audio-lines', value: cap.supportsAudio ? '原生支持同步音频生成' : '纯画面生成 (无声)' },
    { label: '输入素材类型', icon: 'i-lucide-folder-input', value: media },
  ]
}
</script>

<template>
  <section id="capabilities" class="home-section model-section">
    <div class="home-section-header">
      <div>
        <span class="section-kicker">✦ 创作工具箱</span>
        <h2 class="section-title">
          让想象动起来，<br>
          选一个顺手的模型。
        </h2>
      </div>
      <p class="section-lead">
        已接入 {{ providers.length }} 家供应商 · {{ modelCount }} 款视频模型。<br>
        支持文生视频、首尾帧过渡与图生视频，实际可用模型与规格以创作台为准。
      </p>
    </div>

    <!-- 加载与异常状态 -->
    <div v-if="loading" role="status" class="model-status-strip">
      <UIcon name="i-lucide-loader-2" class="size-4 animate-spin text-primary" />
      <span>正在打开模型工具箱……</span>
    </div>
    <div v-else-if="failed" role="alert" class="model-status-strip model-status-strip--error">
      <UIcon name="i-lucide-alert-circle" class="size-4 text-red-500" />
      <span>模型目录暂时没能打开，请检查网络后重试。</span>
      <UButton variant="soft" color="primary" size="xs" @click="$emit('retry')">
        重新加载
      </UButton>
    </div>
    <div v-else-if="!providers.length" class="model-status-strip">
      <UIcon name="i-lucide-info" class="size-4 text-muted" />
      <span>暂无公开展示的模型，你仍可直接进入创作台开始分镜构思。</span>
    </div>

    <!-- 供应商切换器 (开放式水平标尺 Tabs) -->
    <div class="provider-track-tabs" role="group" aria-label="选择视频供应商">
      <button
        v-for="provider in providers"
        :key="provider.id"
        type="button"
        class="provider-track-tab focus-ring"
        :aria-pressed="selectedProvider?.id === provider.id"
        :class="{ 'is-active': selectedProvider?.id === provider.id }"
        @click="chooseProvider(provider.id)"
      >
        <span>{{ provider.name }}</span>
        <span class="provider-track-tab__count">{{ provider.models.length }}</span>
      </button>
    </div>

    <!-- 开放式规格参数展面 (无卡片外壳，双栏工作台展陈) -->
    <div v-if="selectedProvider && selectedModel" class="model-spec-sheet">
      <div class="model-spec-sheet__primary">
        <div class="model-spec-sheet__select-wrap">
          <label class="model-spec-sheet__label">挑选一个视频模型：</label>
          <USelect v-model="selectedKey" :items="modelItems" class="w-full max-w-sm" aria-label="选择模型" />
        </div>

        <div class="model-spec-sheet__content">
          <span class="model-spec-sheet__vendor">{{ selectedProvider.vendor }}</span>
          <h3 class="model-spec-sheet__name">
            {{ cleanName(selectedModel.name) }}
          </h3>
          <p class="model-spec-sheet__desc">
            {{ selectedModel.description }}
          </p>

          <div class="model-spec-sheet__id-box">
            <span class="model-spec-sheet__id-label">模型 ID：</span>
            <code>{{ selectedModel.id }}</code>
            <button
              type="button"
              class="model-spec-sheet__copy-btn focus-ring"
              :title="copied ? '已复制到剪贴板' : '复制模型标识'"
              @click="copy(selectedModel.id)"
            >
              <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3.5" />
              <span>{{ copied ? '已复制' : '复制' }}</span>
            </button>
          </div>

          <div class="model-spec-sheet__actions">
            <UButton
              :to="`/studio/video?provider=${selectedProvider.id}&model=${selectedModel.id}`"
              trailing-icon="i-lucide-arrow-up-right"
              class="font-semibold px-6 py-2.5"
            >
              用这个模型试试看
            </UButton>
          </div>
        </div>
      </div>

      <!-- 参数规格列表 (开放式参数表) -->
      <div class="model-spec-sheet__secondary">
        <div class="model-spec-sheet__header">
          <UIcon name="i-lucide-cpu" class="size-4 text-primary" />
          <span>这个模型可以做什么</span>
        </div>

        <dl class="model-spec-sheet__grid">
          <div v-for="item in specs(selectedProvider, selectedModel)" :key="item.label" class="model-spec-row">
            <dt class="model-spec-dt">
              <UIcon :name="item.icon" class="size-4 text-primary shrink-0" />
              <span>{{ item.label }}</span>
            </dt>
            <dd class="model-spec-dd">
              {{ item.value }}
            </dd>
          </div>
        </dl>

        <p v-if="selectedModel.capabilities?.notes || selectedProvider.notes" class="model-spec-sheet__notes">
          <UIcon name="i-lucide-alert-circle" class="size-4 text-primary shrink-0 mt-0.5" />
          <span>{{ selectedModel.capabilities?.notes || selectedProvider.notes }}</span>
        </p>
      </div>
    </div>
  </section>
</template>
