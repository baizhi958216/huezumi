<script setup lang="ts">
import type { GenerationRecord, GenerationStatus } from '#shared/types/generation'
import { useIntervalFn } from '@vueuse/core'

type StatusFilter = 'ALL' | 'ACTIVE' | 'SUCCEEDED' | 'FAILED' | 'ARCHIVED'
type RatioFilter = 'ALL' | 'VERTICAL' | 'HORIZONTAL' | 'SQUARE'
type MediaTypeFilter = 'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'TEXT_ONLY'
type ViewMode = 'adaptive' | 'list'
type SortBy = 'newest' | 'oldest'

const { data: records, refresh, status } = await useFetch<GenerationRecord[]>('/api/generations')

const searchQuery = ref('')
const statusFilter = ref<StatusFilter>('ALL')
const ratioFilter = ref<RatioFilter>('ALL')
const providerFilter = ref('ALL')
const mediaTypeFilter = ref<MediaTypeFilter>('ALL')
const viewMode = ref<ViewMode>('adaptive')
const sortBy = ref<SortBy>('newest')

const statusItems: Array<{ key: StatusFilter, label: string, icon: string, tone: string }> = [
  { key: 'ALL', label: '全部', icon: 'i-lucide-layers-3', tone: 'neutral' },
  { key: 'ACTIVE', label: '生成中', icon: 'i-lucide-loader-circle', tone: 'signal' },
  { key: 'SUCCEEDED', label: '已完成', icon: 'i-lucide-circle-check', tone: 'success' },
  { key: 'FAILED', label: '失败', icon: 'i-lucide-circle-x', tone: 'danger' },
]

const ratioOptions: Array<{ key: RatioFilter, label: string }> = [
  { key: 'ALL', label: '所有画幅' },
  { key: 'VERTICAL', label: '竖屏 9:16' },
  { key: 'HORIZONTAL', label: '横屏 16:9' },
  { key: 'SQUARE', label: '方形 1:1' },
]

const mediaOptions: Array<{ value: MediaTypeFilter, label: string }> = [
  { value: 'ALL', label: '所有素材' },
  { value: 'IMAGE', label: '参考图 / 帧' },
  { value: 'VIDEO', label: '参考视频' },
  { value: 'AUDIO', label: '参考音频' },
  { value: 'TEXT_ONLY', label: '纯文本生成' },
]

const counts = computed(() => {
  const list = records.value || []
  return {
    total: list.length,
    active: list.filter(item => ['PENDING', 'RUNNING'].includes(item.status)).length,
    succeeded: list.filter(item => item.status === 'SUCCEEDED').length,
    failed: list.filter(item => item.status === 'FAILED').length,
    archived: list.filter(item => item.videoArchived).length,
  }
})

// 只刷新仍在供应商侧运行的任务，终态作品不会触发额外请求。
useIntervalFn(async () => {
  if (counts.value.active > 0)
    await refresh()
}, 4000)

const availableProviders = computed(() => {
  const providers = new Set<string>()
  for (const record of records.value || []) {
    if (record.provider)
      providers.add(record.provider)
  }
  return Array.from(providers).sort()
})

const filteredRecords = computed(() => {
  let list = records.value || []

  if (statusFilter.value === 'ACTIVE')
    list = list.filter(item => ['PENDING', 'RUNNING'].includes(item.status))
  else if (statusFilter.value === 'SUCCEEDED')
    list = list.filter(item => item.status === 'SUCCEEDED')
  else if (statusFilter.value === 'FAILED')
    list = list.filter(item => item.status === 'FAILED')
  else if (statusFilter.value === 'ARCHIVED')
    list = list.filter(item => item.videoArchived)

  if (ratioFilter.value === 'VERTICAL')
    list = list.filter(item => ['9:16', '3:4'].includes(item.ratio))
  else if (ratioFilter.value === 'HORIZONTAL')
    list = list.filter(item => ['16:9', '4:3', '21:9', 'adaptive'].includes(item.ratio))
  else if (ratioFilter.value === 'SQUARE')
    list = list.filter(item => item.ratio === '1:1')

  if (providerFilter.value !== 'ALL')
    list = list.filter(item => item.provider === providerFilter.value)

  if (mediaTypeFilter.value === 'IMAGE')
    list = list.filter(item => item.media?.some(media => media.type.includes('image') || media.type.includes('frame')))
  else if (mediaTypeFilter.value === 'VIDEO')
    list = list.filter(item => item.media?.some(media => media.type.includes('video')))
  else if (mediaTypeFilter.value === 'AUDIO')
    list = list.filter(item => item.media?.some(media => media.type.includes('audio')))
  else if (mediaTypeFilter.value === 'TEXT_ONLY')
    list = list.filter(item => !item.media?.length)

  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter((item) => {
      return [item.prompt, item.negativePrompt, item.id, item.model, item.provider]
        .filter(Boolean)
        .some(value => value?.toLowerCase().includes(query) ?? false)
    })
  }

  return [...list].sort((a, b) => sortBy.value === 'oldest'
    ? a.createdAt.localeCompare(b.createdAt)
    : b.createdAt.localeCompare(a.createdAt))
})

const featuredRecord = computed(() => filteredRecords.value[0])
const galleryRecords = computed(() => viewMode.value === 'adaptive' ? filteredRecords.value.slice(1) : filteredRecords.value)
const hasFilters = computed(() => Boolean(searchQuery.value.trim())
  || statusFilter.value !== 'ALL'
  || ratioFilter.value !== 'ALL'
  || providerFilter.value !== 'ALL'
  || mediaTypeFilter.value !== 'ALL')
const activeFilterCount = computed(() => [
  statusFilter.value !== 'ALL',
  ratioFilter.value !== 'ALL',
  providerFilter.value !== 'ALL',
  mediaTypeFilter.value !== 'ALL',
].filter(Boolean).length)

const detailModalOpen = ref(false)
const selectedRecord = ref<GenerationRecord>()
const currentIndex = computed(() => selectedRecord.value
  ? filteredRecords.value.findIndex(item => item.id === selectedRecord.value?.id)
  : -1)

