<script setup lang="ts">
import type { ModelSpec, ProviderCapability } from '#shared/types/generation'
import { resolveModelCapability } from '#shared/types/generation'
import { useClipboard } from '@vueuse/core'
import AnimatedContent from '~/components/vuebits/AnimatedContent.vue'
import CountUp from '~/components/vuebits/CountUp.vue'
import SpotlightCard from '~/components/vuebits/SpotlightCard.vue'
import TextType from '~/components/vuebits/TextType.vue'

const { data: providerCatalog } = await useFetch<ProviderCapability[]>('/api/providers')

const useCases = [
  { image: '/images/usecase-anime.webp', tag: '二次元', title: '角色与场景连续生成', desc: '设定图锁定外观，生成剧情片段与战斗镜头。' },
  { image: '/images/usecase-scifi.webp', tag: '科幻短剧', title: '低成本完成高概念镜头', desc: '剧本生成太空、未来城市与外星生物画面。' },
  { image: '/images/usecase-ecommerce-v2.webp', tag: '电商素材', title: '批量测试商品卖点视频', desc: '锁定商品外观，高质产出多平台展示素材。' },
  { image: '/images/usecase-knowledge-v2.webp', tag: '知识科普', title: '把抽象概念做成动态画面', desc: '将科学与历史转化为生动镜头，配合旁白成片。' },
]

const workflow = [
  { n: '01', title: '选择生成方式', desc: '根据素材选择文生、首尾帧或多模态参考，系统依供应商能力自动收敛选项。' },
  { n: '02', title: '设置输出参数', desc: '自由调整模型、清晰度、画幅、时长与音频，参数范围完全由能力声明驱动。' },
  { n: '03', title: '提交并追踪任务', desc: '异步提交并实时轮询；生成成功后自动归档到 OSS 长期保存，不受临时链接影响。' },
]

const faqItems = [
  {
    label: '平台接入了哪些模型供应商？',
    content: '目前阿里云百炼、MiniMax 海螺、可灵 Kling、字节跳动 Seedance、RollDek 与 Runway Dev 的适配器与能力声明已全部就绪。配置对应环境变量后即自动上线，前端选项、校验与参数映射无需修改代码。',
  },
  {
    label: '为什么每家平台只列了少数几个模型？',
    content: '矩阵统计的是本平台已完成适配、校验和参数映射的 API model ID，不是厂商的完整产品线。百炼官方视频目录包含 HappyHorse、万相、人像驱动、PixVerse、可灵和 Vidu 六类；forkvdo 当前映射 HappyHorse、万相、可灵，并额外接入百炼模型市场的 MiniMax H3。',
  },
  {
    label: '不同平台的能力差异怎么处理？',
    content: '每家供应商都有一份结构化能力声明（模型、生成模式、素材类型、清晰度、画幅、时长、音频等）。创作台据此渲染表单，后端据此做最终校验，杜绝把不支持的参数发给上游 API。',
  },
  {
    label: '首尾帧模式和参考模式可以混用吗？',
    content: '不可以在同一任务中混用。首尾帧严格定义视频的第一帧与最后一帧；多模态参考模式下，参考图、参考视频与参考音频可以自由组合驱动画面。',
  },
  {
    label: '生成结果会过期吗？',
    content: '供应商返回的临时链接通常有时效。OSS 配置完整时，任务成功后服务端会立即下载结果并归档到 OSS，作品库保存长期地址；归档失败时会保留当前可用地址并允许手动重试。',
  },
  {
    label: '如何接入一家新的第三方平台？',
    content: '实现一个 VideoProvider 适配器（submit + getTask 两个方法），补一份能力声明，在工厂函数中注册即可——页面、校验、轮询与作品库全部复用现有链路。',
  },
]

const supportedModelCount = computed(() =>
  providerCatalog.value?.reduce((sum, item) => sum + item.models.length, 0) || 0)

const providerCount = computed(() => providerCatalog.value?.length || 0)

const selectedProviderId = ref('dashscope')
const selectedModelId = ref('')

const selectedProvider = computed(() =>
  providerCatalog.value?.find(item => item.id === selectedProviderId.value) || providerCatalog.value?.[0])

const selectedModel = computed(() =>
  selectedProvider.value?.models.find(model => model.id === selectedModelId.value) || selectedProvider.value?.models[0])

const supportedModelItems = computed(() => (providerCatalog.value || []).flatMap(provider =>
  provider.models.map(model => ({
    label: `${formatCatalogModelName(model.name)} · ${provider.name}`,
    value: `${provider.id}:${model.id}`,
    providerId: provider.id,
    modelId: model.id,
  }))))

const selectedModelKey = computed({
  get: () => supportedModelItems.value.find(item =>
    item.providerId === selectedProvider.value?.id && item.modelId === selectedModel.value?.id)?.value || '',
  set: (value: string) => {
    const item = supportedModelItems.value.find(option => option.value === value)
    if (!item)
      return
    selectedProviderId.value = item.providerId
    selectedModelId.value = item.modelId
  },
})

function selectProvider(providerId: string) {
  selectedProviderId.value = providerId
  const provider = providerCatalog.value?.find(p => p.id === providerId)
  if (provider && provider.models.length > 0) {
    selectedModelId.value = provider.models[0]?.id || ''
  }
}

watch(selectedProvider, (provider) => {
  if (provider && !provider.models.some(model => model.id === selectedModelId.value))
    selectedModelId.value = provider.models[0]?.id || ''
}, { immediate: true })

const { copy, copied } = useClipboard({ copiedDuring: 1800 })

function formatCatalogModelName(name: string) {
  return name.replace(/（百炼）$/, '')
}

function formatModelDuration(provider: ProviderCapability, model: ModelSpec) {
  const capability = resolveModelCapability(provider, model.id)
  const durationByResolution = model.capabilities?.durationByResolution

  if (durationByResolution) {
    return capability.resolutions
      .filter(resolution => durationByResolution[resolution]?.length)
      .map(resolution => `${resolution} ${durationByResolution[resolution]?.join('/')} 秒`)
      .join(' · ')
  }

  const { min, max, smart, steps } = capability.duration
  if (steps?.length) {
    const values = steps.map(value => `${value} 秒`).join(' / ')
    return smart ? `${values} / 智能` : values
  }

  const base = min === max ? `${min} 秒` : `${min}–${max} 秒`
  return smart ? `${base} / 智能` : base
}

function formatModelRatios(provider: ProviderCapability, model: ModelSpec) {
  const capability = resolveModelCapability(provider, model.id)
  if (!capability.ratios.length)
    return '跟随素材'

  return capability.ratios
    .map(ratio => ratio === 'adaptive' ? '自适应' : ratio)
    .join(' / ')
}

