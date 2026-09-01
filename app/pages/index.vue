<script setup lang="ts">
import type { ModelSpec, ProviderCapability } from '#shared/types/generation'
import { MODE_META, resolveModelCapability } from '#shared/types/generation'
import AnimatedContent from '~/components/vuebits/AnimatedContent.vue'
import CountUp from '~/components/vuebits/CountUp.vue'
import DotGrid from '~/components/vuebits/DotGrid.vue'
import ScrollVelocity from '~/components/vuebits/ScrollVelocity.vue'
import SplitText from '~/components/vuebits/SplitText.vue'

const { data: providerCatalog } = await useFetch<ProviderCapability[]>('/api/providers')
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const modes = Object.entries(MODE_META).map(([key, value]) => ({
  ...value,
  meta: key.toUpperCase(),
}))

const useCases = [
  { image: '/images/usecase-anime.webp', tag: '二次元', title: '角色、场景和动作连续生成', desc: '用角色设定图锁定外观，再通过提示词生成剧情片段、转场和战斗镜头。' },
  { image: '/images/usecase-scifi.webp', tag: '科幻短剧', title: '低成本完成高概念镜头', desc: '从剧本和参考图生成太空、未来城市、异形生物等实拍成本较高的画面。' },
  { image: '/images/usecase-ecommerce-v2.webp', tag: '电商素材', title: '批量测试商品卖点视频', desc: '保持商品外观，快速生成淘宝、拼多多和短视频平台需要的展示素材。' },
  { image: '/images/usecase-knowledge-v2.webp', tag: '知识科普', title: '把抽象概念做成动态画面', desc: '将科学、历史和技术内容转成视觉化镜头，配合旁白生成完整解释视频。' },
]

const workflow = [
  { n: '01', title: '选择生成方式', desc: '根据现有素材选择文生、首尾帧或多模态参考，平台会按所选供应商的能力自动收敛可选项。' },
  { n: '02', title: '设置输出参数', desc: '指定模型、清晰度、画幅、时长、声音与水印，参数范围完全由供应商能力声明驱动。' },
  { n: '03', title: '提交并追踪任务', desc: '任务异步执行，状态实时轮询；生成结果自动转存作品库，不依赖供应商的临时链接。' },
]

const marqueeItems = [
  'WAN 3.0 PRIME',
  'HAPPYHORSE 1.1',
  'MINIMAX H3',
  'HAILUO 2.3',
  'KLING V2.6',
  'SEEDANCE 2.5',
  '480P – 4K',
  '最长 30 秒',
  '同步音频',
  '首尾帧控制',
  '多模态参考',
  '21:9 – 9:16',
]

const faqItems = [
  {
    label: '平台接入了哪些模型供应商？',
    content: '目前阿里云百炼、MiniMax 海螺、可灵 Kling 与字节跳动 Seedance 四家平台的适配器与能力声明已全部就绪。配置对应环境变量后即自动上线，前端选项、校验与参数映射无需改代码。',
  },
  {
    label: '为什么每家平台只列了少数几个模型？',
    content: '矩阵统计的是本平台已完成适配、校验和参数映射的 API model ID，不是厂商的完整产品线。百炼官方视频目录包含 HappyHorse、万相、人像驱动、PixVerse、可灵和 Vidu 六类；forkvdo 当前映射 HappyHorse、万相、可灵，并额外接入百炼模型市场的 MiniMax H3。PixVerse、Vidu 和人像驱动已有官方 API，但请求字段与任务结构尚未完成平台映射。',
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
    content: '供应商返回的临时链接通常有时效。作品库中的任务会展示原始链接，后续可开启转存，把视频归档到本地持久化存储，避免 24 小时后失效。',
  },
  {
    label: '如何接入一家新的第三方平台？',
    content: '实现一个 VideoProvider 适配器（submit + getTask 两个方法），补一份能力声明，在工厂函数中注册即可——页面、校验、轮询与作品库全部复用现有链路。',
  },
]

const supportedModelCount = computed(() =>
  providerCatalog.value?.reduce((sum, item) => sum + item.models.length, 0) || 0)

const selectedProviderId = ref('dashscope')
const selectedModelId = ref('')
const selectedProvider = computed(() =>
  providerCatalog.value?.find(item => item.id === selectedProviderId.value) || providerCatalog.value?.[0])
const selectedModel = computed(() =>
  selectedProvider.value?.models.find(model => model.id === selectedModelId.value) || selectedProvider.value?.models[0])