const latestCreatedAt = computed(() => records.value?.[0]?.createdAt)

function selectStatus(key: StatusFilter) {
  statusFilter.value = statusFilter.value === key && key !== 'ALL' ? 'ALL' : key
}

function resetFilters() {
  searchQuery.value = ''
  statusFilter.value = 'ALL'
  ratioFilter.value = 'ALL'
  providerFilter.value = 'ALL'
  mediaTypeFilter.value = 'ALL'
}

function openDetail(record: GenerationRecord) {
  selectedRecord.value = record
  detailModalOpen.value = true
}

function handlePrev() {
  if (currentIndex.value > 0)
    selectedRecord.value = filteredRecords.value[currentIndex.value - 1]
}

function handleNext() {
  if (currentIndex.value >= 0 && currentIndex.value < filteredRecords.value.length - 1)
    selectedRecord.value = filteredRecords.value[currentIndex.value + 1]
}

async function refreshRecord(record: GenerationRecord) {
  const updated = await $fetch<GenerationRecord>(`/api/generations/${record.id}?refresh=1`)
  const index = records.value?.findIndex(item => item.id === record.id) ?? -1
  if (records.value && index >= 0)
    records.value[index] = updated
  if (selectedRecord.value?.id === record.id)
    selectedRecord.value = updated
}