function formatModelModes(provider: ProviderCapability, model: ModelSpec) {
  const capability = resolveModelCapability(provider, model.id)
  return [
    capability.modes.includes('text') ? '文生' : '',
    capability.modes.includes('frames')
      ? (capability.media.includes('last_frame') ? '首尾帧' : '首帧')
      : '',
    capability.modes.includes('reference') ? '参考生' : '',
  ].filter(Boolean).join(' · ')
}

function formatModelResolutions(provider: ProviderCapability, model: ModelSpec) {
  return resolveModelCapability(provider, model.id).resolutions.join(' / ')
}

function formatModelAudio(provider: ProviderCapability, model: ModelSpec) {
  if (!resolveModelCapability(provider, model.id).supportsAudio)
    return '无声'
  if (model.id.includes('kling-v3-turbo'))
    return '固定有声'
  if (model.id === 'MiniMax/MiniMax-H3')
    return '固定立体声'
  if (model.id.startsWith('wan2.7-'))
    return '原生有声'
  return '可生成音频'
}

function formatModelMedia(provider: ProviderCapability, model: ModelSpec) {
  const capability = resolveModelCapability(provider, model.id)
  const names: string[] = []
  if (capability.media.includes('first_frame'))
    names.push('首帧')
  if (capability.media.includes('last_frame'))
    names.push('尾帧')
  if (capability.media.includes('reference_image'))
    names.push('参考图')
  if (capability.media.includes('reference_video'))
    names.push('参考视频')
  if (capability.media.includes('reference_audio'))
    names.push('参考音频')
  return names.length > 0 ? names.join(' · ') : '纯文本'
}

const selectedModelSpecs = computed(() => {
  if (!selectedProvider.value || !selectedModel.value)
    return []

  return [
    {
      kind: 'modes',
      label: '生成方式',
      icon: 'i-lucide-wand-sparkles',
      value: formatModelModes(selectedProvider.value, selectedModel.value),
    },
    {
      kind: 'resolution',
      label: '清晰度',
      icon: 'i-lucide-scan',
      value: formatModelResolutions(selectedProvider.value, selectedModel.value),
    },
    {
      kind: 'duration',
      label: '输出时长',
      icon: 'i-lucide-timer',
      value: formatModelDuration(selectedProvider.value, selectedModel.value),
    },
    {
      kind: 'ratio',
      label: '画幅比例',
      icon: 'i-lucide-frame',
      value: formatModelRatios(selectedProvider.value, selectedModel.value),
    },
    {
      kind: 'audio',
      label: '音频模式',
      icon: 'i-lucide-audio-lines',
      value: formatModelAudio(selectedProvider.value, selectedModel.value),
    },
    {
      kind: 'media',
      label: '输入素材',
      icon: 'i-lucide-folder-input',
      value: formatModelMedia(selectedProvider.value, selectedModel.value),
    },
  ]
})
</script>

