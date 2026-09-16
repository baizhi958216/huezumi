<script setup lang="ts">
import type { GenerationRecord } from '#shared/types/generation'
import type { WorkflowProjectRecord } from '#shared/types/workflow-project'
import type { MediaTypeFilter, RatioFilter, SortBy, StatusFilter, ViewMode } from '~/types/projects'
import { useIntervalFn } from '@vueuse/core'

const { data: records, refresh, status } = await useFetch<GenerationRecord[]>('/api/generations')
const { data: workflowRecords, refresh: refreshWorkflows, status: workflowStatus, error: workflowError } = await useFetch<WorkflowProjectRecord[]>('/api/projects/workflows')
const searchQuery = ref('')
const statusFilter = ref<StatusFilter>('ALL')
const ratioFilter = ref<RatioFilter>('ALL')
const providerFilter = ref('ALL')
const mediaTypeFilter = ref<MediaTypeFilter>('ALL')
const viewMode = ref<ViewMode>('grid')
const sortBy = ref<SortBy>('newest')

const counts = computed(() => {
  const list = records.value ?? []
  return {
    total: list.length + (workflowRecords.value?.length ?? 0),
    active: list.filter(item => ['PENDING', 'RUNNING'].includes(item.status)).length,
    succeeded: list.filter(item => item.status === 'SUCCEEDED').length + (workflowRecords.value?.length ?? 0),
    failed: list.filter(item => item.status === 'FAILED').length,
    archived: list.filter(item => item.videoArchived).length,
  }
})

useIntervalFn(async () => {
  if (counts.value.active > 0)
    await refresh()
}, 4000)

const availableProviders = computed(() => [...new Set([
  ...(records.value ?? []).map(item => item.provider).filter(Boolean),
  ...(workflowRecords.value?.length ? ['comfyui'] : []),
])].sort())

const latestCreatedAt = computed(() => [records.value?.[0]?.createdAt, workflowRecords.value?.[0]?.createdAt]
  .filter((value): value is string => Boolean(value))
  .sort()
  .at(-1))

async function refreshAll() {
  await Promise.all([refresh(), refreshWorkflows()])
}

const filteredRecords = computed(() => {
  let list = records.value ?? []
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
    list = list.filter(item => [item.prompt, item.negativePrompt, item.id, item.model, item.provider]
      .filter(Boolean)
      .some(value => value?.toLowerCase().includes(query)))
  }

  return [...list].sort((a, b) => sortBy.value === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt))
})

const filteredWorkflowRecords = computed(() => {
  let list = workflowRecords.value ?? []
  if (['ACTIVE', 'FAILED', 'ARCHIVED'].includes(statusFilter.value))
    return []
  if (ratioFilter.value === 'VERTICAL')
    list = list.filter(item => ['9:16', '3:4'].includes(item.ratio))
  else if (ratioFilter.value === 'HORIZONTAL')
    list = list.filter(item => ['16:9', '4:3', '21:9', 'adaptive'].includes(item.ratio))
  else if (ratioFilter.value === 'SQUARE')
    list = list.filter(item => item.ratio === '1:1')
  if (providerFilter.value !== 'ALL' && providerFilter.value !== 'comfyui')
    return []
  if (mediaTypeFilter.value === 'IMAGE')
    list = list.filter(item => item.mediaTypes.includes('image'))
  else if (mediaTypeFilter.value === 'VIDEO')
    list = list.filter(item => item.mediaTypes.includes('video'))
  else if (mediaTypeFilter.value === 'AUDIO')
    list = list.filter(item => item.mediaTypes.includes('audio'))
  else if (mediaTypeFilter.value === 'TEXT_ONLY')
    list = list.filter(item => item.mediaTypes.length === 0)
  const query = searchQuery.value.trim().toLowerCase()
  if (query)
    list = list.filter(item => [item.prompt, item.name, item.model, item.promptId].some(value => value.toLowerCase().includes(query)))
  return [...list].sort((a, b) => sortBy.value === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt))
})

const hasFilters = computed(() => Boolean(searchQuery.value.trim()) || statusFilter.value !== 'ALL' || ratioFilter.value !== 'ALL' || providerFilter.value !== 'ALL' || mediaTypeFilter.value !== 'ALL')
const detailModalOpen = ref(false)
const selectedRecord = ref<GenerationRecord>()
const currentIndex = computed(() => selectedRecord.value ? filteredRecords.value.findIndex(item => item.id === selectedRecord.value?.id) : -1)

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
</script>

<template>
  <div class="relative min-h-full">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_25%_0%,rgba(255,77,53,0.08),transparent_45%)]" />
    <div class="relative mx-auto max-w-[1536px] px-4 py-4 sm:px-6 sm:py-5 md:px-8">
      <ProjectsHeader
        v-model:status-filter="statusFilter"
        :counts="counts"
        :latest-created-at="latestCreatedAt"
        :loading="status === 'pending' || workflowStatus === 'pending'"
        @refresh="refreshAll"
      />

      <ProjectsFilterBar
        v-model:search="searchQuery"
        v-model:ratio="ratioFilter"
        v-model:provider="providerFilter"
        v-model:media-type="mediaTypeFilter"
        v-model:sort="sortBy"
        v-model:view="viewMode"
        :providers="availableProviders"
        :has-filters="hasFilters"
        @reset="resetFilters"
      />

      <p v-if="workflowError" role="alert" class="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-toned">
        工作流作品暂时无法加载；请确认 ComfyUI 正在运行，然后刷新作品库。
      </p>

      <ProjectsWorkflowGallery v-if="filteredWorkflowRecords.length" :records="filteredWorkflowRecords" :view="viewMode" />

      <template v-if="filteredRecords.length">
        <ProjectsGallery
          :records="filteredRecords"
          :view="viewMode"
          :filtered="hasFilters"
          @select="openDetail"
        />
      </template>
      <ProjectsEmpty v-else-if="!filteredWorkflowRecords.length && !workflowError" :filtered="Boolean(records?.length || workflowRecords?.length)" @reset="resetFilters" />
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