function formatDate(value?: string, withYear = false) {
  if (!value)
    return '尚未同步'
  return new Intl.DateTimeFormat('zh-CN', {
    ...(withYear ? { year: 'numeric' as const } : {}),
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function ratioStyle(record?: GenerationRecord) {
  const ratio = record?.usage?.ratio || record?.ratio || '16:9'
  if (ratio === 'adaptive')
    return '16 / 9'
  return ratio.replace(':', ' / ')
}

function ratioLabel(record: GenerationRecord) {
  const ratio = record.usage?.ratio || record.ratio
  if (ratio === '9:16' || ratio === '3:4')
    return '竖屏'
  if (ratio === '1:1')
    return '方形'
  return '横屏'
}

function statusLabel(record: GenerationRecord) {
  const labels: Record<GenerationStatus, string> = {
    PENDING: '排队中',
    RUNNING: '生成中',
    SUCCEEDED: '已完成',
    FAILED: '生成失败',
    UNKNOWN: '状态未知',
  }
  return labels[record.status]
}
</script>

<template>
  <div class="projects-page">
    <div class="projects-page__glow projects-page__glow--top" aria-hidden="true" />
    <div class="projects-page__glow projects-page__glow--side" aria-hidden="true" />

    <div class="projects-shell">
      <header class="library-hero">
        <div class="library-hero__copy">
          <div class="library-eyebrow">
            <span class="library-eyebrow__mark" />
            <span>YOUR GENERATION LIBRARY</span>
            <span v-if="counts.active" class="library-live-pill">
              <span class="library-live-pill__dot" />
              {{ counts.active }} 个任务正在生成
            </span>
          </div>
          <h1 class="library-hero__title">
            把每一次灵感，<br><em>留在画面里。</em>
          </h1>
          <p class="library-hero__description">
            这里收纳你的每一次生成。浏览成片，回看提示词，也可以随时把一条灵感带回创作台继续打磨。
          </p>
        </div>

        <div class="library-hero__aside">
          <div class="library-hero__updated">
            <UIcon name="i-lucide-history" class="size-3.5" />
            <span>最近同步</span>
            <strong>{{ formatDate(latestCreatedAt) }}</strong>
          </div>
          <div class="library-hero__total">
            <strong>{{ counts.total }}</strong>
            <span>个生成任务</span>
          </div>
          <div class="library-hero__actions">
            <button
              type="button"
              class="library-icon-button"
              title="刷新作品库"
              :disabled="status === 'pending'"
              @click="refresh()"
            >
              <UIcon name="i-lucide-refresh-cw" class="size-4" :class="[{ 'animate-spin': status === 'pending' }]" />
            </button>
            <NuxtLink to="/studio" class="library-primary-button">
              <UIcon name="i-lucide-plus" class="size-4" />
              新建作品
            </NuxtLink>
          </div>
        </div>
      </header>

      <nav class="library-statusbar" aria-label="作品状态筛选">
        <button
          v-for="item in statusItems"
          :key="item.key"
          type="button"
          class="library-statusbar__item"
          :class="{ 'is-active': statusFilter === item.key }"
          @click="selectStatus(item.key)"
        >
          <UIcon :name="item.icon" class="library-statusbar__icon" :class="`is-${item.tone}`" />
          <span class="library-statusbar__label">{{ item.label }}</span>
          <strong>{{ item.key === 'ALL' ? counts.total : item.key === 'ACTIVE' ? counts.active : item.key === 'SUCCEEDED' ? counts.succeeded : counts.failed }}</strong>
        </button>
        <div class="library-statusbar__spacer" />
        <button
          type="button"
          class="library-statusbar__archive"
          :class="{ 'is-active': statusFilter === 'ARCHIVED' }"
          @click="selectStatus('ARCHIVED')"
        >
          <UIcon name="i-lucide-cloud-check" class="size-4" />
          <span>已归档</span>
          <strong>{{ counts.archived }}</strong>
        </button>
      </nav>

      <section class="library-toolbar" aria-label="作品检索与筛选">
        <div class="library-search">
          <UIcon name="i-lucide-search" class="library-search__icon size-4" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="搜索提示词、模型或任务 ID"
            aria-label="搜索作品"
          >
          <button v-if="searchQuery" type="button" class="library-search__clear" aria-label="清除搜索" @click="searchQuery = ''">
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
          <kbd>⌘ K</kbd>
        </div>

        <div class="library-toolbar__controls">
          <div class="library-segmented" aria-label="按画幅筛选">
            <button
              v-for="option in ratioOptions"
              :key="option.key"
              type="button"
              :class="{ 'is-active': ratioFilter === option.key }"
              @click="ratioFilter = option.key"
            >
              {{ option.label }}
            </button>
          </div>

          <label v-if="availableProviders.length > 1" class="library-select">
            <span class="sr-only">选择平台</span>
            <select v-model="providerFilter" aria-label="按平台筛选">
              <option value="ALL">所有平台</option>
              <option v-for="provider in availableProviders" :key="provider" :value="provider">
                {{ provider }}
              </option>
            </select>
            <UIcon name="i-lucide-chevron-down" class="size-3.5" />
          </label>

          <label class="library-select library-select--media">
            <span class="sr-only">选择素材类型</span>
            <select v-model="mediaTypeFilter" aria-label="按素材类型筛选">
              <option v-for="option in mediaOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <UIcon name="i-lucide-chevron-down" class="size-3.5" />
          </label>

          <label class="library-select library-select--sort">
            <span class="sr-only">选择排序</span>
            <select v-model="sortBy" aria-label="选择排序">
              <option value="newest">最新创建</option>
              <option value="oldest">最早创建</option>
            </select>
            <UIcon name="i-lucide-arrow-down-up" class="size-3.5" />
          </label>

          <div class="library-view-toggle" aria-label="切换视图">
            <button type="button" :class="{ 'is-active': viewMode === 'adaptive' }" title="画廊视图" @click="viewMode = 'adaptive'">
              <UIcon name="i-lucide-layout-grid" class="size-4" />
            </button>
            <button type="button" :class="{ 'is-active': viewMode === 'list' }" title="列表视图" @click="viewMode = 'list'">
              <UIcon name="i-lucide-list" class="size-4" />
            </button>
          </div>
        </div>

        <div v-if="hasFilters" class="library-toolbar__status">
          <UIcon name="i-lucide-sliders-horizontal" class="size-3.5" />
          <span>当前筛选 {{ activeFilterCount ? `${activeFilterCount} 项` : '' }}{{ searchQuery ? ` · “${searchQuery}”` : '' }}</span>
          <button type="button" @click="resetFilters">
            清除全部
          </button>
        </div>
      </section>

      <template v-if="filteredRecords.length">
        <section v-if="viewMode === 'adaptive' && featuredRecord" class="library-featured">
          <div class="library-featured__media" @click="openDetail(featuredRecord)">
            <div class="library-featured__frame" :style="{ aspectRatio: ratioStyle(featuredRecord) }">
              <video
                v-if="featuredRecord.videoUrl"
                :src="featuredRecord.videoUrl"
                muted
                playsinline
                loop
                autoplay
                @click.stop="openDetail(featuredRecord)"
              />
              <div v-else class="library-featured__placeholder">
                <UIcon :name="featuredRecord.status === 'FAILED' ? 'i-lucide-circle-x' : 'i-lucide-loader-circle'" class="size-5" :class="[{ 'animate-spin': featuredRecord.status !== 'FAILED' }]" />
                <span>{{ featuredRecord.status === 'FAILED' ? '生成失败' : '正在渲染' }}</span>
              </div>
            </div>
            <div class="library-featured__scrim" />
            <div class="library-featured__topline">
              <span class="library-featured__index">01 / {{ filteredRecords.length.toString().padStart(2, '0') }}</span>
              <span class="library-chip library-chip--light">{{ ratioLabel(featuredRecord) }} {{ featuredRecord.ratio }}</span>
            </div>
            <div class="library-featured__play">
              <UIcon name="i-lucide-play" class="size-5" />
            </div>
            <div class="library-featured__bottomline">
              <span>{{ featuredRecord.videoUrl ? '点击检视完整画面' : statusLabel(featuredRecord) }}</span>
              <span v-if="featuredRecord.videoArchived"><UIcon name="i-lucide-cloud-check" class="size-3.5" /> 已归档</span>
            </div>
          </div>

          <div class="library-featured__details">
            <div class="library-featured__eyebrow">
              <span class="library-featured__eyebrow-line" />
              最近生成
            </div>
            <div class="library-featured__heading">
              <span class="library-chip" :class="`library-chip--${featuredRecord.status === 'SUCCEEDED' ? 'success' : featuredRecord.status === 'FAILED' ? 'danger' : 'signal'}`">
                {{ statusLabel(featuredRecord) }}
              </span>
              <span class="library-featured__date">{{ formatDate(featuredRecord.createdAt, true) }}</span>
            </div>
            <h2>{{ featuredRecord.prompt || '参考素材生成' }}</h2>
            <p class="library-featured__hint">
              {{ featuredRecord.model || '默认模型' }} · {{ featuredRecord.provider }} · {{ featuredRecord.mode === 'text' ? '文字生成' : '多模态生成' }}
            </p>

            <div class="library-featured__specs">
              <div><span>画幅</span><strong>{{ featuredRecord.ratio }}</strong></div>
              <div><span>清晰度</span><strong>{{ featuredRecord.resolution }}</strong></div>
              <div><span>时长</span><strong>{{ featuredRecord.duration === -1 ? '智能' : `${featuredRecord.duration}s` }}</strong></div>
            </div>

            <div class="library-featured__footer">
              <div class="library-reference-count">
                <span class="library-reference-count__stack">
                  <span v-for="index in Math.min(featuredRecord.media?.length || 0, 3)" :key="index" class="library-reference-count__dot" :class="`is-${index}`">
                    <UIcon name="i-lucide-image" class="size-3.5" />
                  </span>
                  <span v-if="!featuredRecord.media?.length" class="library-reference-count__dot library-reference-count__dot--empty"><UIcon name="i-lucide-type" class="size-3" /></span>
                </span>
                <span>{{ featuredRecord.media?.length ? `${featuredRecord.media.length} 份参考素材` : '纯文本生成' }}</span>
              </div>
              <button type="button" class="library-text-button" @click="openDetail(featuredRecord)">
                检视作品 <UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
              </button>
            </div>
          </div>
        </section>

        <section class="library-gallery">
          <div class="library-section-heading">
            <div>
              <div class="library-eyebrow">
                ALL WORKS <span class="library-section-heading__count">{{ filteredRecords.length }}</span>
              </div>
              <h2>{{ hasFilters ? '筛选结果' : '全部作品' }}</h2>
            </div>
            <p v-if="viewMode === 'adaptive' && featuredRecord && galleryRecords.length">
              向下浏览更多生成结果
            </p>
            <p v-else-if="viewMode === 'list'">
              按创建时间排列
            </p>
          </div>

          <div v-if="viewMode === 'adaptive' && galleryRecords.length" class="library-gallery__grid">
            <GenerationCard
              v-for="record in galleryRecords"
              :key="record.id"
              :record="record"
              @select="openDetail"
            />
          </div>

          <div v-else-if="viewMode === 'list'" class="library-list">
            <button v-for="record in filteredRecords" :key="record.id" type="button" class="library-list__row" @click="openDetail(record)">
              <div class="library-list__thumb" :style="{ aspectRatio: ratioStyle(record) }">
                <video v-if="record.videoUrl" :src="record.videoUrl" muted playsinline autoplay />
                <UIcon v-else :name="record.status === 'FAILED' ? 'i-lucide-circle-x' : 'i-lucide-loader-circle'" class="size-4" :class="[{ 'animate-spin': record.status !== 'FAILED' }]" />
              </div>
              <div class="library-list__prompt">
                <strong>{{ record.prompt || '参考素材生成' }}</strong>
                <span>{{ record.model || '默认模型' }} · {{ record.provider }}</span>
              </div>
              <div class="library-list__meta">
                <strong>{{ record.ratio }}</strong><span>{{ record.resolution }} · {{ record.duration === -1 ? '智能' : `${record.duration}s` }}</span>
              </div>
              <span class="library-chip" :class="`library-chip--${record.status === 'SUCCEEDED' ? 'success' : record.status === 'FAILED' ? 'danger' : 'signal'}`">{{ statusLabel(record) }}</span>
              <div class="library-list__date">
                {{ formatDate(record.createdAt) }}
              </div>
              <UIcon name="i-lucide-arrow-up-right" class="library-list__arrow size-4" />
            </button>
          </div>

          <div v-else-if="viewMode === 'adaptive' && featuredRecord" class="library-gallery__single-note">
            <UIcon name="i-lucide-sparkles" class="size-5" />
            这是当前筛选下的唯一作品，点击上方主视图检视详情。
          </div>
        </section>
      </template>

      <section v-else-if="records?.length" class="library-empty library-empty--filtered">
        <div class="library-empty__icon">
          <UIcon name="i-lucide-search-x" class="size-5" />
        </div>
        <div><h2>没有匹配的作品</h2><p>换个关键词，或清除筛选条件试试看。</p></div>
        <button type="button" class="library-secondary-button" @click="resetFilters">
          清除筛选
        </button>
      </section>

      <section v-else class="library-empty">
        <div class="library-empty__visual">
          <UIcon name="i-lucide-film" class="size-5" />
          <UIcon name="i-lucide-sparkles" class="size-5" />
        </div>
        <div><h2>你的第一部作品，正在等你开始</h2><p>从一段文字、一个画面或一份参考素材开始，让灵感变成可以播放的故事。</p></div>
        <NuxtLink to="/studio" class="library-primary-button">
          <UIcon name="i-lucide-plus" class="size-4" />进入创作台
        </NuxtLink>
      </section>
    </div>

    <GenerationDetailModal
      v-model:open="detailModalOpen"
      :record="selectedRecord"
      :current-index="currentIndex"
      :total-count="filteredRecords.length"
      @prev="handlePrev"
      @next="handleNext"
      @refresh="refreshRecord"
    />
  </div>
</template>

<style scoped>
.projects-page {
  --library-surface: color-mix(in srgb, var(--ui-bg-elevated) 84%, transparent);
  --library-surface-strong: color-mix(in srgb, var(--ui-bg-elevated) 94%, transparent);
  --library-line: color-mix(in srgb, var(--ui-border) 76%, transparent);
  --library-line-soft: color-mix(in srgb, var(--ui-border-muted) 74%, transparent);
  --library-ink: var(--ui-text-highlighted);
  --library-muted: var(--ui-text-muted);
  --library-dim: var(--ui-text-dimmed);
  position: relative;
  min-height: calc(100svh - 92px);
  overflow: hidden;
  background:
    radial-gradient(circle at 7% -8%, color-mix(in srgb, var(--color-signal-500) 10%, transparent), transparent 26rem),
    radial-gradient(circle at 95% 25%, color-mix(in srgb, #7c5cff 7%, transparent), transparent 30rem), var(--ui-bg);
  color: var(--library-ink);
}

.dark .projects-page {
  --library-surface: rgb(20 22 27 / 78%);
  --library-surface-strong: #17191f;
  --library-line: rgb(255 255 255 / 12%);
  --library-line-soft: rgb(255 255 255 / 8%);
  background:
    radial-gradient(circle at 7% -8%, rgb(255 77 53 / 13%), transparent 26rem),
    radial-gradient(circle at 95% 25%, rgb(124 92 255 / 9%), transparent 30rem), #0a0b0f;
}
.projects-page__glow {
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
}
.projects-page__glow--top {
  top: 1.5rem;
  right: 11%;
  width: 0.45rem;
  height: 0.45rem;
  background: var(--color-signal-500);
  box-shadow: 0 0 2rem 0.65rem rgb(255 77 53 / 18%);
}
.projects-page__glow--side {
  top: 33rem;
  left: -6rem;
  width: 15rem;
  height: 15rem;
  border: 1px solid color-mix(in srgb, var(--color-signal-500) 16%, transparent);
  opacity: 0.65;
}
.projects-shell {
  position: relative;
  z-index: 1;
  width: min(100% - 2.5rem, 92rem);
  margin: 0 auto;
  padding: 2.25rem 0 5rem;
}

.library-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 3rem;
  padding: 2.2rem 0 2.6rem;
}
.library-hero__copy {
  max-width: 54rem;
}
.library-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--library-dim);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  line-height: 1.4;
  text-transform: uppercase;
}
.library-eyebrow__mark {
  width: 1.6rem;
  height: 1px;
  background: var(--color-signal-500);
  box-shadow: 0 0 0.75rem rgb(255 77 53 / 45%);
}
.library-live-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: 0.55rem;
  padding: 0.25rem 0.55rem;
  border: 1px solid color-mix(in srgb, var(--color-signal-500) 24%, transparent);
  border-radius: 999px;
  color: var(--color-signal-400);
  font-size: 0.65rem;
  letter-spacing: 0;
  text-transform: none;
}
.library-live-pill__dot {
  width: 0.35rem;
  height: 0.35rem;
  border-radius: 50%;
  background: var(--color-signal-500);
  box-shadow: 0 0 0.5rem var(--color-signal-500);
}
.library-hero__title {
  max-width: 12em;
  margin-top: 1.1rem;
  color: var(--library-ink);
  font-size: clamp(2.3rem, 5vw, 4.9rem);
  font-weight: 650;
  letter-spacing: -0.065em;
  line-height: 1.06;
}
.library-hero__title em {
  color: var(--color-signal-500);
  font-style: normal;
}
.library-hero__description {
  max-width: 35rem;
  margin-top: 1.25rem;
  color: var(--library-muted);
  font-size: 0.98rem;
  line-height: 1.8;
}
.library-hero__aside {
  display: grid;
  flex: none;
  min-width: 16rem;
  gap: 0.75rem;
  padding-bottom: 0.15rem;
}
.library-hero__updated,
.library-hero__total {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--library-dim);
  font-size: 0.74rem;
}
.library-hero__updated > span:first-child {
  color: var(--color-signal-500);
}
.library-hero__updated strong {
  margin-left: auto;
  color: var(--library-muted);
  font-weight: 550;
}
.library-hero__total strong {
  color: var(--library-ink);
  font-size: 2.2rem;
  font-weight: 650;
  letter-spacing: -0.05em;
  line-height: 1;
}
.library-hero__total span {
  align-self: flex-end;
  margin-bottom: 0.1rem;
}
.library-hero__actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.55rem;
}
.library-icon-button,
.library-primary-button,
.library-secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.65rem;
  border-radius: 0.65rem;
  font-size: 0.78rem;
  font-weight: 650;
  transition:
    transform 180ms var(--ease-cinematic),
    border-color 180ms ease,
    background 180ms ease,
    color 180ms ease;
}
.library-icon-button {
  width: 2.65rem;
  border: 1px solid var(--library-line);
  background: var(--library-surface);
  color: var(--library-muted);
}
.library-icon-button:hover {
  border-color: var(--color-signal-500);
  color: var(--library-ink);
  transform: translateY(-1px);
}
.library-icon-button:disabled {
  cursor: wait;
  opacity: 0.6;
}
.library-primary-button {
  gap: 0.5rem;
  padding: 0 1rem;
  background: var(--color-signal-500);
  color: white;
  box-shadow: 0 0.7rem 1.5rem -0.75rem rgb(255 77 53 / 70%);
}
.library-primary-button:hover {
  background: var(--color-signal-400);
  transform: translateY(-1px);
}
.library-secondary-button {
  padding: 0 0.95rem;
  border: 1px solid var(--library-line);
  background: var(--library-surface);
  color: var(--library-ink);
}
.library-secondary-button:hover {
  border-color: var(--color-signal-500);
}