const supportedModelItems = computed(() => (providerCatalog.value || []).flatMap(provider =>
  provider.models.map(model => ({
    label: formatCatalogModelName(model.name),
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
const selectedModelIndex = computed(() => Math.max(0, supportedModelItems.value.findIndex(item =>
  item.providerId === selectedProvider.value?.id && item.modelId === selectedModel.value?.id)))

watch(selectedProvider, (provider) => {
  if (provider && !provider.models.some(model => model.id === selectedModelId.value))
    selectedModelId.value = provider.models[0]?.id || ''
}, { immediate: true })

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

const selectedModelFacts = computed(() => {
  if (!selectedProvider.value || !selectedModel.value)
    return []

  return [
    { kind: 'modes', label: '生成方式', icon: 'i-lucide-wand-sparkles', value: formatModelModes(selectedProvider.value, selectedModel.value) },
    { kind: 'resolution', label: '清晰度', icon: 'i-lucide-scan', value: formatModelResolutions(selectedProvider.value, selectedModel.value) },
    { kind: 'duration', label: '输出时长', icon: 'i-lucide-timer', value: formatModelDuration(selectedProvider.value, selectedModel.value) },
    { kind: 'ratio', label: '画幅', icon: 'i-lucide-frame', value: formatModelRatios(selectedProvider.value, selectedModel.value) },
    { kind: 'audio', label: '音频', icon: 'i-lucide-audio-lines', value: formatModelAudio(selectedProvider.value, selectedModel.value) },
  ]
})
</script>

<template>
  <div class="bg-default">
    <!-- ============================ HERO ============================ -->
    <section class="film-grain relative overflow-hidden border-b border-default bg-elevated">
      <DotGrid :gap="32" :color="isDark ? '#2d3036' : '#d9dce1'" active-color="#ff4d35" class="opacity-55" />
      <div class="absolute inset-x-0 bottom-0 h-40 bg-elevated/80 backdrop-blur-[2px]" aria-hidden="true" />

      <div class="relative mx-auto grid max-w-[1440px] items-center gap-14 px-5 pt-36 pb-18 md:px-8 lg:grid-cols-[.92fr_1.08fr] lg:pt-40 lg:pb-24">
        <AnimatedContent :distance="32" :duration="0.8" class-name="max-w-2xl">
          <UBadge color="neutral" variant="outline" size="lg" class="mb-8 gap-2 bg-elevated/90 px-3 py-1 backdrop-blur">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            {{ supportedModelCount }} 个 API 模型已适配 · 最高 4K
          </UBadge>

          <h1 class="type-display">
            <SplitText text="什么内容都能拍，" /><br>
            <span class="text-dimmed"><SplitText text="不必真的去拍。" :delay="0.25" /></span>
          </h1>

          <p class="type-lead mt-7 max-w-xl">
            文字、首尾帧、参考图、参考视频、参考音频，自由组合输入。一个创作流程覆盖项目已适配的全部模型，最高 4K、最长 30 秒、支持同步生成声音。
          </p>

          <div class="mt-9 flex flex-wrap gap-3">
            <UButton to="/studio" size="xl" color="primary" trailing-icon="i-lucide-arrow-up-right" class="px-7">
              新建生成任务
            </UButton>
            <UButton to="/projects" size="xl" color="neutral" variant="outline" class="bg-elevated px-7">
              查看作品库
            </UButton>
          </div>

          <div class="mt-11 flex flex-wrap items-center gap-x-8 gap-y-3">
            <div
              v-for="item in [
                { value: 4, suffix: 'K', label: '最高清晰度' },
                { value: 30, suffix: ' 秒', label: '单次最长时长' },
                { value: 6, suffix: ' 种', label: '输入组合方式' },
              ]" :key="item.label" class="flex items-baseline gap-2"
            >
              <span class="text-lg font-650 tracking-tight">
                <CountUp :to="item.value" :duration="1.6" />{{ item.suffix }}
              </span>
              <span class="type-caption">{{ item.label }}</span>
            </div>
          </div>
        </AnimatedContent>

        <AnimatedContent :distance="36" direction="horizontal" :reverse="true" :duration="0.9" :delay="0.08">
          <UCard class="mx-auto w-full max-w-[680px] overflow-hidden bg-zinc-950 shadow-cinema" :ui="{ body: 'p-0 sm:p-0' }">
            <div class="relative aspect-[16/10] overflow-hidden">
              <img src="/images/hero-cinematic.png" alt="AI 生成的电影感荒原光门画面" class="h-full w-full object-cover opacity-95">
              <div class="surface-rule absolute inset-0 opacity-25" aria-hidden="true" />
              <div class="absolute inset-x-0 top-0 flex items-center justify-between border-b border-white/15 bg-black/25 px-4 py-3 text-white backdrop-blur-md">
                <span class="type-mono flex items-center gap-2 text-white/70"><span class="h-1.5 w-1.5 rounded-full bg-signal-500" /> LIVE FRAME</span>
                <span class="type-mono text-white/55">00:00:08:14</span>
              </div>
              <div class="absolute inset-x-0 bottom-0 grid grid-cols-4 divide-x divide-white/15 border-t border-white/15 bg-black/55 text-white backdrop-blur-md">
                <div v-for="cell in [{ label: '模型', value: 'WAN 3.0' }, { label: '画幅', value: '16:9' }, { label: '输出', value: '1080P' }, { label: '音轨', value: 'SYNC' }]" :key="cell.label" class="px-3 py-3">
                  <span class="type-kicker block text-white/40">{{ cell.label }}</span>
                  <span class="type-mono mt-1 block truncate text-white/85">{{ cell.value }}</span>
                </div>
              </div>
            </div>
          </UCard>
        </AnimatedContent>
      </div>
    </section>

    <!-- ============================ 模型跑马灯 ============================ -->
    <section class="border-b border-default bg-elevated py-5">
      <ScrollVelocity
        :items="marqueeItems"
        :base-velocity="38"
        class="type-mono text-zinc-400"
      />
    </section>

    <!-- ============================ 模型目录 ============================ -->
    <section id="capabilities" class="mx-auto max-w-[1440px] px-5 py-20 md:px-8 md:py-24">
      <AnimatedContent :distance="28" :duration="0.65">
        <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p class="type-kicker">
              MODEL CATALOG
            </p>
            <h2 class="type-section-title mt-3 max-w-2xl">
              项目已支持的模型
            </h2>
          </div>
        </div>
      </AnimatedContent>

      <AnimatedContent :distance="24" :duration="0.7" :delay="0.05">
        <div class="model-catalog mt-12">
          <div class="model-catalog__toolbar">
            <div>
              <label class="type-kicker block" for="catalog-model">选择模型</label>
              <p class="type-caption mt-1">
                共 {{ supportedModelCount }} 个已适配 API model ID
              </p>
            </div>
            <div class="model-catalog__picker">
              <USelect
                id="catalog-model"
                v-model="selectedModelKey"
                :items="supportedModelItems"
                size="xl"
                class="w-full"
                aria-label="选择项目支持的模型"
              />
            </div>
          </div>

          <Transition name="model-swap" mode="out-in">
            <div
              v-if="selectedProvider && selectedModel"
              :key="selectedModelKey"
              class="model-catalog__panel"
              aria-live="polite"
            >
              <div class="model-catalog__bento">
                <article class="model-catalog__identity">
                  <div class="flex items-start justify-between gap-4">
                    <span class="model-catalog__eyebrow">
                      MODEL {{ String(selectedModelIndex + 1).padStart(2, '0') }} / {{ supportedModelCount }}
                    </span>
                    <span class="i-lucide-aperture text-xl text-signal-500" aria-hidden="true" />
                  </div>
                  <div class="mt-auto pt-14">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="text-2xl text-highlighted font-650">
                        {{ formatCatalogModelName(selectedModel.name) }}
                      </h3>
                      <UBadge v-if="selectedModel.badge" color="neutral" variant="subtle" size="sm">
                        {{ selectedModel.badge }}
                      </UBadge>
                    </div>
                    <p class="type-caption mt-3 max-w-xl">
                      {{ selectedModel.description }}
                    </p>
                    <code class="model-catalog__model-id">{{ selectedModel.id }}</code>
                  </div>
                </article>

                <article
                  v-for="fact in selectedModelFacts"
                  :key="fact.kind"
                  class="model-catalog__fact"
                  :class="`model-catalog__fact--${fact.kind}`"
                >
                  <div class="flex items-center justify-between gap-4">
                    <span class="model-catalog__eyebrow">{{ fact.label }}</span>
                    <span :class="fact.icon" class="text-lg text-dimmed" aria-hidden="true" />
                  </div>
                  <p class="model-catalog__fact-value">
                    {{ fact.value }}
                  </p>
                </article>

                <div v-if="selectedModel.capabilities?.notes" class="model-catalog__note">
                  <span class="i-lucide-info mt-0.5 shrink-0 text-signal-500" aria-hidden="true" />
                  <p>{{ selectedModel.capabilities.notes }}</p>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </AnimatedContent>
    </section>

    <!-- ============================ 生成方式 ============================ -->
    <section class="border-y border-default bg-elevated">
      <div class="mx-auto max-w-[1440px] px-5 py-20 md:px-8 md:py-24">
        <AnimatedContent :distance="28" :duration="0.65">
          <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p class="type-kicker">
                INPUT MODES
              </p>
              <h2 class="type-section-title mt-3 max-w-2xl">
                一套任务结构，覆盖常用生成方式
              </h2>
            </div>
            <p class="type-body max-w-md">
              首尾帧和多模态参考为独立模式。参考模式下，图片、视频和音频可以组合输入。
            </p>
          </div>
        </AnimatedContent>

        <div class="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <AnimatedContent v-for="(item, index) in modes" :key="item.label" :distance="24" :duration="0.55" :delay="index * 0.04">
            <UCard class="h-full transition duration-300 hover:-translate-y-0.5 hover:shadow-card" :ui="{ body: 'p-6 sm:p-6' }">
              <div class="flex items-start justify-between">
                <span :class="item.icon" class="text-xl text-signal-500" /><span class="type-mono text-dimmed">{{ item.meta }}</span>
              </div>
              <h3 class="type-card-title mt-12">
                {{ item.label }}
              </h3>
              <p class="type-caption mt-2">
                {{ item.hint }}
              </p>
            </UCard>
          </AnimatedContent>
        </div>
      </div>
    </section>

    <!-- ============================ 内容案例 ============================ -->
    <section class="mx-auto max-w-[1440px] px-5 py-20 md:px-8 md:py-24">
      <AnimatedContent :distance="28" :duration="0.65">
        <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p class="type-kicker">
              CONTENT TYPES
            </p>
            <h2 class="type-section-title mt-3">
              现在大家在做的内容
            </h2>
          </div>
          <UButton to="/studio" color="neutral" variant="outline" trailing-icon="i-lucide-arrow-right" class="w-fit bg-elevated">
            打开创作台
          </UButton>
        </div>
      </AnimatedContent>

      <div class="mt-12 grid gap-4 md:grid-cols-2">
        <AnimatedContent v-for="(item, index) in useCases" :key="item.title" :delay="index * 0.06" :distance="26">
          <UCard class="group overflow-hidden transition duration-500 hover:shadow-lift" :ui="{ body: 'p-0 sm:p-0' }">
            <div class="aspect-[4/3] overflow-hidden bg-muted">
              <img :src="item.image" :alt="item.title" class="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.03]">
            </div>
            <div class="p-6">
              <UBadge color="neutral" variant="subtle" size="md">
                {{ item.tag }}
              </UBadge>
              <h3 class="type-card-title mt-4">
                {{ item.title }}
              </h3>
              <p class="type-caption mt-2">
                {{ item.desc }}
              </p>
            </div>
          </UCard>
        </AnimatedContent>
      </div>
    </section>

    <!-- ============================ 工作流 ============================ -->
    <section id="workflow" class="border-y border-default bg-elevated">
      <div class="mx-auto grid max-w-[1440px] gap-14 px-5 py-20 md:px-8 md:py-24 lg:grid-cols-[.75fr_1.25fr]">
        <AnimatedContent :distance="26">
          <p class="type-kicker">
            WORKFLOW
          </p>
          <h2 class="type-section-title mt-3">
            三个步骤完成一次生成
          </h2>
          <p class="type-body mt-6 max-w-md">
            任务异步提交，页面关闭不会中断。结果实时轮询，自动沉淀到作品库，随时回来查看。
          </p>
          <UButton to="/studio" color="primary" trailing-icon="i-lucide-arrow-up-right" class="mt-8">
            直接开始
          </UButton>
        </AnimatedContent>
        <div class="divide-y divide-default border-y border-default">
          <AnimatedContent v-for="(item, index) in workflow" :key="item.n" :delay="index * 0.05" :distance="22">
            <div class="grid grid-cols-[54px_1fr] gap-5 py-7 md:grid-cols-[70px_1fr_auto] md:items-center">
              <span class="type-mono text-signal-500">{{ item.n }}</span>
              <div>
                <h3 class="text-lg text-highlighted font-600">
                  {{ item.title }}
                </h3>
                <p class="type-caption mt-2">
                  {{ item.desc }}
                </p>
              </div>
              <span class="i-lucide-arrow-right hidden text-dimmed md:block" />
            </div>
          </AnimatedContent>
        </div>
      </div>
    </section>

    <!-- ============================ 数据带 ============================ -->
    <section class="border-b border-default bg-default">
      <div class="mx-auto grid max-w-[1440px] px-5 md:grid-cols-4 md:px-8 divide-y divide-default md:divide-x md:divide-y-0">
        <div class="py-10 md:px-8 md:first:pl-0">
          <div class="text-4xl font-300 tracking-tight text-highlighted">
            <CountUp :to="4" :duration="1.6" />K
          </div>
          <p class="type-caption mt-2">
            最高输出清晰度
          </p>
        </div>
        <div class="py-10 md:px-8">
          <div class="text-4xl font-300 tracking-tight text-highlighted">
            <CountUp :to="30" :duration="1.4" /> 秒
          </div>
          <p class="type-caption mt-2">
            单次生成最长时长
          </p>
        </div>
        <div class="py-10 md:px-8">
          <div class="text-4xl font-300 tracking-tight text-highlighted">
            <CountUp :to="7" :duration="1.4" /> 类
          </div>
          <p class="type-caption mt-2">
            平台支持的输入素材类型
          </p>
        </div>
        <div class="py-10 md:px-8">
          <div class="text-4xl font-300 tracking-tight text-highlighted">
            <CountUp :to="supportedModelCount" :duration="1.2" /> 个
          </div>
          <p class="type-caption mt-2">
            可选生成模型
          </p>
        </div>
      </div>
    </section>

    <!-- ============================ FAQ ============================ -->
    <section class="mx-auto max-w-[1440px] px-5 py-20 md:px-8 md:py-24">
      <AnimatedContent :distance="26" :duration="0.65">
        <div class="grid gap-12 lg:grid-cols-[.6fr_1.4fr]">
          <div>
            <p class="type-kicker">
              FAQ
            </p>
            <h2 class="type-section-title mt-3">
              常见问题
            </h2>
            <p class="type-body mt-5 max-w-sm">
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
              trigger: 'rounded-none py-6 text-base hover:text-signal-500 focus-visible:outline-offset-[-2px]',
              label: 'text-start font-600 tracking-[-0.015em]',
              leadingIcon: 'size-4',
              trailingIcon: 'size-5 text-dimmed group-hover:text-signal-500 group-data-[state=open]:rotate-45',
              body: 'pb-6 pl-12 pr-10 text-base leading-8 text-muted md:pr-16',
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
    <section class="mx-auto max-w-[1440px] px-5 pb-20 md:px-8 md:pb-24">
      <AnimatedContent :distance="28">
        <div class="film-grain relative overflow-hidden rounded-lg bg-zinc-950 px-7 py-16 text-white md:px-14 md:py-20">
          <div class="surface-rule absolute inset-0 opacity-30" aria-hidden="true" />
          <div class="relative flex flex-col justify-between gap-10 md:flex-row md:items-end">
            <div>
              <p class="type-kicker text-white/40">
                GET STARTED
              </p>
              <h2 class="type-section-title mt-3 max-w-3xl text-white">
                准备好素材，就可以开始生成
              </h2>
              <p class="type-body mt-5 max-w-xl text-white/55">
                在服务端配置任一平台的 API Key，创作台即刻可用。参数消耗按所选供应商的计费规则结算。
              </p>
            </div>
            <UButton to="/studio" size="xl" color="neutral" trailing-icon="i-lucide-arrow-up-right" class="w-fit shrink-0 bg-white px-7 text-zinc-950 hover:bg-white/90">
              新建任务
            </UButton>
          </div>
        </div>
      </AnimatedContent>
    </section>

    <footer class="border-t border-default bg-elevated">
      <div class="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
        <BrandLogo />
        <span class="type-caption">AI 视频生成平台 · 多供应商架构</span>
        <span class="type-caption">© {{ new Date().getFullYear() }} forkvdo</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.model-catalog {
  position: relative;
}

.model-catalog__toolbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 2rem;
  padding: 1.25rem 0;
  border-block: 1px solid var(--ui-border);
}

.model-catalog__picker {
  width: min(100%, 23rem);
  flex: none;
}

.model-catalog__panel {
  padding-top: 1.25rem;
}

.model-catalog__bento {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.7rem;
}

.model-catalog__identity,
.model-catalog__fact,
.model-catalog__note {
  border: 1px solid color-mix(in srgb, var(--ui-border) 86%, transparent);
  border-radius: var(--radius-2xl);
  background: var(--ui-bg-elevated);
  box-shadow: var(--shadow-soft);
}

.model-catalog__identity,
.model-catalog__fact {
  position: relative;
  overflow: hidden;
  transition:
    border-color 90ms ease,
    background-color 90ms ease,
    transform 120ms var(--ease-cinematic),
    box-shadow 180ms var(--ease-cinematic);
}

.model-catalog__identity::after,
.model-catalog__fact::after {
  position: absolute;
  inset: auto -15% -55% 25%;
  height: 80%;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--color-signal-500) 9%, transparent), transparent 66%);
  content: '';
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}