<template>
  <div class="home-page bg-default">
    <!-- ============================ HERO ============================ -->
    <section class="home-hero">
      <div class="home-hero__glow" aria-hidden="true" />
      <div class="relative mx-auto max-w-[1200px] px-5 pt-32 md:px-8 md:pt-40">
        <AnimatedContent :distance="24" :duration="0.7" class-name="mx-auto max-w-4xl text-center">
          <NuxtLink to="#capabilities" class="home-announcement focus-ring">
            <span class="home-announcement__dot" />
            <span>{{ supportedModelCount }} 个视频模型已接入 · {{ providerCount }} 家主流平台</span>
            <span class="i-lucide-arrow-up-right" aria-hidden="true" />
          </NuxtLink>

          <h1 class="home-hero__title mt-6">
            <span class="home-hero__title-line">
              <TextType text="把想象，" :show-cursor="false" :initial-delay="120" />
            </span>
            <span class="home-hero__title-line home-hero__title-accent">
              <TextType text="直接变成镜头。" :initial-delay="480" />
            </span>
          </h1>

          <p class="home-hero__lead mx-auto mt-5 max-w-2xl">
            从一句文字描述到完整画面，也可以带上图片、视频与声音。forkvdo 将不同模型放进同一个清晰、可靠的创作流程。
          </p>

          <div class="mt-7 flex flex-wrap justify-center gap-3">
            <UButton to="/studio" size="xl" color="primary" trailing-icon="i-lucide-arrow-up-right" class="home-primary-action px-7">
              开始创作
            </UButton>
            <UButton to="/projects" size="xl" color="neutral" variant="outline" class="home-secondary-action px-7">
              查看作品
            </UButton>
          </div>
        </AnimatedContent>

        <!-- 纵深感专业电影监看台 Stage -->
        <AnimatedContent :distance="28" :duration="0.8" :delay="0.1" class-name="home-stage mt-10 md:mt-14">
          <div class="home-stage__ambient-glow" aria-hidden="true" />
          <div class="home-stage__chrome">
            <div class="home-stage__dots" aria-hidden="true">
              <span class="dot-red" /><span class="dot-yellow" /><span class="dot-green" />
            </div>
            <div class="home-stage__brand">
              <span class="i-lucide-sparkles text-signal-500" />
              <span>FORKVDO STUDIO CONSOLE</span>
              <span class="home-stage__model-badge">WAN 3.0 PRIME · 1080P · 24FPS</span>
            </div>
            <div class="home-stage__status">
              <span class="home-stage__status-pulse" />
              <span>渲染管线就绪 · 延迟 24ms</span>
            </div>
          </div>

          <div class="home-stage__body">
            <!-- 左侧：导演级提示词与控制面板 -->
            <div class="home-stage__prompt-card">
              <div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="type-kicker">DIRECTOR CONSOLE</span>
                    <span class="home-stage__tag">CINEMATIC</span>
                  </div>
                  <span class="type-mono text-dimmed text-xs">DASHSCOPE VENDOR</span>
                </div>

                <!-- 语法高亮提示词输入盒 -->
                <div class="home-stage__prompt-box mt-3.5">
                  <p class="home-stage__prompt-text">
                    <span class="text-signal-500 font-600">[主体]</span> 暴雨后的辽阔荒原，一扇悬浮的光门缓缓开启。
                    <span class="text-sky-400 font-600">[运镜]</span> 低机位水平平滑推进，焦点汇聚门内光芒。
                    <span class="text-amber-400 font-600">[声画]</span> 远方雷声与低频风暴呼啸，光门透出暖金漫反射。
                  </p>
                </div>

                <!-- 导演控制滑块指示器 -->
                <div class="home-stage__meters mt-4">
                  <div class="home-stage__meter-item">
                    <div class="flex justify-between text-xs text-dimmed mb-1">
                      <span>运镜幅度 (Motion Rate)</span>
                      <span class="type-mono text-highlighted font-600">85%</span>
                    </div>
                    <div class="home-stage__meter-track">
                      <div class="home-stage__meter-bar" style="width: 85%" />
                    </div>
                  </div>
                  <div class="home-stage__meter-item">
                    <div class="flex justify-between text-xs text-dimmed mb-1">
                      <span>提示词关联 (CFG Scale)</span>
                      <span class="type-mono text-highlighted font-600">7.5</span>
                    </div>
                    <div class="home-stage__meter-track">
                      <div class="home-stage__meter-bar home-stage__meter-bar--accent" style="width: 75%" />
                    </div>
                  </div>
                </div>

                <!-- 素材锁定槽位 -->
                <div class="home-stage__media-slot mt-3.5">
                  <div class="flex items-center gap-2">
                    <span class="i-lucide-image text-signal-500 text-sm" />
                    <span class="text-xs text-toned font-500">首帧素材：desert_gate_start.png</span>
                  </div>
                  <span class="type-mono text-[10px] text-dimmed bg-elevated px-1.5 py-0.5 rounded border border-muted">1920×1080</span>
                </div>
              </div>

              <div class="mt-5 pt-3.5 border-t border-muted/80 flex items-center justify-between">
                <div class="flex items-center gap-2 text-xs text-dimmed">
                  <span class="i-lucide-check-circle-2 text-green-500 text-sm" />
                  <span>自动匹配 1080P / 8s 原生有声</span>
                </div>
                <UButton to="/studio" size="sm" color="primary" trailing-icon="i-lucide-arrow-up-right">
                  在创作台中打开
                </UButton>
              </div>
            </div>

            <!-- 右侧：真实 16:9 监视器画幅与 HUD -->
            <div class="home-stage__preview">
              <img src="/images/hero-cinematic.png" alt="AI 生成的电影感荒原光门画面" class="home-stage__preview-img">
              <div class="home-stage__preview-shade" aria-hidden="true" />

              <!-- 顶部摄像机 HUD -->
              <div class="home-stage__hud-top">
                <div class="flex items-center gap-2">
                  <span class="home-stage__rec-dot" />
                  <span class="type-mono text-xs text-white font-600">REC · 00:08:00</span>
                  <span class="home-stage__hud-pill">PRORES 422</span>
                </div>
                <div class="type-mono text-[11px] text-white/80 flex items-center gap-2">
                  <span>4K DCI</span>
                  <span>24.00 FPS</span>
                  <span>ISO 800</span>
                </div>
              </div>

              <!-- 监视器辅助准星 -->
              <div class="home-stage__hud-center" aria-hidden="true">
                <span class="home-stage__crosshair" />
              </div>

              <!-- 底部播放进度与音频电平 -->
              <div class="home-stage__hud-bottom">
                <div class="flex items-center justify-between text-xs text-white mb-2">
                  <div class="flex items-center gap-2">
                    <span class="i-lucide-play-circle text-base text-signal-500" />
                    <span class="type-mono font-600">WAN 3.0 CINEMA RENDER</span>
                  </div>
                  <!-- 动态音频波形模拟 -->
                  <div class="home-stage__audio-bars" aria-label="音频通道正常">
                    <span style="animation-delay: 0.1s" />
                    <span style="animation-delay: 0.3s" />
                    <span style="animation-delay: 0.2s" />
                    <span style="animation-delay: 0.4s" />
                    <span style="animation-delay: 0.15s" />
                  </div>
                </div>

                <div class="home-stage__preview-progress">
                  <span />
                </div>

                <div class="flex justify-between text-[10px] text-white/70 type-mono mt-1.5">
                  <span>00:00:00</span>
                  <span>00:04:00</span>
                  <span>00:08:00 (MASTER)</span>
                </div>
              </div>
            </div>
          </div>
        </AnimatedContent>

        <!-- 整合型平台数据胶囊条 -->
        <div class="home-metrics-ribbon" aria-label="平台核心能力概览">
          <div class="home-metric-cell">
            <strong><CountUp :to="supportedModelCount" :duration="1.2" /></strong>
            <span>款已适配视频模型</span>
          </div>
          <div class="home-metric-cell">
            <strong><CountUp :to="providerCount" :duration="1" /></strong>
            <span>大主流供应商</span>
          </div>
          <div class="home-metric-cell">
            <strong>4K</strong>
            <span>最高清晰度支持</span>
          </div>
          <div class="home-metric-cell">
            <strong>30s</strong>
            <span>智能及分段时长</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================ 模型目录 ============================ -->
    <section id="capabilities" class="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
      <AnimatedContent :distance="24" :duration="0.65">
        <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p class="type-kicker">
              MODEL CATALOG
            </p>
            <h2 class="type-section-title mt-2">
              全生态视频模型矩阵，统一契约调度
            </h2>
            <p class="type-lead mt-2 max-w-2xl">
              深度适配 {{ providerCount }} 家顶级供应商、{{ supportedModelCount }} 款主流视频模型，参数与生成能力无缝对齐。
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="type-caption hidden sm:inline-block">切换快捷预览</span>
            <USelect
              id="catalog-model"
              v-model="selectedModelKey"
              :items="supportedModelItems"
              size="md"
              class="w-full sm:w-64"
              aria-label="选择项目支持的模型"
            />
          </div>
        </div>

        <!-- 供应商分类药丸切换 -->
        <div class="mt-8 flex flex-wrap items-center gap-2">
          <button
            v-for="provider in providerCatalog"
            :key="provider.id"
            type="button"
            class="provider-pill focus-ring"
            :class="{ 'is-active': selectedProviderId === provider.id }"
            @click="selectProvider(provider.id)"
          >
            <span>{{ provider.name }}</span>
            <span class="provider-pill__count">{{ provider.models.length }}</span>
          </button>
        </div>
      </AnimatedContent>

      <AnimatedContent :distance="20" :duration="0.7" :delay="0.05">
        <Transition name="model-swap" mode="out-in">
          <div
            v-if="selectedProvider && selectedModel"
            :key="selectedModelKey"
            class="model-inspector mt-6"
            aria-live="polite"
          >
            <!-- 统一整合型规格看板 -->
            <div class="model-inspector__card">
              <!-- 左侧：模型核心身份与操作 -->
              <div class="model-inspector__identity">
                <div class="flex items-center justify-between">
                  <span class="model-inspector__eyebrow">
                    {{ selectedProvider.name }} · {{ selectedProvider.vendor }}
                  </span>
                  <span class="i-lucide-aperture text-xl text-signal-500" aria-hidden="true" />
                </div>

                <div class="mt-4">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-2xl text-highlighted font-650 tracking-tight">
                      {{ formatCatalogModelName(selectedModel.name) }}
                    </h3>
                    <UBadge v-if="selectedModel.badge" color="primary" variant="subtle" size="sm">
                      {{ selectedModel.badge }}
                    </UBadge>
                  </div>
                  <p class="type-caption mt-2 leading-relaxed">
                    {{ selectedModel.description }}
                  </p>
                </div>

                <div class="model-id-bar mt-4">
                  <code class="model-id-bar__code">{{ selectedModel.id }}</code>
                  <button
                    type="button"
                    class="model-id-bar__copy focus-ring"
                    :title="copied ? '已复制' : '复制模型 ID'"
                    @click="copy(selectedModel.id)"
                  >
                    <span :class="copied ? 'i-lucide-check text-green-500' : 'i-lucide-copy'" />
                    <span>{{ copied ? '已复制' : '复制' }}</span>
                  </button>
                </div>

                <div
                  v-if="selectedModel.capabilities?.notes || selectedProvider.notes"
                  class="model-notes-box mt-3.5"
                >
                  <div class="flex items-center gap-1.5 text-xs text-signal-500 font-600 mb-1">
                    <span class="i-lucide-info text-xs" />
                    <span>模型特性与调度规则</span>
                  </div>
                  <p class="text-xs text-muted leading-relaxed">
                    {{ selectedModel.capabilities?.notes || selectedProvider.notes }}
                  </p>
                </div>

                <div class="mt-5 pt-4 border-t border-muted/80 flex flex-wrap gap-2">
                  <UButton
                    :to="`/studio?provider=${selectedProvider.id}&model=${selectedModel.id}`"
                    color="primary"
                    size="md"
                    trailing-icon="i-lucide-arrow-up-right"
                    class="w-full sm:w-auto"
                  >
                    去创作台使用
                  </UButton>
                  <UButton
                    to="/studio"
                    color="neutral"
                    variant="outline"
                    size="md"
                    class="w-full sm:w-auto"
                  >
                    查看全部参数
                  </UButton>
                </div>
              </div>

              <!-- 右侧：规格指标网格 -->
              <div class="model-inspector__specs">
                <div
                  v-for="spec in selectedModelSpecs"
                  :key="spec.kind"
                  class="model-spec-item"
                >
                  <div class="flex items-center justify-between text-dimmed">
                    <span class="model-spec-item__label">{{ spec.label }}</span>
                    <span :class="spec.icon" class="text-base text-signal-500/80" aria-hidden="true" />
                  </div>
                  <p class="model-spec-item__value mt-2">
                    {{ spec.value }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </AnimatedContent>
    </section>

    <!-- ============================ 生成方式 ============================ -->
    <section class="border-y border-default/60 bg-elevated/40">
      <div class="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
        <AnimatedContent :distance="24" :duration="0.65">
          <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p class="type-kicker">
                INPUT MODES
              </p>
              <h2 class="type-section-title mt-2">
                一套任务结构，覆盖三大主流生成模式
              </h2>
            </div>
            <p class="type-body max-w-md">
              根据素材结构选择文生、首尾帧或多模态模式。平台依供应商能力声明自动收敛可用参数。
            </p>
          </div>
        </AnimatedContent>

        <div class="mt-8 grid gap-5 md:grid-cols-3">
          <!-- 1. 文生视频 -->
          <AnimatedContent :distance="20" :duration="0.55" :delay="0.04">
            <SpotlightCard
              class-name="h-full border-default bg-elevated transition duration-300 hover:-translate-y-1 hover:shadow-lift flex flex-col justify-between"
              spotlight-color="rgba(255, 77, 53, 0.08)"
            >
              <div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <span class="i-lucide-type text-2xl text-signal-500" />
                    <h3 class="type-card-title">
                      文生视频
                    </h3>
                  </div>
                  <span class="type-mono text-[11px] text-dimmed px-2 py-0.5 rounded bg-muted/70">TEXT ➔ VIDEO</span>
                </div>
                <p class="type-caption mt-2.5 leading-relaxed">
                  仅需文本描述即可自动解析场景、构图、光影与相机运动，自主推演物理运动规律。
                </p>

                <!-- 视觉模拟画布：提示词 ➔ 帧序列推演 -->
                <div class="mode-canvas mode-canvas--text mt-4">
                  <div class="mode-canvas__prompt-bar">
                    <span class="i-lucide-sparkles text-xs text-signal-500" />
                    <span class="mode-canvas__prompt-snippet">赛博雨夜街道，霓虹倒影随微风在积水倒映...</span>
                    <span class="mode-canvas__cursor" />
                  </div>
                  <div class="mode-canvas__filmstrip mt-3">
                    <div class="mode-filmstrip__frame">
                      <span class="mode-filmstrip__label">F01 场景初成</span>
                    </div>
                    <span class="mode-filmstrip__arrow">➔</span>
                    <div class="mode-filmstrip__frame">
                      <span class="mode-filmstrip__label">F15 镜头推进</span>
                    </div>
                    <span class="mode-filmstrip__arrow">➔</span>
                    <div class="mode-filmstrip__frame">
                      <span class="mode-filmstrip__label">F30 景深展开</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="mt-5 pt-3 border-t border-muted flex flex-wrap items-center justify-between text-xs text-dimmed">
                <span class="flex items-center gap-1.5"><i class="i-lucide-languages text-xs text-signal-500" /> 多语言提示词</span>
                <span class="flex items-center gap-1.5"><i class="i-lucide-video text-xs text-signal-500" /> 镜头运镜驱动</span>
                <span class="flex items-center gap-1.5"><i class="i-lucide-sparkles text-xs text-signal-500" /> 智能扩写</span>
              </div>
            </SpotlightCard>
          </AnimatedContent>

          <!-- 2. 首尾帧运镜 -->
          <AnimatedContent :distance="20" :duration="0.55" :delay="0.08">
            <SpotlightCard
              class-name="h-full border-default bg-elevated transition duration-300 hover:-translate-y-1 hover:shadow-lift flex flex-col justify-between"
              spotlight-color="rgba(255, 77, 53, 0.08)"
            >
              <div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <span class="i-lucide-panels-top-left text-2xl text-signal-500" />
                    <h3 class="type-card-title">
                      首尾帧运镜
                    </h3>
                  </div>
                  <span class="type-mono text-[11px] text-dimmed px-2 py-0.5 rounded bg-muted/70">KEYFRAMES</span>
                </div>
                <p class="type-caption mt-2.5 leading-relaxed">
                  首帧定义镜头起点，尾帧严格锚定终局，算法自动计算最佳运动轨迹并平滑过渡。
                </p>

                <!-- 视觉模拟画布：双关键帧与补间轨迹 -->
                <div class="mode-canvas mode-canvas--frames mt-4">
                  <div class="mode-canvas__keyframe-track">
                    <div class="mode-keyframe-box">
                      <span class="mode-keyframe-tag">首帧</span>
                      <span class="mode-keyframe-sub">00:00 起点</span>
                    </div>
                    <div class="mode-keyframe-connector">
                      <span class="mode-keyframe-curve" />
                      <span class="mode-keyframe-diamond" />
                      <span class="mode-keyframe-label">智能运动补间</span>
                    </div>
                    <div class="mode-keyframe-box mode-keyframe-box--end">
                      <span class="mode-keyframe-tag">尾帧</span>
                      <span class="mode-keyframe-sub">00:08 终局</span>
                    </div>
                  </div>
                  <div class="mode-canvas__status-line mt-2.5">
                    <span class="i-lucide-lock text-xs text-green-500" />
                    <span>首尾画幅、透视与人物特征严格守序</span>
                  </div>
                </div>
              </div>

              <div class="mt-5 pt-3 border-t border-muted flex flex-wrap items-center justify-between text-xs text-dimmed">
                <span class="flex items-center gap-1.5"><i class="i-lucide-target text-xs text-signal-500" /> 关键帧约束</span>
                <span class="flex items-center gap-1.5"><i class="i-lucide-spline text-xs text-signal-500" /> 平滑转场插值</span>
                <span class="flex items-center gap-1.5"><i class="i-lucide-shield-check text-xs text-signal-500" /> 杜绝形变</span>
              </div>
            </SpotlightCard>
          </AnimatedContent>

          <!-- 3. 多模态参考 -->
          <AnimatedContent :distance="20" :duration="0.55" :delay="0.12">
            <SpotlightCard
              class-name="h-full border-default bg-elevated transition duration-300 hover:-translate-y-1 hover:shadow-lift flex flex-col justify-between"
              spotlight-color="rgba(255, 77, 53, 0.08)"
            >
              <div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <span class="i-lucide-layers-3 text-2xl text-signal-500" />
                    <h3 class="type-card-title">
                      多模态参考
                    </h3>
                  </div>
                  <span class="type-mono text-[11px] text-dimmed px-2 py-0.5 rounded bg-muted/70">MULTIMODAL</span>
                </div>
                <p class="type-caption mt-2.5 leading-relaxed">
                  支持参考图、参考视频与参考音频自由组合输入，驱动主体与声画同步。
                </p>

                <!-- 视觉模拟画布：多素材流汇聚成片 -->
                <div class="mode-canvas mode-canvas--reference mt-4">
                  <div class="mode-canvas__multimodal-grid">
                    <div class="mode-stream-pill">
                      <i class="i-lucide-image text-xs text-signal-500" />
                      <span>参考图 (角色锁脸)</span>
                    </div>
                    <div class="mode-stream-pill">
                      <i class="i-lucide-video text-xs text-sky-400" />
                      <span>参考视频 (运镜复刻)</span>
                    </div>
                    <div class="mode-stream-pill">
                      <i class="i-lucide-audio-lines text-xs text-amber-400" />
                      <span>参考音频 (节拍对齐)</span>
                    </div>
                  </div>
                  <div class="mode-canvas__converge-bar mt-2.5">
                    <span class="i-lucide-arrow-down text-xs text-dimmed" />
                    <span>融合为具备独立原声的 4K 电影成片</span>
                  </div>
                </div>
              </div>

              <div class="mt-5 pt-3 border-t border-muted flex flex-wrap items-center justify-between text-xs text-dimmed">
                <span class="flex items-center gap-1.5"><i class="i-lucide-user-check text-xs text-signal-500" /> 角色特征锁定</span>
                <span class="flex items-center gap-1.5"><i class="i-lucide-clapperboard text-xs text-signal-500" /> 风格迁移</span>
                <span class="flex items-center gap-1.5"><i class="i-lucide-music text-xs text-signal-500" /> 音画协同</span>
              </div>
            </SpotlightCard>
          </AnimatedContent>
        </div>
      </div>
    </section>

    <!-- ============================ 内容案例 ============================ -->
    <section class="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
      <AnimatedContent :distance="24" :duration="0.65">
        <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p class="type-kicker">
              CONTENT SHOWCASE
            </p>
            <h2 class="type-section-title mt-2">
              丰富的影视级生成场景
            </h2>
          </div>
          <UButton to="/studio" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-right" class="w-fit">
            打开创作台体验
          </UButton>
        </div>
      </AnimatedContent>

      <!-- 紧凑精致 4 列画廊展台 -->
      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AnimatedContent
          v-for="(item, index) in useCases"
          :key="item.title"
          :delay="index * 0.05"
          :distance="20"
        >
          <div class="showcase-card group">
            <div class="showcase-card__media">
              <img :src="item.image" :alt="item.title" class="showcase-card__img">
              <div class="showcase-card__overlay" aria-hidden="true" />
              <div class="showcase-card__tag">
                <UBadge color="neutral" variant="subtle" size="sm" class="backdrop-blur-md bg-black/40 text-white border-white/10">
                  {{ item.tag }}
                </UBadge>
              </div>
            </div>
            <div class="p-4">
              <h3 class="text-base font-600 text-highlighted tracking-tight line-clamp-1">
                {{ item.title }}
              </h3>
              <p class="type-caption mt-1.5 line-clamp-2 leading-relaxed">
                {{ item.desc }}
              </p>
            </div>
          </div>
        </AnimatedContent>
      </div>
    </section>

    <!-- ============================ 工作流 ============================ -->
    <section id="workflow" class="border-y border-default/60 bg-elevated/40">
      <div class="mx-auto grid max-w-[1200px] gap-10 px-5 py-16 md:px-8 md:py-20 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
        <AnimatedContent :distance="22">
          <p class="type-kicker">
            WORKFLOW
          </p>
          <h2 class="type-section-title mt-2">
            三个步骤完成一次生成
          </h2>
          <p class="type-body mt-4 max-w-md">
            任务异步提交，页面关闭不中断。结果实时轮询并自动归档到作品库，随时随地回溯与复用。
          </p>
          <UButton to="/studio" color="primary" trailing-icon="i-lucide-arrow-up-right" class="mt-6">
            直接开始创作
          </UButton>
        </AnimatedContent>

        <div class="workflow-grid">
          <AnimatedContent
            v-for="(item, index) in workflow"
            :key="item.n"
            :delay="index * 0.05"
            :distance="18"
          >
            <div class="workflow-step">
              <span class="workflow-step__num">{{ item.n }}</span>
              <div>
                <h3 class="text-base text-highlighted font-600">
                  {{ item.title }}
                </h3>
                <p class="type-caption mt-1.5 leading-relaxed">
                  {{ item.desc }}
                </p>
              </div>
            </div>
          </AnimatedContent>
        </div>
      </div>
    </section>

    <!-- ============================ FAQ ============================ -->
    <section class="mx-auto max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
      <AnimatedContent :distance="24" :duration="0.65">
        <div class="grid gap-10 lg:grid-cols-[.6fr_1.4fr]">
          <div>
            <p class="type-kicker">
              FAQ
            </p>
            <h2 class="type-section-title mt-2">
              常见问题
            </h2>
            <p class="type-body mt-4 max-w-sm">
              关于多平台接入、能力差异与任务生命周期的说明。
            </p>
          </div>
          <UAccordion
            :items="faqItems"
            default-value="0"
            trailing-icon="i-lucide-plus"
            :ui="{
              root: 'border-y border-default',
              item: 'border-b border-default last:border-b-0',
              trigger: 'rounded-none py-5 text-base hover:text-signal-500 focus-visible:outline-offset-[-2px]',
              label: 'text-start font-600 tracking-[-0.015em]',
              leadingIcon: 'size-4',
              trailingIcon: 'size-5 text-dimmed group-hover:text-signal-500 group-data-[state=open]:rotate-45',
              body: 'pb-5 pl-12 pr-8 text-sm leading-7 text-muted md:pr-14',
            }"
          >
            <template #leading="{ index, open }">
              <span class="type-mono w-8 shrink-0" :class="open ? 'text-signal-500' : 'text-dimmed'">
                {{ String(index + 1).padStart(2, '0') }}
              </span>
            </template>
          </UAccordion>
        </div>
      </AnimatedContent>
    </section>

    <!-- ============================ CTA ============================ -->
    <section class="mx-auto max-w-[1200px] px-5 pb-16 md:px-8 md:pb-20">
      <AnimatedContent :distance="24">
        <div class="film-grain relative overflow-hidden rounded-2xl bg-zinc-950 px-7 py-12 text-white md:px-12 md:py-16">
          <div class="surface-rule absolute inset-0 opacity-30" aria-hidden="true" />
          <div class="relative flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div>
              <p class="type-kicker text-white/40">
                GET STARTED
              </p>
              <h2 class="type-section-title mt-2 max-w-2xl text-white">
                准备好素材，即刻开始生成
              </h2>
              <p class="type-body mt-3 max-w-xl text-white/60">
                在服务端配置任一平台的 API Key，创作台即刻可用。参数消耗按所选供应商的计费规则结算。
              </p>
            </div>
            <UButton to="/studio" size="xl" color="neutral" trailing-icon="i-lucide-arrow-up-right" class="w-fit shrink-0 bg-white px-7 text-zinc-950 hover:bg-white/90">
              新建生成任务
            </UButton>
          </div>
        </div>
      </AnimatedContent>
    </section>

    <footer class="border-t border-default/70 bg-elevated/60">
      <div class="mx-auto flex max-w-[1200px] flex-col gap-4 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-8">
        <BrandLogo />
        <span class="type-caption">AI 视频生成平台 · 多供应商架构</span>
        <span class="type-caption">© {{ new Date().getFullYear() }} forkvdo</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.home-page {
  overflow: hidden;
}

