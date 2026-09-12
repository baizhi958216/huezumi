<script setup lang="ts">
import type { AccountLedgerEntry, AccountOverview, ModelAssetSummary } from '#shared/types/account'
import type { GenerationRecord } from '#shared/types/generation'

type DashboardSection = 'overview' | 'billing' | 'models' | 'works'

const { user } = useAuth()
const { data: session } = await useFetch('/api/auth/session')
if (!session.value?.user)
  await navigateTo('/')
else
  user.value = session.value.user

const { data: overview, status, error: overviewError, refresh } = await useFetch<AccountOverview>('/api/account/overview')
const { data: ledger, error: ledgerError } = await useFetch<AccountLedgerEntry[]>('/api/billing/ledger')
const { data: models, error: modelsError } = await useFetch<ModelAssetSummary[]>('/api/models')
const { data: works } = await useFetch<GenerationRecord[]>('/api/generations')
const route = useRoute()
const router = useRouter()

const sections: Array<{ id: DashboardSection, label: string, icon: string }> = [
  { id: 'overview', label: '概览', icon: 'i-lucide-layout-dashboard' },
  { id: 'billing', label: '额度明细', icon: 'i-lucide-coins' },
  { id: 'models', label: '我的模型', icon: 'i-lucide-cpu' },
  { id: 'works', label: '我的作品', icon: 'i-lucide-images' },
]

const activeSection = computed<DashboardSection>(() => {
  const value = route.query.section
  return sections.some(item => item.id === value) ? value as DashboardSection : 'overview'
})

function selectSection(section: DashboardSection) {
  router.replace({ query: { ...route.query, section: section === 'overview' ? undefined : section } })
}

function formatBytes(value: number) {
  if (!value)
    return '0 B'
  if (value < 1024 * 1024)
    return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024)
    return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
}

function sourceLabel(source: ModelAssetSummary['source']) {
  return { upload: '用户上传', civitai: 'Civitai', training: '微调产物', platform: '平台模型' }[source]
}

function kindLabel(kind: ModelAssetSummary['kind']) {
  return { checkpoint: 'Checkpoint', lora: 'LoRA', vae: 'VAE', clip: 'CLIP', unet: 'UNet', controlnet: 'ControlNet', embedding: 'Embedding', upscale: '放大模型', other: '其他' }[kind]
}

function modelStatusLabel(status: ModelAssetSummary['status']) {
  return { pending: '待处理', ready: '可用', failed: '处理失败', quarantined: '待审核' }[status]
}

function workStatusLabel(status: GenerationRecord['status']) {
  return ({ PENDING: '排队中', RUNNING: '生成中', SUCCEEDED: '已完成', FAILED: '失败', UNKNOWN: '状态未知' } as Record<string, string>)[status] || status
}

function workStatusClass(status: GenerationRecord['status']) {
  if (status === 'SUCCEEDED')
    return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'FAILED')
    return 'text-red-500'
  return 'text-amber-600 dark:text-amber-400'
}

const stats = computed(() => [
  { label: '可用额度', value: overview.value?.credits.available ?? 0, hint: `预留 ${overview.value?.credits.reserved ?? 0}`, icon: 'i-lucide-coins', tone: 'text-amber-500' },
  { label: '本月消耗', value: overview.value?.credits.monthSpent ?? 0, hint: `累计 ${overview.value?.credits.totalSpent ?? 0}`, icon: 'i-lucide-trending-down', tone: 'text-primary' },
  { label: '作品', value: overview.value?.counts.works ?? 0, hint: `${overview.value?.counts.activeWorks ?? 0} 个进行中`, icon: 'i-lucide-images', tone: 'text-sky-500' },
  { label: '模型资产', value: overview.value?.counts.models ?? 0, hint: formatBytes(overview.value?.storage.modelUsedBytes ?? 0), icon: 'i-lucide-cpu', tone: 'text-violet-500' },
])

const visibleWorks = computed(() => (activeSection.value === 'works' ? works.value : overview.value?.recentWorks) ?? [])
const visibleLedger = computed(() => (activeSection.value === 'billing' ? ledger.value : overview.value?.recentLedger) ?? [])
const visibleModels = computed(() => (activeSection.value === 'models' ? models.value : overview.value?.recentModels) ?? [])
</script>

