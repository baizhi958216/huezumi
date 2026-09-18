<script setup lang="ts">
import type { AccountLedgerEntry, AccountOverview, ModelAssetSummary } from '#shared/types/account'
import type { Page, WorkSummary } from '#shared/types/platform'
import { runKindLabel } from '~/utils/run-labels'

type DashboardSection = 'overview' | 'billing' | 'models' | 'works'

const { user } = useAuth()
const { data: session } = await useFetch('/api/auth/session')
if (!session.value?.user) {
  await navigateTo('/')
}
else {
  user.value = session.value.user
}

const { data: overview, status, error: overviewError, refresh } = await useFetch<AccountOverview>('/api/account/overview')

const ledger = ref<AccountLedgerEntry[]>()
const models = ref<ModelAssetSummary[]>()
const works = ref<WorkSummary[]>()
const ledgerError = ref<unknown>()
const modelsError = ref<unknown>()

const route = useRoute()
const router = useRouter()

const sections: Array<{
  id: DashboardSection
  label: string
  icon: string
}> = [
  { id: 'overview', label: '空间概览', icon: 'i-lucide-layout-dashboard' },
  { id: 'billing', label: '额度流水', icon: 'i-lucide-coins' },
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
  return {
    checkpoint: 'Checkpoint',
    lora: 'LoRA',
    vae: 'VAE',
    clip: 'CLIP',
    unet: 'UNet',
    controlnet: 'ControlNet',
    embedding: 'Embedding',
    upscale: '放大模型',
    other: '其他',
  }[kind]
}

function modelStatusLabel(status: ModelAssetSummary['status']) {
  return { pending: '待处理', ready: '可用', failed: '处理失败', quarantined: '待审核' }[status]
}

const stats = computed(() => [
  {
    label: '可用额度',
    value: overview.value?.credits.available ?? 0,
    hint: `预留 ${overview.value?.credits.reserved ?? 0}`,
    icon: 'i-lucide-coins',
    color: 'text-amber-500',
  },
  {
    label: '本月消耗',
    value: overview.value?.credits.monthSpent ?? 0,
    hint: `累计 ${overview.value?.credits.totalSpent ?? 0}`,
    icon: 'i-lucide-trending-down',
    color: 'text-primary',
  },
  {
    label: '创作作品',
    value: overview.value?.counts.works ?? 0,
    hint: `${overview.value?.counts.activeWorks ?? 0} 个渲染中`,
    icon: 'i-lucide-film',
    color: 'text-sky-500',
  },
  {
    label: '模型资产',
    value: overview.value?.counts.models ?? 0,
    hint: formatBytes(overview.value?.storage.modelUsedBytes ?? 0),
    icon: 'i-lucide-cpu',
    color: 'text-violet-500',
  },
])

const storagePercent = computed(() => {
  if (!overview.value?.storage?.limitBytes)
    return 0
  return Math.min(100, Math.round((overview.value.storage.totalUsedBytes / overview.value.storage.limitBytes) * 100))
})

const visibleWorks = computed(() => (activeSection.value === 'works' ? works.value : overview.value?.recentWorks) ?? [])
const visibleLedger = computed(() => (activeSection.value === 'billing' ? ledger.value : overview.value?.recentLedger) ?? [])
const visibleModels = computed(() => (activeSection.value === 'models' ? models.value : overview.value?.recentModels) ?? [])

const cursors = reactive<Record<string, string | null>>({})
const listLoading = ref(false)