.home-hero {
  position: relative;
  overflow: hidden;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-elevated) 96%, transparent) 0%, var(--ui-bg) 75%);
}

.home-hero__glow {
  position: absolute;
  top: -16rem;
  left: 50%;
  width: min(84rem, 100vw);
  height: 40rem;
  border-radius: 50%;
  background:
    radial-gradient(circle at 40% 50%, rgb(255 77 53 / 16%), transparent 42%),
    radial-gradient(circle at 62% 44%, rgb(189 205 255 / 24%), transparent 44%);
  filter: blur(32px);
  pointer-events: none;
  transform: translateX(-50%);
}

.home-announcement {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--ui-border) 80%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-elevated) 86%, transparent);
  box-shadow: 0 4px 20px -12px rgb(15 18 24 / 28%);
  color: var(--ui-text-muted);
  font-size: 0.8125rem;
  font-weight: 500;
  backdrop-filter: blur(14px);
  transition:
    border-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

.home-announcement:hover {
  border-color: color-mix(in srgb, var(--color-signal-500) 40%, var(--ui-border));
  color: var(--ui-text-highlighted);
  transform: translateY(-1px);
}

.home-announcement__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 3px rgb(34 197 94 / 15%);
}

.home-hero__title {
  color: var(--ui-text-highlighted);
  font-size: clamp(2.75rem, 6.2vw, 5.25rem);
  font-weight: 650;
  line-height: 1.1;
  letter-spacing: -0.04em;
}