.library-statusbar {
  display: flex;
  align-items: stretch;
  min-height: 4.8rem;
  padding: 0.35rem;
  border: 1px solid var(--library-line);
  border-radius: 1rem;
  background: var(--library-surface);
  box-shadow: 0 1rem 3rem -2rem rgb(0 0 0 / 45%);
  backdrop-filter: blur(18px);
}
.library-statusbar__item,
.library-statusbar__archive {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  min-width: 9.25rem;
  gap: 0.65rem;
  padding: 0.65rem 1rem;
  border-radius: 0.7rem;
  color: var(--library-dim);
  text-align: left;
  transition:
    background 180ms ease,
    color 180ms ease,
    transform 180ms var(--ease-cinematic);
}
.library-statusbar__item:hover,
.library-statusbar__archive:hover {
  background: color-mix(in srgb, var(--library-surface-strong) 70%, transparent);
  color: var(--library-ink);
}
.library-statusbar__item.is-active {
  background: var(--library-surface-strong);
  color: var(--library-ink);
  box-shadow: inset 0 0 0 1px var(--library-line-soft);
}
.library-statusbar__archive.is-active {
  background: color-mix(in srgb, var(--color-signal-500) 10%, var(--library-surface-strong));
  color: var(--color-signal-400);
}
.library-statusbar__icon {
  font-size: 1rem;
}
.library-statusbar__icon.is-signal {
  color: var(--color-signal-500);
}
.library-statusbar__icon.is-success {
  color: #35c98a;
}
.library-statusbar__icon.is-danger {
  color: #fb7185;
}
.library-statusbar__label {
  font-size: 0.8rem;
  font-weight: 550;
}
.library-statusbar strong {
  color: var(--library-ink);
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -0.04em;
}
.library-statusbar__spacer {
  flex: 1;
  border-left: 1px solid var(--library-line-soft);
  margin: 0.65rem 0;
}
.library-statusbar__archive {
  min-width: 9rem;
  color: var(--library-dim);
}
.library-statusbar__archive > span:first-child {
  color: #35c98a;
}

