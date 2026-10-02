<script setup lang="ts">
import type { Page, ProjectSummary, RunSummary, WorkSummary } from '#shared/types/platform'
import { useIntervalFn } from '@vueuse/core'
import ActiveRunsBar from '~/components/projects/ActiveRunsBar.vue'
import WorkCard from '~/components/projects/WorkCard.vue'
import WorkDetailModal from '~/components/projects/WorkDetailModal.vue'

const platform = usePlatformApi()
const query = ref('')
const route = useRoute()
const kind = ref(['image', 'video', 'text'].includes(String(route.query.kind)) ? String(route.query.kind) : '')
const projectId = ref('')
// Select reserves the empty string for clearing; keep the API filter unchanged.
const selectedProject = computed({
  get: () => projectId.value || '__all_projects__',
  set: (value: string) => { projectId.value = value === '__all_projects__' ? '' : value },
})
const viewMode = ref<'grid' | 'masonry' | 'list'>('grid')

const { items: projects, cursor: projectCursor, loadMore: moreProjects, refresh: refreshProjects } = await useProjectOptions()

const { data: page, status, error, refresh } = await useFetch<Page<WorkSummary> & {
  total: number
}>('/api/works', {
  query: {
    q: query,
    kind: computed(() => kind.value || undefined),
    projectId: computed(() => projectId.value || undefined),
  },
})

const { data: active, refresh: refreshActive } = await useFetch<Page<RunSummary>>('/api/runs', {
  query: { active: 'true' },
})

const more = ref<WorkSummary[]>([])
const cursor = ref<string | null>(null)
const loadingMore = ref(false)
const message = ref('')
const selected = ref<WorkSummary>()

function closeDetail(val: boolean) {
  if (!val)
    selected.value = undefined
}

// Project Management Modal
const projectModalOpen = ref(false)
const projectModalMode = ref<'create' | 'rename'>('create')
const projectNameInput = ref('')
const projectSubmitting = ref(false)

watch(page, () => {
  more.value = []
  cursor.value = page.value?.nextCursor || null
}, { immediate: true })

const items = computed(() => [...(page.value?.items || []), ...more.value])

useIntervalFn(async () => {
  if (active.value?.items.some(r => ['PENDING', 'RUNNING'].includes(r.status) || (r.kind === 'image' && r.stage === 'archiving'))) {
    await refreshActive()
    await refresh()
  }
}, 4000)

async function loadMore() {
  if (loadingMore.value || !cursor.value)
    return
  loadingMore.value = true
  try {
    const next = await $fetch<Page<WorkSummary>>('/api/works', {
      query: {
        q: query.value,
        kind: kind.value || undefined,
        projectId: projectId.value || undefined,
        cursor: cursor.value || undefined,
      },
    })
    more.value.push(...next.items)
    cursor.value = next.nextCursor
  }
  catch (e) {
    message.value = apiError(e)
  }
  finally {
    loadingMore.value = false
  }
}

function openCreateProject() {
  projectModalMode.value = 'create'
  projectNameInput.value = ''
  projectModalOpen.value = true
}

function openRenameProject() {
  const p = projects.value.find(p => p.id === projectId.value)
  if (!p)
    return
  projectModalMode.value = 'rename'
  projectNameInput.value = p.name
  projectModalOpen.value = true
}

async function handleProjectSubmit() {
  const name = projectNameInput.value.trim()
  if (!name)
    return
  projectSubmitting.value = true
  try {
    if (projectModalMode.value === 'create') {
      const created = await $fetch<ProjectSummary>('/api/projects', {
        method: 'POST',
        body: { name },
      })
      await refreshProjects()
      projectId.value = created.id
    }
    else {
      await $fetch(`/api/projects/${projectId.value}`, {
        method: 'PATCH',
        body: { name },
      })
      await refreshProjects()
    }
    projectModalOpen.value = false
  }
  catch (e) {
    message.value = apiError(e)
  }
  finally {
    projectSubmitting.value = false
  }
}

async function command(run: RunSummary) {
  try {
    const action = run.allowedActions[0]
    if (action)
      await platform.command(run.id, action)
    await refreshActive()
  }
  catch (e) {
    message.value = apiError(e)
  }
}

async function move(work: WorkSummary, targetProjectId: string) {
  try {
    await $fetch(`/api/works/${work.id}`, {
      method: 'PATCH',
      body: { projectId: targetProjectId || null },
    })
    await refresh()
  }
  catch (e) {
    message.value = apiError(e)
  }
}

async function handleRetryArchive(work: WorkSummary) {
  if (!work.runId)
    return
  try {
    const r = await platform.run(work.runId)
    if (r.allowedActions.includes('archive')) {
      await platform.command(r.id, 'archive')
      await refresh()
    }
  }
  catch (e) {
    message.value = apiError(e)
  }
}