.model-catalog__identity:hover,
.model-catalog__fact:hover {
  border-color: color-mix(in srgb, var(--color-signal-500) 34%, var(--ui-border));
  background: color-mix(in srgb, var(--ui-bg-elevated) 86%, var(--color-signal-50));
  box-shadow: var(--shadow-soft);
  transform: translateY(-2px);
}

.model-catalog__identity:hover::after,
.model-catalog__fact:hover::after {
  opacity: 1;
}

.model-catalog__identity {
  display: flex;
  min-height: 15rem;
  flex-direction: column;
  padding: 1.4rem;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--ui-bg-elevated) 90%, var(--color-signal-50)),
    var(--ui-bg-muted)
  );
}

.model-catalog__eyebrow {
  color: var(--ui-text-dimmed);
  font-family: var(--font-sans);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.model-catalog__model-id {
  display: block;
  width: fit-content;
  max-width: 100%;
  margin-top: 1.25rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--ui-bg-elevated) 72%, transparent);
  color: var(--ui-text-dimmed);
  font-size: 0.75rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.model-catalog__fact {
  display: flex;
  min-height: 7.15rem;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.2rem;
}

.model-catalog__fact-value {
  position: relative;
  z-index: 1;
  margin-top: 2rem;
  color: var(--ui-text-highlighted);
  font-size: clamp(1rem, 1.35vw, 1.25rem);
  font-weight: 600;
  line-height: 1.45;
  letter-spacing: -0.012em;
  overflow-wrap: anywhere;
}