.library-toolbar {
  position: sticky;
  z-index: 10;
  top: 0.5rem;
  display: grid;
  grid-template-columns: minmax(16rem, 1fr) auto;
  gap: 0.8rem;
  align-items: center;
  margin-top: 1.15rem;
  padding: 0.65rem;
  border: 1px solid var(--library-line);
  border-radius: 0.95rem;
  background: color-mix(in srgb, var(--ui-bg) 72%, transparent);
  box-shadow: 0 1rem 2rem -1.4rem rgb(0 0 0 / 55%);
  backdrop-filter: blur(20px);
}
.library-search {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 2.85rem;
  border: 1px solid transparent;
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--library-surface-strong) 76%, transparent);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}
.library-search:focus-within {
  border-color: color-mix(in srgb, var(--color-signal-500) 62%, transparent);
  box-shadow: 0 0 0 3px rgb(255 77 53 / 9%);
}
.library-search__icon {
  margin-left: 0.9rem;
  color: var(--library-dim);
  font-size: 1rem;
}
.library-search input {
  width: 100%;
  height: 2.85rem;
  padding: 0 3.5rem 0 0.65rem;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--library-ink);
  font-size: 0.8rem;
}
.library-search input::placeholder {
  color: var(--library-dim);
}
.library-search kbd {
  position: absolute;
  right: 0.75rem;
  padding: 0.2rem 0.35rem;
  border: 1px solid var(--library-line);
  border-radius: 0.3rem;
  color: var(--library-dim);
  font-family: inherit;
  font-size: 0.63rem;
}
.library-search__clear {
  position: absolute;
  right: 0.8rem;
  color: var(--library-dim);
  font-size: 0.85rem;
}
.library-search__clear + kbd {
  display: none;
}
.library-toolbar__controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.library-segmented,
.library-view-toggle {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem;
  border: 1px solid var(--library-line);
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--library-surface-strong) 74%, transparent);
}
.library-segmented button {
  min-height: 2.15rem;
  padding: 0 0.65rem;
  border-radius: 0.45rem;
  color: var(--library-dim);
  font-size: 0.7rem;
  font-weight: 550;
  white-space: nowrap;
}
.library-segmented button:hover {
  color: var(--library-ink);
}
.library-segmented button.is-active {
  background: var(--library-ink);
  color: var(--ui-bg);
}
.dark .library-segmented button.is-active {
  background: #f3f4f6;
  color: #101116;
}
.library-select {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.library-select select {
  min-height: 2.55rem;
  max-width: 9.2rem;
  padding: 0 2rem 0 0.75rem;
  border: 1px solid var(--library-line);
  border-radius: 0.6rem;
  outline: 0;
  appearance: none;
  background: color-mix(in srgb, var(--library-surface-strong) 74%, transparent);
  color: var(--library-muted);
  font-size: 0.7rem;
}
.library-select select:focus {
  border-color: var(--color-signal-500);
}
.library-select > span:not(.sr-only) {
  position: absolute;
  right: 0.65rem;
  pointer-events: none;
  color: var(--library-dim);
  font-size: 0.75rem;
}
.library-select--sort select {
  max-width: 7.8rem;
}
.library-view-toggle {
  margin-left: 0.1rem;
}
.library-view-toggle button {
  display: grid;
  width: 2.15rem;
  height: 2.15rem;
  place-items: center;
  border-radius: 0.45rem;
  color: var(--library-dim);
}
.library-view-toggle button:hover {
  color: var(--library-ink);
}
.library-view-toggle button.is-active {
  background: var(--library-surface-strong);
  color: var(--library-ink);
  box-shadow: inset 0 0 0 1px var(--library-line-soft);
}
.library-toolbar__status {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.55rem 0.1rem;
  border-top: 1px solid var(--library-line-soft);
  color: var(--library-dim);
  font-size: 0.7rem;
}
.library-toolbar__status > span:first-child {
  color: var(--color-signal-500);
}
.library-toolbar__status button {
  margin-left: auto;
  color: var(--color-signal-400);
  font-weight: 600;
}

.library-featured {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(20rem, 0.65fr);
  min-height: 29rem;
  margin-top: 2.1rem;
  overflow: hidden;
  border: 1px solid var(--library-line);
  border-radius: 1.25rem;
  background: var(--library-surface);
  box-shadow: 0 2rem 4rem -2.5rem rgb(0 0 0 / 65%);
}
.library-featured__media {
  position: relative;
  display: flex;
  min-height: 24rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 1.5rem;
  background: #090a0d;
  cursor: pointer;
}
.dark .library-featured__media {
  background: #050608;
}
.library-featured__media::before {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, rgb(255 255 255 / 8%), transparent 55%);
  content: '';
  pointer-events: none;
}
.library-featured__frame {
  position: relative;
  z-index: 1;
  display: flex;
  width: auto;
  height: 100%;
  max-width: 100%;
  max-height: 26rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.75rem;
  box-shadow: 0 2rem 4rem -1rem rgb(0 0 0 / 70%);
}
.library-featured__frame video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.library-featured__placeholder {
  display: grid;
  min-width: 17rem;
  min-height: 12rem;
  place-items: center;
  gap: 0.7rem;
  color: var(--library-dim);
  font-size: 0.8rem;
}
.library-featured__placeholder span:first-child {
  color: var(--color-signal-500);
  font-size: 1.8rem;
}
.library-featured__scrim {
  position: absolute;
  z-index: 2;
  inset: 0;
  background: linear-gradient(180deg, rgb(0 0 0 / 30%), transparent 25%, transparent 72%, rgb(0 0 0 / 72%));
  pointer-events: none;
}
.library-featured__topline,
.library-featured__bottomline {
  position: absolute;
  z-index: 3;
  right: 1.5rem;
  left: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgb(255 255 255 / 78%);
  font-size: 0.68rem;
}
.library-featured__topline {
  top: 1.25rem;
}
.library-featured__bottomline {
  bottom: 1.2rem;
}
.library-featured__bottomline > span:last-child {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: #8ee8bd;
}
.library-featured__index {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.08em;
}
.library-featured__play {
  position: absolute;
  z-index: 4;
  display: grid;
  width: 4rem;
  height: 4rem;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 28%);
  border-radius: 50%;
  background: rgb(10 11 14 / 45%);
  color: white;
  font-size: 1.25rem;
  backdrop-filter: blur(10px);
  transition:
    transform 240ms var(--ease-cinematic),
    background 180ms ease,
    border-color 180ms ease;
}
.library-featured__play span {
  margin-left: 0.15rem;
}
.library-featured__media:hover .library-featured__play {
  border-color: var(--color-signal-400);
  background: var(--color-signal-500);
  transform: scale(1.08);
}