async function loadSection(section: DashboardSection, more = false) {
  if (section === 'overview' || listLoading.value)
    return
  listLoading.value = true
  try {
    const query = more && cursors[section] ? { cursor: cursors[section] } : {}
    if (section === 'billing') {
      const page = await $fetch<Page<AccountLedgerEntry>>('/api/billing/ledger', { query })
      ledger.value = more ? [...(ledger.value || []), ...page.items] : page.items
      cursors[section] = page.nextCursor
    }
    if (section === 'models') {
      const page = await $fetch<Page<ModelAssetSummary>>('/api/model-assets', { query })
      models.value = more ? [...(models.value || []), ...page.items] : page.items
      cursors[section] = page.nextCursor
    }
    if (section === 'works') {
      const page = await $fetch<Page<WorkSummary>>('/api/works', { query })
      works.value = more ? [...(works.value || []), ...page.items] : page.items
      cursors[section] = page.nextCursor
    }
  }
  catch (error) {
    if (section === 'billing')
      ledgerError.value = error
    else
      modelsError.value = error
  }
  finally {
    listLoading.value = false
  }
}

watch(activeSection, section => loadSection(section), { immediate: true })
</script>

<template>
  <div v-if="user" class="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <!-- Header Area -->
    <header class="flex flex-col gap-4 border-b border-default/70 pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="flex items-center gap-2.5">
          <h1 class="text-xl font-bold tracking-tight text-highlighted sm:text-2xl">
            我的空间
          </h1>
          <UBadge color="neutral" variant="subtle" size="sm" class="font-normal">
            {{ user.displayName || user.email }}
          </UBadge>
        </div>
        <p class="mt-1 text-xs text-muted">
          管理个人创作产物、账户额度流水、私有模型资产及存储用量
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-refresh-cw"
          :loading="status === 'pending'"
          @click="refresh()"
        >
          刷新
        </UButton>
        <UButton
          to="/studio"
          color="primary"
          size="sm"
          icon="i-lucide-sparkles"
        >
          开始创作
        </UButton>
      </div>
    </header>

    <!-- Segmented Navigation Control -->
    <nav class="flex w-fit max-w-full items-center gap-1 rounded-lg border border-default/70 bg-muted/60 p-1" aria-label="空间内容分类">
      <button
        v-for="item in sections"
        :key="item.id"
        type="button"
        class="focus-ring inline-flex min-h-8 items-center gap-2 rounded-md px-3 py-1 text-xs font-medium transition"
        :class="activeSection === item.id
          ? 'bg-elevated text-highlighted shadow-xs ring-1 ring-inset ring-default/80'
          : 'text-muted hover:bg-elevated/60 hover:text-highlighted'"
        :aria-pressed="activeSection === item.id"
        @click="selectSection(item.id)"
      >
        <UIcon :name="item.icon" class="size-3.5" />
        {{ item.label }}
      </button>
    </nav>

    <!-- Error State -->
    <UAlert
      v-if="overviewError"
      color="error"
      variant="subtle"
      icon="i-lucide-database-zap"
      title="暂时无法加载空间数据"
      description="请确认数据库迁移已完成后重试。"
    >
      <template #actions>
        <UButton size="sm" color="error" variant="soft" @click="refresh()">
          重试
        </UButton>
      </template>
    </UAlert>

    <template v-else>
      <!-- Key Metrics Strip: cohesive, zero bulky drop-shadows -->
      <div class="grid grid-cols-2 divide-y divide-default/70 rounded-xl border border-default/70 bg-elevated/50 backdrop-blur-xs sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
        <div v-for="item in stats" :key="item.label" class="p-4 transition hover:bg-elevated/80 sm:p-5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-dimmed">{{ item.label }}</span>
            <span class="flex size-7 items-center justify-center rounded-lg bg-muted/60" :class="item.color">
              <UIcon :name="item.icon" class="size-4" />
            </span>
          </div>
          <p class="mt-2 font-mono text-2xl font-semibold tracking-tight text-highlighted">
            {{ item.value }}
          </p>
          <p class="mt-1 text-[11px] text-dimmed">
            {{ item.hint }}
          </p>
        </div>
      </div>

      <!-- Tabbed Views with Smooth Micro-Animation Transition -->
      <Transition name="tab-fade" mode="out-in">
        <!-- 1. OVERVIEW VIEW -->
        <div v-if="activeSection === 'overview'" key="overview" class="space-y-6">
          <div class="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <!-- Recent Works Column -->
            <div class="rounded-xl border border-default/70 bg-elevated/40 backdrop-blur-xs">
              <div class="flex items-center justify-between border-b border-default/70 px-5 py-4">
                <div>
                  <h2 class="text-sm font-semibold text-highlighted">
                    近期作品
                  </h2>
                  <p class="text-xs text-dimmed">
                    最近生成与导出的音视频及文本内容
                  </p>
                </div>
                <UButton
                  to="/projects"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  trailing-icon="i-lucide-arrow-right"
                >
                  作品库
                </UButton>
              </div>

              <div v-if="visibleWorks.length" class="divide-y divide-default/60">
                <div
                  v-for="work in visibleWorks.slice(0, 5)"
                  :key="work.id"
                  class="flex items-center gap-3.5 px-5 py-3.5 transition hover:bg-muted/30"
                >
                  <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-dimmed">
                    <UIcon
                      :name="work.kind === 'video' ? 'i-lucide-film' : work.kind === 'text' ? 'i-lucide-book-open' : 'i-lucide-image'"
                      class="size-4"
                      :class="work.kind === 'video' ? 'text-primary' : work.kind === 'text' ? 'text-sky-500' : 'text-dimmed'"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-medium text-highlighted" :title="work.title || work.id">
                      {{ work.title || '未命名作品' }}
                    </p>
                    <p class="mt-0.5 text-[11px] text-dimmed">
                      {{ runKindLabel[work.kind] || work.kind }} · {{ formatDate(work.createdAt) }}
                    </p>
                  </div>
                  <UBadge size="xs" :color="work.availability === 'available' ? 'neutral' : 'warning'" variant="subtle" class="shrink-0">
                    {{ work.availability === 'available' ? '可用' : '待恢复' }}
                  </UBadge>
                </div>
              </div>
              <div v-else class="py-12 text-center text-xs text-muted">
                还没有生成作品，去创作台开启第一条灵感吧。
              </div>
            </div>

            <!-- Right Column: Storage & Recent Ledger -->
            <div class="space-y-6">
              <!-- Storage Health Strip -->
              <div class="rounded-xl border border-default/70 bg-elevated/40 p-5 backdrop-blur-xs">
                <div class="flex items-center justify-between">
                  <div>
                    <h2 class="text-sm font-semibold text-highlighted">
                      存储用量
                    </h2>
                    <p class="text-xs text-dimmed">
                      已占用 {{ formatBytes(overview?.storage.totalUsedBytes ?? 0) }} / 上限 {{ formatBytes(overview?.storage.limitBytes ?? 0) }}
                    </p>
                  </div>
                  <span class="font-mono text-xs font-semibold text-highlighted">
                    {{ storagePercent }}%
                  </span>
                </div>

                <!-- Progress Bar -->
                <div class="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full transition-all duration-300"
                    :class="storagePercent > 85 ? 'bg-signal-500' : 'bg-primary'"
                    :style="{ width: `${storagePercent}%` }"
                  />
                </div>

                <div class="mt-4 grid grid-cols-2 gap-3 border-t border-default/60 pt-3 text-xs">
                  <div>
                    <span class="text-dimmed">作品与素材：</span>
                    <span class="font-medium text-highlighted">{{ formatBytes(overview?.storage.mediaUsedBytes ?? 0) }}</span>
                  </div>
                  <div>
                    <span class="text-dimmed">模型资产：</span>
                    <span class="font-medium text-highlighted">{{ formatBytes(overview?.storage.modelUsedBytes ?? 0) }}</span>
                  </div>
                </div>
              </div>

              <!-- Recent Ledger Summary -->
              <div class="rounded-xl border border-default/70 bg-elevated/40 backdrop-blur-xs">
                <div class="flex items-center justify-between border-b border-default/70 px-5 py-4">
                  <div>
                    <h2 class="text-sm font-semibold text-highlighted">
                      近期额度流水
                    </h2>
                    <p class="text-xs text-dimmed">
                      实际扣减与充值记录
                    </p>
                  </div>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    trailing-icon="i-lucide-arrow-right"
                    @click="selectSection('billing')"
                  >
                    全部明细
                  </UButton>
                </div>

                <div v-if="visibleLedger.length" class="divide-y divide-default/60">
                  <div
                    v-for="entry in visibleLedger.slice(0, 4)"
                    :key="entry.id"
                    class="flex items-center justify-between gap-3 px-5 py-3 text-xs"
                  >
                    <div class="min-w-0">
                      <p class="truncate font-medium text-highlighted">
                        {{ entry.reason || entry.type }}
                      </p>
                      <p class="text-[11px] text-dimmed">
                        {{ formatDate(entry.createdAt) }}
                      </p>
                    </div>
                    <span
                      class="font-mono text-xs font-semibold tabular-nums shrink-0"
                      :class="entry.amountCredits >= 0 ? 'text-emerald-500' : 'text-signal-500'"
                    >
                      {{ entry.amountCredits >= 0 ? '+' : '' }}{{ entry.amountCredits }} 额度
                    </span>
                  </div>
                </div>
                <div v-else class="py-8 text-center text-xs text-muted">
                  暂无额度流水
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. BILLING VIEW -->
        <div v-else-if="activeSection === 'billing'" key="billing" class="rounded-xl border border-default/70 bg-elevated/40 backdrop-blur-xs">
          <div class="flex flex-col gap-2 border-b border-default/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">
                额度明细记录
              </h2>
              <p class="text-xs text-dimmed">
                展示账户完整的充值、赠送及任务生成结算流水，预留与释放不计入最终结算
              </p>
            </div>
            <UBadge color="neutral" variant="subtle" size="xs">
              可用余额 {{ overview?.credits.available ?? 0 }}
            </UBadge>
          </div>

          <UAlert v-if="ledgerError" color="warning" variant="subtle" class="m-5" icon="i-lucide-alert-triangle" title="额度流水暂不可用" description="接口返回异常，请稍后刷新重试。" />

          <div v-else-if="visibleLedger.length" class="divide-y divide-default/60">
            <div
              v-for="entry in visibleLedger"
              :key="entry.id"
              class="flex items-center justify-between gap-4 px-5 py-3.5 text-xs transition hover:bg-muted/30"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium text-highlighted">
                  {{ entry.reason || entry.type }}
                </p>
                <p class="mt-0.5 text-[11px] text-dimmed">
                  流水单号: <span class="font-mono">{{ entry.id }}</span> · {{ formatDate(entry.createdAt) }}
                </p>
              </div>
              <span
                class="font-mono text-sm font-semibold tabular-nums shrink-0"
                :class="entry.amountCredits >= 0 ? 'text-emerald-500' : 'text-signal-500'"
              >
                {{ entry.amountCredits >= 0 ? '+' : '' }}{{ entry.amountCredits }} 额度
              </span>
            </div>

            <div v-if="cursors.billing" class="p-4 text-center">
              <UButton :loading="listLoading" variant="soft" color="neutral" size="sm" @click="loadSection('billing', true)">
                加载更多流水
              </UButton>
            </div>
          </div>
          <div v-else class="py-16 text-center text-xs text-muted">
            暂无额度变动流水
          </div>
        </div>

        <!-- 3. MODELS VIEW -->
        <div v-else-if="activeSection === 'models'" key="models" class="rounded-xl border border-default/70 bg-elevated/40 backdrop-blur-xs">
          <div class="flex items-center justify-between border-b border-default/70 px-5 py-4">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">
                我的模型资产
              </h2>
              <p class="text-xs text-dimmed">
                支持管理个人上传的 Checkpoint、LoRA 及微调产物
              </p>
            </div>
            <UButton size="xs" color="neutral" variant="soft" disabled title="模型上传通道准备中">
              导入模型（即将支持）
            </UButton>
          </div>

          <UAlert v-if="modelsError" color="warning" variant="subtle" class="m-5" icon="i-lucide-alert-triangle" title="模型列表暂不可用" description="数据表准备中，请稍后刷新重试。" />

          <div v-else-if="visibleModels.length" class="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="model in visibleModels"
              :key="model.id"
              class="flex items-center gap-3 rounded-lg border border-default/70 bg-elevated/60 p-3.5 transition hover:border-default hover:bg-elevated"
            >
              <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                <UIcon name="i-lucide-cpu" class="size-4" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-xs font-medium text-highlighted" :title="model.name">
                  {{ model.name }}
                </p>
                <p class="mt-1 text-[11px] text-dimmed">
                  {{ kindLabel(model.kind) }} · {{ sourceLabel(model.source) }} · {{ formatBytes(model.sizeBytes) }}
                </p>
              </div>
              <UBadge size="xs" :color="model.status === 'ready' ? 'success' : 'warning'" variant="subtle" class="shrink-0">
                {{ modelStatusLabel(model.status) }}
              </UBadge>
            </div>

            <div v-if="cursors.models" class="col-span-full pt-2 text-center">
              <UButton :loading="listLoading" variant="soft" color="neutral" size="sm" @click="loadSection('models', true)">
                加载更多模型
              </UButton>
            </div>
          </div>

          <div v-else class="py-16 text-center">
            <div class="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted/60 text-dimmed">
              <UIcon name="i-lucide-cpu" class="size-6" />
            </div>
            <h3 class="mt-3 text-sm font-medium text-highlighted">
              还没有模型资产
            </h3>
            <p class="mx-auto mt-1 max-w-sm text-xs text-dimmed">
              用户上传、Civitai 导入和模型微调产物登记后，将在这里统一管理
            </p>
          </div>
        </div>

        <!-- 4. WORKS VIEW -->
        <div v-else-if="activeSection === 'works'" key="works" class="rounded-xl border border-default/70 bg-elevated/40 backdrop-blur-xs">
          <div class="flex items-center justify-between border-b border-default/70 px-5 py-4">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">
                我的作品列表
              </h2>
              <p class="text-xs text-dimmed">
                完整的生成作品库请前往专门的「作品库」管理页面
              </p>
            </div>
            <UButton
              to="/projects"
              color="primary"
              size="xs"
              trailing-icon="i-lucide-arrow-up-right"
            >
              打开作品库
            </UButton>
          </div>

          <div v-if="visibleWorks.length" class="divide-y divide-default/60">
            <div
              v-for="work in visibleWorks"
              :key="work.id"
              class="flex items-center gap-3.5 px-5 py-3.5 text-xs transition hover:bg-muted/30"
            >
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-dimmed">
                <UIcon
                  :name="work.kind === 'video' ? 'i-lucide-film' : work.kind === 'text' ? 'i-lucide-book-open' : 'i-lucide-image'"
                  class="size-4"
                  :class="work.kind === 'video' ? 'text-primary' : work.kind === 'text' ? 'text-sky-500' : 'text-dimmed'"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-highlighted" :title="work.title || work.id">
                  {{ work.title || '未命名作品' }}
                </p>
                <p class="mt-0.5 text-[11px] text-dimmed">
                  {{ runKindLabel[work.kind] || work.kind }} · {{ formatDate(work.createdAt) }}
                </p>
              </div>
              <UBadge size="xs" :color="work.availability === 'available' ? 'neutral' : 'warning'" variant="subtle" class="shrink-0">
                {{ work.availability === 'available' ? '可用' : '待恢复' }}
              </UBadge>
            </div>

            <div v-if="cursors.works" class="p-4 text-center">
              <UButton :loading="listLoading" variant="soft" color="neutral" size="sm" @click="loadSection('works', true)">
                加载更多作品
              </UButton>
            </div>
          </div>
          <div v-else class="py-16 text-center text-xs text-muted">
            暂无作品内容
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>