.home-hero__title-line {
  display: block;
  min-height: 1.1em;
  white-space: nowrap;
}

.home-hero__title-accent {
  color: color-mix(in srgb, var(--ui-text-highlighted) 78%, var(--color-signal-500));
}

.home-hero__lead {
  color: var(--ui-text-muted);
  font-size: clamp(1rem, 1.45vw, 1.1875rem);
  line-height: 1.75;
}

.home-primary-action,
.home-secondary-action {
  min-height: 2.85rem;
  border-radius: 0.85rem !important;
}

.home-primary-action {
  background: var(--ui-text-highlighted) !important;
  color: var(--ui-bg-elevated) !important;
  box-shadow: 0 10px 24px -14px color-mix(in srgb, var(--ui-text-highlighted) 50%, transparent);
}

.home-secondary-action {
  background: color-mix(in srgb, var(--ui-bg-elevated) 82%, transparent);
  backdrop-filter: blur(12px);
}

/* ==========================================================================
   纵深感 Studio Console 舞台
   ========================================================================== */
.home-stage {
  position: relative;
  width: 100%;
  margin-inline: auto;
  border: 1px solid color-mix(in srgb, var(--ui-border) 86%, transparent);
  border-radius: 1.4rem;
  background: var(--ui-bg-elevated);
  box-shadow:
    0 1px 3px rgb(15 18 24 / 4%),
    0 28px 76px -24px rgb(15 18 24 / 30%);
}