.library-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  width: fit-content;
  padding: 0.28rem 0.52rem;
  border: 1px solid var(--library-line);
  border-radius: 0.4rem;
  color: var(--library-muted);
  font-size: 0.65rem;
  font-weight: 650;
  line-height: 1.2;
}
.library-chip--light {
  border-color: rgb(255 255 255 / 16%);
  background: rgb(0 0 0 / 35%);
  color: rgb(255 255 255 / 88%);
}
.library-chip--success {
  border-color: rgb(53 201 138 / 24%);
  background: rgb(53 201 138 / 10%);
  color: #53dba0;
}
.library-chip--danger {
  border-color: rgb(251 113 133 / 25%);
  background: rgb(251 113 133 / 10%);
  color: #fb8ca0;
}
.library-chip--signal {
  border-color: color-mix(in srgb, var(--color-signal-500) 25%, transparent);
  background: color-mix(in srgb, var(--color-signal-500) 10%, transparent);
  color: var(--color-signal-400);
}
.library-featured__details {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 2.5rem clamp(1.5rem, 4vw, 3.5rem);
}
.library-featured__eyebrow {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--library-dim);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.library-featured__eyebrow-line {
  width: 1.3rem;
  height: 1px;
  background: var(--color-signal-500);
}
.library-featured__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-top: 1.5rem;
}
.library-featured__date {
  color: var(--library-dim);
  font-size: 0.7rem;
  white-space: nowrap;
}
.library-featured__details h2 {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 1.15rem;
  color: var(--library-ink);
  font-size: clamp(1.15rem, 2vw, 1.7rem);
  font-weight: 600;
  letter-spacing: -0.035em;
  line-height: 1.48;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}