<template>
  <div v-if="user" class="mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="type-label text-xs text-primary">
          MY SPACE
        </p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight">
          我的空间
        </h1>
        <p class="mt-2 text-sm text-muted">
          管理额度、模型资产和生成作品。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton to="/studio" icon="i-lucide-plus" color="primary">
          开始创作
        </UButton>
        <UButton to="/account" icon="i-lucide-settings-2" color="neutral" variant="soft">
          个人设置
        </UButton>
      </div>
    </div>

    <div class="mt-7 flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-default bg-muted/70 p-1" aria-label="空间内容筛选">
      <button
        v-for="item in sections"
        :key="item.id"
        type="button"
        class="focus-ring inline-flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition"
        :class="activeSection === item.id ? 'bg-elevated text-highlighted shadow-soft ring-1 ring-inset ring-default' : 'text-muted hover:bg-elevated/70 hover:text-highlighted'"
        :aria-pressed="activeSection === item.id"
        @click="selectSection(item.id)"
      >
        <UIcon :name="item.icon" class="size-4" />
        {{ item.label }}
      </button>
    </div>

    <div v-if="status === 'pending'" class="py-16 text-center text-sm text-muted">
      正在加载你的空间…
    </div>

    <UAlert
      v-else-if="overviewError"
      class="mt-6"
      color="error"
      variant="subtle"
      icon="i-lucide-database-zap"
      title="暂时无法加载空间数据"
      description="请确认数据库 migration 已完成后重试。此次页面检查未触发模型上传、下载或 OSS 请求。"
    >
      <template #actions>
        <UButton size="sm" color="error" variant="soft" @click="refresh()">
          重试
        </UButton>
      </template>
    </UAlert>

    <template v-else-if="!overviewError">
      <div class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UCard v-for="item in stats" :key="item.label" class="overflow-hidden">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-muted">
                {{ item.label }}
              </p>
              <p class="mt-2 text-2xl font-semibold tracking-tight">
                {{ item.value }}
              </p>
              <p class="mt-1 text-xs text-dimmed">
                {{ item.hint }}
              </p>
            </div>
            <span class="flex size-9 items-center justify-center rounded-xl bg-elevated" :class="item.tone">
              <UIcon :name="item.icon" class="size-5" />
            </span>
          </div>
        </UCard>
      </div>

      <div class="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <UCard v-if="activeSection === 'overview' || activeSection === 'billing'">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <strong>额度流水</strong>
                <p class="mt-1 text-xs text-muted">
                  只统计实际结算，预留和释放不会重复计费。
                </p>
              </div>
              <UButton v-if="activeSection === 'overview'" color="neutral" variant="link" size="sm" trailing-icon="i-lucide-arrow-right" @click="selectSection('billing')">
                查看全部
              </UButton>
            </div>
          </template>
          <UAlert v-if="ledgerError" color="warning" variant="subtle" icon="i-lucide-alert-triangle" title="额度流水暂不可用" description="额度明细接口返回异常，请稍后重试。" />
          <div v-else-if="visibleLedger.length" class="divide-y divide-default">
            <div v-for="entry in visibleLedger.slice(0, activeSection === 'billing' ? 100 : 6)" :key="entry.id" class="flex items-center justify-between gap-4 py-3 text-sm">
              <div class="min-w-0">
                <p class="truncate font-medium">
                  {{ entry.reason || entry.type }}
                </p>
                <p class="mt-1 text-xs text-dimmed">
                  {{ formatDate(entry.createdAt) }}
                </p>
              </div>
              <span class="shrink-0 font-semibold" :class="entry.amountCredits >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'">
                {{ entry.amountCredits >= 0 ? '+' : '' }}{{ entry.amountCredits }}
              </span>
            </div>
          </div>
          <p v-else class="py-10 text-center text-sm text-muted">
            暂无额度流水
          </p>
        </UCard>

        <UCard v-if="activeSection === 'overview' || activeSection === 'models'">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <strong>我的模型</strong>
                <p class="mt-1 text-xs text-muted">
                  私有模型和微调产物会显示在这里。
                </p>
              </div>
              <UButton v-if="activeSection === 'overview'" color="neutral" variant="link" size="sm" trailing-icon="i-lucide-arrow-right" @click="selectSection('models')">
                管理模型
              </UButton>
            </div>
          </template>
          <UAlert v-if="modelsError" color="warning" variant="subtle" icon="i-lucide-alert-triangle" title="模型列表暂不可用" description="模型管理数据表尚未完成初始化，请稍后重试。" />
          <div v-else-if="visibleModels.length" class="space-y-2">
            <div v-for="model in visibleModels.slice(0, activeSection === 'models' ? 100 : 5)" :key="model.id" class="flex items-center gap-3 rounded-xl border border-default p-3">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                <UIcon name="i-lucide-cpu" class="size-4" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium" :title="model.name">
                  {{ model.name }}
                </p>
                <p class="mt-1 text-xs text-dimmed">
                  {{ kindLabel(model.kind) }} · {{ sourceLabel(model.source) }} · {{ formatBytes(model.sizeBytes) }}
                </p>
              </div>
              <span class="shrink-0 text-xs" :class="model.status === 'ready' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'">
                {{ modelStatusLabel(model.status) }}
              </span>
            </div>
          </div>
          <div v-else class="rounded-xl border border-dashed border-default px-4 py-9 text-center">
            <UIcon name="i-lucide-box" class="size-8 text-dimmed" />
            <p class="mt-3 text-sm font-medium">
              还没有模型资产
            </p>
            <p class="mt-1 text-xs leading-5 text-muted">
              用户上传、Civitai 导入和微调产物登记后，会在这里统一管理。
            </p>
            <UButton class="mt-4" size="sm" color="neutral" variant="soft" disabled title="模型传输功能尚未接入，当前不会产生 OSS 流量">
              导入模型（即将支持）
            </UButton>
          </div>
        </UCard>
      </div>

      <UCard v-if="activeSection === 'overview' || activeSection === 'works'" class="mt-5">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <strong>我的作品</strong>
              <p class="mt-1 text-xs text-muted">
                生成记录和结果预览统一在作品库中管理。
              </p>
            </div>
            <UButton to="/projects" color="neutral" variant="link" size="sm" trailing-icon="i-lucide-arrow-right">
              打开作品库
            </UButton>
          </div>
        </template>
        <div v-if="visibleWorks.length" class="divide-y divide-default">
          <div v-for="work in visibleWorks.slice(0, activeSection === 'works' ? 100 : 6)" :key="work.id" class="flex items-center gap-4 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium" :title="work.prompt || work.id">
                {{ work.prompt || '未命名作品' }}
              </p>
              <p class="mt-1 text-xs text-dimmed">
                {{ work.provider }} · {{ work.model || '默认模型' }} · {{ formatDate(work.createdAt) }}
              </p>
            </div>
            <span class="shrink-0 text-xs" :class="workStatusClass(work.status)">
              {{ workStatusLabel(work.status) }}
            </span>
            <span v-if="work.billing?.chargedCredits !== undefined" class="hidden shrink-0 text-xs text-muted sm:inline">
              {{ work.billing.chargedCredits }} 额度
            </span>
          </div>
        </div>
        <p v-else class="py-10 text-center text-sm text-muted">
          还没有生成作品，去创作台开始第一条内容吧。
        </p>
      </UCard>

      <UCard v-if="activeSection === 'overview'" class="mt-5">
        <template #header>
          <strong>存储用量</strong>
        </template>
        <div class="grid gap-4 sm:grid-cols-3">
          <div>
            <p class="text-xs text-muted">
              作品与素材
            </p>
            <p class="mt-1 font-semibold">
              {{ formatBytes(overview?.storage.mediaUsedBytes ?? 0) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              模型资产
            </p>
            <p class="mt-1 font-semibold">
              {{ formatBytes(overview?.storage.modelUsedBytes ?? 0) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              总用量 / 上限
            </p>
            <p class="mt-1 font-semibold">
              {{ formatBytes(overview?.storage.totalUsedBytes ?? 0) }} / {{ formatBytes(overview?.storage.limitBytes ?? 0) }}
            </p>
          </div>
        </div>
      </UCard>
    </template>

    <div class="mt-5 text-right">
      <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">
        刷新数据
      </UButton>
    </div>
  </div>
</template>