.model-catalog__note {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.15rem;
  color: var(--ui-text-dimmed);
  font-size: 0.8125rem;
  line-height: 1.65;
}

.model-swap-enter-active {
  transition:
    opacity 280ms var(--ease-cinematic),
    transform 280ms var(--ease-cinematic);
}

.model-swap-leave-active {
  transition:
    opacity 160ms ease-in,
    transform 160ms ease-in;
}

.model-swap-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.995);
}

.model-swap-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.998);
}

:global(.dark) .model-catalog__identity:hover,
:global(.dark) .model-catalog__fact:hover {
  background: color-mix(in srgb, var(--ui-bg-elevated) 90%, var(--color-signal-950));
}

@media (min-width: 640px) {
  .model-catalog__bento {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .model-catalog__identity,
  .model-catalog__fact--modes,
  .model-catalog__note {
    grid-column: span 2;
  }
}

@media (min-width: 1024px) {
  .model-catalog__bento {
    grid-template-columns: repeat(12, minmax(0, 1fr));
  }

  .model-catalog__identity {
    grid-column: 1 / 6;
    grid-row: 1 / 3;
  }

  .model-catalog__fact--modes {
    grid-column: 6 / 13;
    grid-row: 1;
  }

  .model-catalog__fact--resolution {
    grid-column: 6 / 9;
    grid-row: 2;
  }

  .model-catalog__fact--duration {
    grid-column: 9 / 13;
    grid-row: 2;
  }

  .model-catalog__fact--ratio {
    grid-column: 1 / 7;
  }

  .model-catalog__fact--audio {
    grid-column: 7 / 13;
  }

  .model-catalog__note {
    grid-column: 1 / 13;
  }
}

@media (max-width: 767px) {
  .model-catalog__panel {
    padding-top: 1.5rem;
  }

  .model-catalog__toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 1rem;
  }

  .model-catalog__picker {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .model-catalog__identity,
  .model-catalog__fact,
  .model-catalog__identity::after,
  .model-catalog__fact::after,
  .model-swap-enter-active,
  .model-swap-leave-active {
    transition: none;
  }

  .model-catalog__identity:hover,
  .model-catalog__fact:hover {
    transform: none;
  }
}
</style>