.library-featured__hint {
  margin-top: 0.8rem;
  color: var(--library-dim);
  font-size: 0.72rem;
}
.library-featured__specs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.45rem;
  margin-top: 2rem;
  padding-block: 1rem;
  border-top: 1px solid var(--library-line-soft);
  border-bottom: 1px solid var(--library-line-soft);
}
.library-featured__specs div {
  display: grid;
  gap: 0.32rem;
}
.library-featured__specs span {
  color: var(--library-dim);
  font-size: 0.68rem;
}
.library-featured__specs strong {
  color: var(--library-ink);
  font-size: 0.78rem;
  font-weight: 600;
}
.library-featured__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1.7rem;
}
.library-reference-count {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--library-muted);
  font-size: 0.7rem;
}
.library-reference-count__stack {
  display: flex;
  padding-left: 0.25rem;
}
.library-reference-count__dot {
  display: grid;
  width: 1.45rem;
  height: 1.45rem;
  margin-left: -0.25rem;
  place-items: center;
  border: 2px solid var(--library-surface-strong);
  border-radius: 50%;
  background: #40322f;
  color: #ffd2c5;
  font-size: 0.62rem;
}
.library-reference-count__dot.is-1 {
  background: #303746;
  color: #bdd4ff;
}
.library-reference-count__dot.is-2 {
  background: #313a31;
  color: #b7e8c8;
}
.library-reference-count__dot--empty {
  background: color-mix(in srgb, var(--library-line) 60%, transparent);
  color: var(--library-dim);
}
.library-text-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-signal-400);
  font-size: 0.75rem;
  font-weight: 650;
  white-space: nowrap;
}
.library-text-button:hover {
  color: var(--color-signal-300);
}
.library-text-button span {
  transition: transform 180ms var(--ease-cinematic);
}
.library-text-button:hover span {
  transform: translate(2px, -2px);
}

.library-gallery {
  margin-top: 3.5rem;
}
.library-section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 1.3rem;
}
.library-section-heading h2 {
  margin-top: 0.45rem;
  color: var(--library-ink);
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: -0.035em;
}
.library-section-heading__count {
  display: inline-flex;
  min-width: 1.4rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
  margin-left: 0.3rem;
  padding-inline: 0.3rem;
  border: 1px solid var(--library-line);
  border-radius: 0.3rem;
  color: var(--library-muted);
  font-size: 0.62rem;
  letter-spacing: 0;
}
.library-section-heading > p {
  color: var(--library-dim);
  font-size: 0.7rem;
}
.library-gallery__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  align-items: start;
}
.library-gallery__single-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1.3rem;
  border: 1px dashed var(--library-line);
  border-radius: 0.8rem;
  color: var(--library-dim);
  font-size: 0.72rem;
}
.library-gallery__single-note span {
  color: var(--color-signal-500);
}

.library-list {
  overflow: hidden;
  border: 1px solid var(--library-line);
  border-radius: 0.95rem;
  background: var(--library-surface);
}
.library-list__row {
  display: grid;
  grid-template-columns: 5.3rem minmax(16rem, 1fr) 8.5rem 6.5rem 9rem auto;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid var(--library-line-soft);
  text-align: left;
  transition: background 180ms ease;
}
.library-list__row:last-child {
  border-bottom: 0;
}
.library-list__row:hover {
  background: color-mix(in srgb, var(--library-surface-strong) 80%, transparent);
}
.library-list__thumb {
  display: flex;
  width: 4.5rem;
  height: 3.2rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 0.45rem;
  background: #090a0d;
  color: var(--library-dim);
}
.library-list__thumb video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.library-list__prompt,
.library-list__meta {
  display: grid;
  min-width: 0;
  gap: 0.3rem;
}
.library-list__prompt strong {
  overflow: hidden;
  color: var(--library-ink);
  font-size: 0.75rem;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library-list__prompt span,
.library-list__meta span,
.library-list__date {
  overflow: hidden;
  color: var(--library-dim);
  font-size: 0.67rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.library-list__meta strong {
  color: var(--library-ink);
  font-size: 0.75rem;
  font-weight: 600;
}
.library-list__date {
  text-align: right;
}
.library-list__arrow {
  color: var(--library-dim);
  transition:
    color 180ms ease,
    transform 180ms var(--ease-cinematic);
}
.library-list__row:hover .library-list__arrow {
  color: var(--color-signal-400);
  transform: translate(2px, -2px);
}

.library-empty {
  display: grid;
  justify-items: center;
  gap: 1.2rem;
  margin-top: 2.1rem;
  padding: 6rem 1.5rem;
  border: 1px dashed var(--library-line);
  border-radius: 1.25rem;
  background: color-mix(in srgb, var(--library-surface) 60%, transparent);
  text-align: center;
}
.library-empty--filtered {
  grid-template-columns: auto auto auto;
  justify-content: center;
  gap: 1rem;
  padding: 2.2rem;
  text-align: left;
}
.library-empty__icon {
  display: grid;
  width: 3.4rem;
  height: 3.4rem;
  place-items: center;
  border-radius: 1rem;
  background: color-mix(in srgb, var(--color-signal-500) 10%, transparent);
  color: var(--color-signal-500);
  font-size: 1.35rem;
}
.library-empty h2 {
  color: var(--library-ink);
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.025em;
}
.library-empty p {
  max-width: 28rem;
  margin-top: 0.35rem;
  color: var(--library-muted);
  font-size: 0.78rem;
  line-height: 1.7;
}
.library-empty__visual {
  position: relative;
  display: grid;
  width: 4.5rem;
  height: 4.5rem;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--color-signal-500) 25%, transparent);
  border-radius: 1.2rem;
  background: color-mix(in srgb, var(--color-signal-500) 8%, transparent);
  color: var(--color-signal-500);
  font-size: 1.6rem;
}
.library-empty__visual span:last-child {
  position: absolute;
  right: -0.45rem;
  top: -0.4rem;
  padding: 0.35rem;
  border: 2px solid var(--ui-bg);
  border-radius: 50%;
  background: var(--color-signal-500);
  color: white;
  font-size: 0.62rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 1100px) {
  .library-gallery__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .library-segmented button {
    padding-inline: 0.5rem;
  }
  .library-select--sort {
    display: none;
  }
  .library-list__row {
    grid-template-columns: 5.3rem minmax(14rem, 1fr) 7rem 6rem auto;
  }
  .library-list__date {
    display: none;
  }
}