.home-stage__ambient-glow {
  position: absolute;
  inset: -1.5rem -1rem;
  border-radius: 2rem;
  background: radial-gradient(circle at 65% 50%, rgb(255 77 53 / 10%), transparent 60%);
  filter: blur(36px);
  z-index: -1;
  pointer-events: none;
}

.home-stage__chrome {
  display: grid;
  height: 3rem;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  padding-inline: 1.15rem;
  border-bottom: 1px solid var(--ui-border-muted);
  background: color-mix(in srgb, var(--ui-bg-elevated) 92%, var(--ui-bg-muted));
  color: var(--ui-text-dimmed);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.home-stage__dots {
  display: flex;
  gap: 0.4rem;
}

.home-stage__dots span {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.dot-red {
  background: #ff5f56;
}

.dot-yellow {
  background: #ffbd2e;
}

.dot-green {
  background: #27c93f;
}

.home-stage__brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
}

.home-stage__model-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-signal-500) 12%, transparent);
  color: var(--color-signal-500);
  font-size: 0.625rem;
  font-weight: 650;
}

.home-stage__status {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--ui-text-muted);
  font-size: 0.6875rem;
}

.home-stage__status-pulse {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 3px rgb(34 197 94 / 22%);
}

.home-stage__body {
  display: grid;
  grid-template-columns: minmax(21rem, 1fr) minmax(0, 1.35fr);
  gap: 1rem;
  padding: 1rem;
  background: var(--ui-bg-muted);
  border-radius: 0 0 1.4rem 1.4rem;
}