const kindTabs = [
  { value: '', label: '全部作品', icon: 'i-lucide-layers-3' },
  { value: 'video', label: '视频', icon: 'i-lucide-film' },
  { value: 'text', label: '文本剧本', icon: 'i-lucide-book-open' },
  { value: 'image', label: '图片', icon: 'i-lucide-image' },
]

const creationItems = computed(() => [
  [
    { label: '文本与剧本创作', icon: 'i-lucide-sparkles', to: '/studio' },
    { label: '视频生成任务', icon: 'i-lucide-film', to: '/studio/video' },
    { label: '图片生成', icon: 'i-lucide-image-plus', to: '/studio/image' },
  ],
])

const projectSelectItems = computed(() => [
  { label: '全部项目', value: '__all_projects__' },
  ...projects.value.map(p => ({ label: p.name, value: p.id })),
])
</script>

<template>
  <main class="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <!-- Header Section -->
    <header class="flex flex-col gap-4 border-b border-default/70 pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="flex items-center gap-2.5">
          <h1 class="text-xl font-bold tracking-tight text-highlighted sm:text-2xl">
            作品库
          </h1>
          <UBadge color="neutral" variant="subtle" size="sm" class="font-normal">
            共 {{ page?.total ?? items.length }} 个作品
          </UBadge>
          <UBadge v-if="active?.items.length" color="primary" variant="subtle" size="sm">
            <span class="mr-1.5 size-1.5 animate-pulse rounded-full bg-signal-500" />
            {{ active.items.length }} 个任务进行中
          </UBadge>
        </div>
        <p class="mt-1 text-xs text-muted">
          收好每一个故事、画面与动态瞬间，让小宇宙一点点长大。
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-lucide-folder-plus"
          color="neutral"
          variant="outline"
          size="sm"
          @click="openCreateProject"
        >
          新建项目
        </UButton>

        <UButton
          v-if="projectId"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="openRenameProject"
        >
          重命名项目
        </UButton>

        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          :loading="status === 'pending'"
          aria-label="刷新作品与任务"
          @click="refresh(); refreshActive()"
        />

        <UDropdownMenu :items="creationItems" :content="{ align: 'end' }">
          <UButton
            color="primary"
            size="sm"
            icon="i-lucide-plus"
            trailing-icon="i-lucide-chevron-down"
          >
            开始创作
          </UButton>
        </UDropdownMenu>
      </div>
    </header>

    <!-- Error Alert -->
    <UAlert
      v-if="error || message"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="message || apiError(error)"
      :close-button="{ icon: 'i-lucide-x', color: 'neutral', variant: 'link' }"
      @close="message = ''"
    />

    <!-- Active Runs Live Section -->
    <ActiveRunsBar
      v-if="active?.items.length"
      :runs="active.items"
      @command="command"
    />

    <!-- Filter & Search Toolbar -->
    <section class="sticky top-[var(--app-header-offset)] z-20 rounded-xl border border-default/70 bg-elevated/80 p-2 backdrop-blur-md">
      <div class="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <!-- Search Input -->
        <label class="relative min-w-0 flex-1">
          <span class="sr-only">搜索作品</span>
          <UIcon name="i-lucide-search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dimmed" />
          <input
            v-model="query"
            type="search"
            class="h-9 w-full rounded-lg border border-default bg-elevated pl-9 pr-8 text-xs text-highlighted outline-none transition placeholder:text-dimmed focus:border-signal-500 sm:text-sm"
            placeholder="搜索作品标题或描述…"
          >
          <button
            v-if="query"
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-dimmed hover:text-highlighted"
            aria-label="清除搜索"
            @click="query = ''"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </label>

        <!-- Kind Switcher Pills -->
        <div class="flex items-center rounded-lg border border-default bg-elevated p-0.5">
          <button
            v-for="tab in kindTabs"
            :key="tab.value"
            type="button"
            class="focus-ring inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition"
            :class="kind === tab.value
              ? 'bg-muted text-highlighted shadow-xs ring-1 ring-inset ring-default'
              : 'text-muted hover:text-highlighted'"
            :aria-pressed="kind === tab.value"
            @click="kind = tab.value"
          >
            <UIcon :name="tab.icon" class="size-3.5" />
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <!-- Project Selector & View Mode Switcher -->
        <div class="flex items-center gap-2">
          <USelect
            v-model="selectedProject"
            :items="projectSelectItems"
            class="w-40 sm:w-48"
            size="sm"
            icon="i-lucide-folder"
          />

          <UButton
            v-if="projectCursor"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="moreProjects().catch(e => message = apiError(e))"
          >
            更多项目
          </UButton>

          <!-- View Mode Toggle -->
          <div class="flex items-center rounded-lg border border-default bg-elevated p-0.5">
            <UTooltip text="网格模式">
              <button
                type="button"
                class="rounded p-1.5 text-dimmed transition hover:text-highlighted"
                :class="{ 'bg-muted text-highlighted': viewMode === 'grid' }"
                @click="viewMode = 'grid'"
              >
                <UIcon name="i-lucide-layout-grid" class="size-3.5" />
              </button>
            </UTooltip>
            <UTooltip text="瀑布流模式">
              <button
                type="button"
                class="rounded p-1.5 text-dimmed transition hover:text-highlighted"
                :class="{ 'bg-muted text-highlighted': viewMode === 'masonry' }"
                @click="viewMode = 'masonry'"
              >
                <UIcon name="i-lucide-columns-3" class="size-3.5" />
              </button>
            </UTooltip>
            <UTooltip text="列表模式">
              <button
                type="button"
                class="rounded p-1.5 text-dimmed transition hover:text-highlighted"
                :class="{ 'bg-muted text-highlighted': viewMode === 'list' }"
                @click="viewMode = 'list'"
              >
                <UIcon name="i-lucide-list" class="size-3.5" />
              </button>
            </UTooltip>
          </div>
        </div>
      </div>
    </section>

    <!-- Gallery Loading State -->
    <div v-if="status === 'pending' && !items.length" class="flex flex-col items-center justify-center py-24 text-dimmed">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-signal-500" />
      <p class="mt-3 text-sm">
        正在载入作品库…
      </p>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!items.length"
      class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-default bg-elevated/40 py-24 text-center"
    >
      <div class="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-dimmed shadow-soft">
        <UIcon name="i-lucide-clapperboard" class="size-7" />
      </div>
      <h3 class="mt-4 text-base font-semibold text-highlighted">
        {{ query || kind || projectId ? '没有符合条件的作品' : '你的小宇宙，还差第一件作品' }}
      </h3>
      <p class="mt-1 max-w-sm text-xs text-muted">
        {{ query || kind || projectId ? '可尝试调整或重置搜索词与筛选条件' : '从一段故事、一个角色或一份参考素材开始，收藏你的第一份作品' }}
      </p>
      <div class="mt-5 flex gap-2">
        <UButton
          v-if="query || kind || projectId"
          variant="outline"
          color="neutral"
          size="sm"
          @click="query = ''; kind = ''; projectId = ''"
        >
          清空筛选
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
    </div>

    <!-- Works Gallery Content -->
    <section v-else class="space-y-6">
      <!-- Grid Mode -->
      <div
        v-if="viewMode === 'grid'"
        class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <WorkCard
          v-for="work in items"
          :key="work.id"
          :work="work"
          mode="grid"
          :projects="projects"
          @select="selected = $event"
          @move="move"
          @retry-archive="handleRetryArchive"
        />
      </div>

      <!-- Masonry Mode -->
      <div
        v-else-if="viewMode === 'masonry'"
        class="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 [column-fill:_balance]"
      >
        <div v-for="work in items" :key="work.id" class="mb-4 break-inside-avoid">
          <WorkCard
            :work="work"
            mode="masonry"
            :projects="projects"
            @select="selected = $event"
            @move="move"
            @retry-archive="handleRetryArchive"
          />
        </div>
      </div>

      <!-- List Mode -->
      <div
        v-else-if="viewMode === 'list'"
        class="overflow-hidden rounded-xl border border-default bg-elevated shadow-soft divide-y divide-default"
      >
        <WorkCard
          v-for="work in items"
          :key="work.id"
          :work="work"
          mode="list"
          :projects="projects"
          @select="selected = $event"
          @move="move"
          @retry-archive="handleRetryArchive"
        />
      </div>

      <!-- Load More Button -->
      <div v-if="cursor" class="flex justify-center pt-4">
        <UButton
          variant="soft"
          color="neutral"
          size="sm"
          :loading="loadingMore"
          icon="i-lucide-arrow-down"
          @click="loadMore"
        >
          加载更多作品
        </UButton>
      </div>
    </section>

    <!-- Work Detail Theater Modal -->
    <WorkDetailModal
      :open="Boolean(selected)"
      :work="selected"
      :projects="projects"
      @update:open="closeDetail"
    />

    <!-- Project Create/Rename Modal -->
    <UModal v-model:open="projectModalOpen" :title="projectModalMode === 'create' ? '新建项目' : '重命名项目'">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleProjectSubmit">
          <UFormField label="项目名称" required>
            <UInput
              v-model="projectNameInput"
              class="w-full"
              placeholder="例如：科幻短片《深空折跃》"
              maxlength="160"
              autofocus
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="projectModalOpen = false"
            >
              取消
            </UButton>
            <UButton
              type="submit"
              color="primary"
              :loading="projectSubmitting"
              :disabled="!projectNameInput.trim()"
            >
              确定
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