@media (max-width: 840px) {
  .projects-shell {
    width: min(100% - 2rem, 44rem);
    padding-top: 1rem;
  }
  .library-hero {
    align-items: flex-start;
    flex-direction: column;
    gap: 1.8rem;
    padding-block: 1.5rem 2rem;
  }
  .library-hero__aside {
    width: 100%;
    min-width: 0;
    grid-template-columns: 1fr auto;
  }
  .library-hero__updated {
    grid-column: 1 / -1;
  }
  .library-hero__total {
    grid-column: 1;
  }
  .library-hero__actions {
    grid-column: 2;
    grid-row: 2;
    margin-top: 0;
  }
  .library-statusbar {
    overflow-x: auto;
  }
  .library-statusbar__item {
    min-width: 8.5rem;
  }
  .library-statusbar__spacer {
    display: none;
  }
  .library-statusbar__archive {
    min-width: 8.5rem;
  }
  .library-toolbar {
    position: static;
    grid-template-columns: 1fr;
  }
  .library-toolbar__controls {
    overflow-x: auto;
    padding-bottom: 0.1rem;
  }
  .library-toolbar__controls::-webkit-scrollbar {
    display: none;
  }
  .library-segmented {
    flex: 1;
  }
  .library-segmented button {
    flex: 1;
  }
  .library-featured {
    grid-template-columns: 1fr;
  }
  .library-featured__media {
    min-height: 20rem;
  }
  .library-featured__details {
    padding: 1.7rem;
  }
  .library-gallery__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .library-list__row {
    grid-template-columns: 4.7rem minmax(0, 1fr) auto auto;
    gap: 0.7rem;
  }
  .library-list__thumb {
    width: 4rem;
  }
  .library-list__meta {
    display: none;
  }
  .library-list__arrow {
    display: none;
  }
}

@media (max-width: 560px) {
  .projects-shell {
    width: min(100% - 1.25rem, 36rem);
    padding-bottom: 3rem;
  }
  .library-hero__title {
    font-size: clamp(2.35rem, 12vw, 3.4rem);
  }
  .library-hero__description {
    font-size: 0.86rem;
  }
  .library-live-pill {
    display: none;
  }
  .library-statusbar {
    margin-inline: -0.2rem;
    border-radius: 0.8rem;
  }
  .library-statusbar__item,
  .library-statusbar__archive {
    min-width: 7.4rem;
    padding-inline: 0.7rem;
  }
  .library-statusbar__label {
    font-size: 0.7rem;
  }
  .library-toolbar__controls {
    margin-inline: -0.1rem;
  }
  .library-select--media {
    display: none;
  }
  .library-view-toggle {
    margin-left: 0;
  }
  .library-featured {
    margin-top: 1.4rem;
    border-radius: 0.95rem;
  }
  .library-featured__media {
    min-height: 17rem;
    padding: 0.8rem;
  }
  .library-featured__frame {
    max-height: 19rem;
  }
  .library-featured__topline,
  .library-featured__bottomline {
    right: 0.8rem;
    left: 0.8rem;
  }
  .library-featured__topline {
    top: 0.8rem;
  }
  .library-featured__bottomline {
    bottom: 0.8rem;
  }
  .library-featured__details {
    padding: 1.35rem;
  }
  .library-featured__heading {
    margin-top: 1rem;
  }
  .library-featured__details h2 {
    font-size: 1.1rem;
    -webkit-line-clamp: 4;
  }
  .library-featured__specs {
    margin-top: 1.4rem;
  }
  .library-featured__footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 1rem;
  }
  .library-gallery {
    margin-top: 2.5rem;
  }
  .library-section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.35rem;
  }
  .library-gallery__grid {
    grid-template-columns: 1fr;
  }
  .library-list__row {
    grid-template-columns: 3.8rem minmax(0, 1fr) auto;
    padding: 0.65rem;
  }
  .library-list__thumb {
    width: 3.25rem;
    height: 2.75rem;
  }
  .library-list__row > .library-chip {
    display: none;
  }
  .library-empty--filtered {
    grid-template-columns: 1fr;
    justify-items: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .library-icon-button,
  .library-primary-button,
  .library-secondary-button,
  .library-text-button span,
  .library-featured__play,
  .library-list__arrow {
    transition: none;
  }
}
</style>