.home-stage__prompt-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.5rem;
  border: 1px solid var(--ui-border);
  border-radius: 1.05rem;
  background: var(--ui-bg-elevated);
}

.home-stage__tag {
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 0.35rem;
  background: color-mix(in srgb, var(--ui-text-highlighted) 8%, transparent);
  color: var(--ui-text-highlighted);
}

.home-stage__prompt-box {
  padding: 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  background: var(--ui-bg);
}

.home-stage__prompt-text {
  color: var(--ui-text);
  font-size: 0.9375rem;
  line-height: 1.75;
}

.home-stage__meters {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.home-stage__meter-track {
  height: 5px;
  border-radius: 99px;
  background: var(--ui-bg-muted);
  overflow: hidden;
}

.home-stage__meter-bar {
  height: 100%;
  border-radius: 99px;
  background: var(--color-signal-500);
}

.home-stage__meter-bar--accent {
  background: #38bdf8;
}

.home-stage__media-slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.65rem;
  background: var(--ui-bg);
}

.home-stage__preview {
  position: relative;
  min-height: 25rem;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 1.05rem;
  background: #0d0f12;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
}

.home-stage__preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.home-stage__preview-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgb(0 0 0 / 45%) 0%, transparent 35%, transparent 60%, rgb(0 0 0 / 75%) 100%);
}

.home-stage__hud-top {
  position: absolute;
  top: 1rem;
  right: 1.15rem;
  left: 1.15rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 2;
}

.home-stage__rec-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 3px rgb(239 68 68 / 30%);
}

.home-stage__hud-pill {
  font-size: 0.625rem;
  padding: 0.15rem 0.4rem;
  border-radius: 0.35rem;
  background: rgb(255 255 255 / 15%);
  color: #fff;
  font-weight: 600;
  backdrop-filter: blur(8px);
}

.home-stage__hud-center {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  opacity: 0.35;
}

.home-stage__crosshair {
  width: 1.5rem;
  height: 1.5rem;
  position: relative;
}

.home-stage__crosshair::before,
.home-stage__crosshair::after {
  content: '';
  position: absolute;
  background: #fff;
}

.home-stage__crosshair::before {
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  transform: translateY(-50%);
}

.home-stage__crosshair::after {
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-50%);
}

.home-stage__hud-bottom {
  position: absolute;
  bottom: 1rem;
  right: 1.15rem;
  left: 1.15rem;
  z-index: 2;
}

.home-stage__audio-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}

.home-stage__audio-bars span {
  width: 2.5px;
  height: 100%;
  border-radius: 1px;
  background: #22c55e;
  animation: audioBounce 0.8s ease-in-out infinite alternate;
}

@keyframes audioBounce {
  0% {
    height: 25%;
  }
  100% {
    height: 100%;
  }
}

.home-stage__preview-progress {
  height: 3px;
  border-radius: 99px;
  background: rgb(255 255 255 / 26%);
  overflow: hidden;
}

.home-stage__preview-progress span {
  display: block;
  width: 78%;
  height: 100%;
  background: #fff;
}

/* 整合型指标胶囊条 */
.home-metrics-ribbon {
  display: grid;
  width: 100%;
  max-width: 60rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 2.25rem auto 0;
  padding: 1rem 1.5rem 3.5rem;
}

.home-metric-cell {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.45rem;
  border-right: 1px solid var(--ui-border);
}

.home-metric-cell:last-child {
  border-right: 0;
}

.home-metric-cell strong {
  color: var(--ui-text-highlighted);
  font-size: 1.25rem;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.home-metric-cell span {
  color: var(--ui-text-dimmed);
  font-size: 0.8125rem;
}

/* ==========================================================================
   供应商标签与模型看板
   ========================================================================== */
.provider-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-muted);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 160ms ease;
}

.provider-pill:hover {
  border-color: color-mix(in srgb, var(--color-signal-500) 30%, var(--ui-border));
  color: var(--ui-text-highlighted);
}

.provider-pill.is-active {
  border-color: var(--color-signal-500);
  background: color-mix(in srgb, var(--color-signal-500) 8%, var(--ui-bg-elevated));
  color: var(--color-signal-600);
  font-weight: 600;
}

.provider-pill__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding-inline: 0.25rem;
  border-radius: 999px;
  background: var(--ui-bg-muted);
  color: var(--ui-text-dimmed);
  font-size: 0.6875rem;
}

.provider-pill.is-active .provider-pill__count {
  background: color-mix(in srgb, var(--color-signal-500) 18%, transparent);
  color: var(--color-signal-600);
}

.model-inspector__card {
  display: grid;
  grid-template-columns: minmax(18rem, 1fr) minmax(0, 1.35fr);
  gap: 1.25rem;
  padding: 1.5rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-2xl);
  background: var(--ui-bg-elevated);
  box-shadow: var(--shadow-soft);
}

.model-notes-box {
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--ui-border-muted);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ui-bg-muted) 55%, var(--ui-bg-elevated));
}

.model-inspector__identity {
  display: flex;
  flex-direction: column;
  padding-right: 0.5rem;
}

.model-inspector__eyebrow {
  color: var(--ui-text-dimmed);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.model-id-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-sm);
  background: var(--ui-bg-muted);
}

.model-id-bar__code {
  color: var(--ui-text-toned);
  font-size: 0.75rem;
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-id-bar__copy {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.45rem;
  border-radius: 0.35rem;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border-muted);
  color: var(--ui-text-muted);
  font-size: 0.6875rem;
  cursor: pointer;
  flex: none;
  transition: all 140ms ease;
}

.model-id-bar__copy:hover {
  color: var(--ui-text-highlighted);
  border-color: var(--ui-border-accented);
}

.model-inspector__specs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.model-spec-item {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1rem 1.15rem;
  border: 1px solid var(--ui-border-muted);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--ui-bg-muted) 60%, var(--ui-bg-elevated));
  transition: all 180ms ease;
}

.model-spec-item:hover {
  border-color: color-mix(in srgb, var(--color-signal-500) 25%, var(--ui-border));
  background: var(--ui-bg-elevated);
}

.model-spec-item__label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.model-spec-item__value {
  color: var(--ui-text-highlighted);
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

/* ==========================================================================
   INPUT MODES 视觉模拟画布
   ========================================================================== */
.mode-canvas {
  padding: 0.9rem;
  border: 1px solid var(--ui-border-muted);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--ui-bg-muted) 70%, var(--ui-bg-elevated));
  min-height: 8.5rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.mode-canvas__prompt-bar {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.5rem;
  background: var(--ui-bg-elevated);
  font-size: 0.75rem;
}

.mode-canvas__prompt-snippet {
  color: var(--ui-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-canvas__cursor {
  width: 2px;
  height: 12px;
  background: var(--color-signal-500);
  animation: cursorBlink 1s infinite;
  flex: none;
}

@keyframes cursorBlink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

.mode-canvas__filmstrip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
}

.mode-filmstrip__frame {
  flex: 1;
  padding: 0.45rem 0.25rem;
  text-align: center;
  border: 1px solid var(--ui-border);
  border-radius: 0.45rem;
  background: var(--ui-bg-elevated);
}

.mode-filmstrip__label {
  display: block;
  font-size: 0.6875rem;
  color: var(--ui-text-muted);
  font-weight: 550;
}

.mode-filmstrip__arrow {
  color: var(--color-signal-500);
  font-size: 0.75rem;
  font-weight: bold;
}

.mode-canvas__keyframe-track {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.mode-keyframe-box {
  flex: none;
  width: 5.25rem;
  padding: 0.5rem 0.35rem;
  text-align: center;
  border: 1px solid var(--color-signal-500);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--color-signal-500) 8%, var(--ui-bg-elevated));
}

.mode-keyframe-box--end {
  border-color: #38bdf8;
  background: color-mix(in srgb, #38bdf8 8%, var(--ui-bg-elevated));
}

.mode-keyframe-tag {
  display: block;
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--ui-text-highlighted);
}

.mode-keyframe-sub {
  display: block;
  font-size: 0.625rem;
  color: var(--ui-text-dimmed);
}

.mode-keyframe-connector {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.mode-keyframe-curve {
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, var(--color-signal-500), #38bdf8);
  border-radius: 99px;
}

.mode-keyframe-diamond {
  width: 8px;
  height: 8px;
  background: var(--color-signal-500);
  transform: rotate(45deg);
  margin-top: -5px;
}

.mode-keyframe-label {
  font-size: 0.625rem;
  color: var(--ui-text-muted);
  margin-top: 0.35rem;
  font-weight: 550;
}

.mode-canvas__status-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font-size: 0.6875rem;
  color: var(--ui-text-muted);
}

.mode-canvas__multimodal-grid {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.mode-stream-pill {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.45rem;
  background: var(--ui-bg-elevated);
  font-size: 0.72rem;
  color: var(--ui-text-toned);
}

.mode-canvas__converge-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font-size: 0.6875rem;
  color: var(--ui-text-muted);
}

/* ==========================================================================
   内容案例 4 列展台
   ========================================================================== */
.showcase-card {
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-xl);
  background: var(--ui-bg-elevated);
  transition: all 260ms var(--ease-cinematic);
}

.showcase-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card);
  border-color: color-mix(in srgb, var(--color-signal-500) 28%, var(--ui-border));
}

.showcase-card__media {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: var(--ui-bg-muted);
}

.showcase-card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 500ms var(--ease-cinematic);
}

.showcase-card:hover .showcase-card__img {
  transform: scale(1.04);
}

.showcase-card__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgb(0 0 0 / 20%) 0%, transparent 40%, rgb(0 0 0 / 40%) 100%);
  pointer-events: none;
}

.showcase-card__tag {
  position: absolute;
  top: 0.65rem;
  left: 0.65rem;
}

/* ==========================================================================
   工作流步骤优化
   ========================================================================== */
.workflow-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.workflow-step {
  display: grid;
  grid-template-columns: 3.5rem 1fr;
  align-items: center;
  gap: 1rem;
  padding: 1.15rem 1.35rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-lg);
  background: var(--ui-bg-elevated);
  transition: all 180ms ease;
}

.workflow-step:hover {
  border-color: color-mix(in srgb, var(--color-signal-500) 30%, var(--ui-border));
  box-shadow: var(--shadow-soft);
}

.workflow-step__num {
  font-family: var(--font-mono);
  font-size: 1.35rem;
  font-weight: 650;
  color: var(--color-signal-500);
}

/* 动效与自适应 */
.model-swap-enter-active {
  transition:
    opacity 220ms var(--ease-cinematic),
    transform 220ms var(--ease-cinematic);
}

.model-swap-leave-active {
  transition:
    opacity 140ms ease-in,
    transform 140ms ease-in;
}

.model-swap-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.996);
}

.model-swap-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.998);
}

@media (max-width: 960px) {
  .home-stage__body {
    grid-template-columns: 1fr;
  }

  .home-stage__preview {
    min-height: 18rem;
  }

  .model-inspector__card {
    grid-template-columns: 1fr;
  }

  .home-metrics-ribbon {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 1.25rem;
    padding-bottom: 2.5rem;
  }

  .home-metric-cell:nth-child(2) {
    border-right: 0;
  }
}

@media (max-width: 640px) {
  .home-stage__chrome {
    grid-template-columns: 1fr auto;
  }

  .home-stage__brand {
    display: none;
  }

  .model-inspector__specs {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .model-swap-enter-active,
  .model-swap-leave-active {
    transition: none;
  }

  .home-stage__audio-bars span {
    animation: none;
  }
}
</style>
