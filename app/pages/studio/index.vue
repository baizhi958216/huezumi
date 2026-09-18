<script setup lang="ts">
import type { ModelOption, Page, RunSummary } from '#shared/types/platform'
import type { TextCreationContent, TextCreationKind, TextCreationLength, TextDocumentSummary, TextDocumentVersionRecord } from '#shared/types/text-creation'
import type { PlatformQuote } from '~/composables/usePlatformApi'
import { useEventListener, useIntervalFn } from '@vueuse/core'
import TextSettingsModal from '~/components/studio/text/TextSettingsModal.vue'
import { runStatusLabel, settlementLabel } from '~/utils/run-labels'

const { user, authDialogOpen } = useAuth()
const platform = usePlatformApi()
const route = useRoute()
const quote = ref<PlatformQuote>()
const quoteKey = ref('')
const run = ref<RunSummary>()
const projectId = ref('')
const { items: projects, cursor: projectCursor, loadMore: moreProjects, refresh: refreshProjects } = await useProjectOptions()
const documentCursor = ref<string | null>(null)
const kind = ref<TextCreationKind>('story')
const brief = ref('')
const tone = ref('电影感、克制、有悬念')
const audience = ref('')
const length = ref<TextCreationLength>('medium')
const connectionId = ref<string>()
const textSettingsModalOpen = ref(false)
const generating = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const savedMessage = ref('')
const current = ref<TextDocumentVersionRecord>()
const draft = ref<TextCreationContent>()
const dirty = computed(() => Boolean(current.value && draft.value && JSON.stringify(current.value.content) !== JSON.stringify(draft.value)))
useEventListener('beforeunload', (event) => {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
})
function canLeave() {
  if (dirty.value) {
    errorMessage.value = '请先保存修改，或点击放弃修改'
    return false
  }
  return true
}
function discardChanges() {
  draft.value = current.value ? structuredClone(toRaw(current.value.content)) : undefined
}
const providers = ref<ModelOption[]>([])
const documents = ref<TextDocumentSummary[]>([])
const providerItems = computed(() => providers.value.map(item => ({ label: `${item.label}${item.reason ? ` · ${item.reason}` : ''}`, value: item.id })))
const kindOptions: Array<{
  value: TextCreationKind
  label: string
  hint: string
  icon: string
}> = [
  { value: 'story', label: '故事', hint: '完整叙事、人物与场景', icon: 'i-lucide-book-open' },
  { value: 'script', label: '短剧剧本', hint: '分场、动作与对白', icon: 'i-lucide-clapperboard' },
  { value: 'copy', label: '营销文案', hint: '标题、卖点与正文', icon: 'i-lucide-megaphone' },
]
const lengthItems = [
  { label: '精简 · 500–800 字', value: 'short' },
  { label: '标准 · 1200–2000 字', value: 'medium' },
  { label: '详细 · 2500–4000 字', value: 'long' },
]
const selectedLengthLabel = computed(() => lengthItems.find(item => item.value === length.value)?.label.split(' · ')[0] || '标准篇幅')
const selectedModelLabel = computed(() => providerItems.value.find(item => item.value === connectionId.value)?.label || '未选模型')
async function loadWorkspace() {
  if (!user.value)
    return
  try {
    const [providerData, documentData] = await Promise.all([
      platform.models(),
      $fetch<Page<TextDocumentSummary>>('/api/documents'),
    ])
    providers.value = providerData.filter(item => item.kind === 'text')
    await refreshProjects()
    documents.value = documentData.items
    documentCursor.value = documentData.nextCursor
    if (!providers.value.some(item => item.id === connectionId.value))
      connectionId.value = providers.value[0]?.id
  }
  catch (error) {
    errorMessage.value = apiError(error)
  }
}
watch(user, loadWorkspace, { immediate: true })
const polling = useIntervalFn(async () => {
  if (!run.value)
    return
  try {
    run.value = await platform.run(run.value.id)
    if (['PENDING', 'RUNNING'].includes(run.value.status))
      return
    polling.pause()
    if (run.value.documentVersion) {
      if (!dirty.value) {
        current.value = await $fetch<TextDocumentVersionRecord>(`/api/documents/${run.value.documentVersion.documentId}`)
        kind.value = current.value.kind || kind.value
        projectId.value = current.value.projectId
        draft.value = structuredClone(toRaw(current.value.content))
      }
      savedMessage.value = run.value.needsReview || dirty.value ? '生成版本已保存，当前编辑未被覆盖。请从版本历史查看。' : '生成版本已保存并完成结算。'
      await loadWorkspace()
    }
    else {
      errorMessage.value = run.value.error || '任务未完成，请查看任务状态'
    }
  }
  catch (error) {
    errorMessage.value = apiError(error)
  }
}, 3000, { immediate: false })
async function generate() {
  errorMessage.value = ''
  savedMessage.value = ''
  if (!user.value) {
    authDialogOpen.value = true
    return
  }
  if (brief.value.trim().length < 5) {
    errorMessage.value = '请至少用 5 个字描述你的创作想法'
    return
  }
  if (!connectionId.value) {
    errorMessage.value = '尚未配置可用的文本大模型连接'
    return
  }
  generating.value = true
  try {
    const selected = providers.value.find(p => p.id === connectionId.value)!
    if (!quote.value || new Date(quote.value.expiresAt).getTime() <= Date.now()) {
      quote.value = await platform.quote({ kind: 'text', connectionId: selected.connectionId, model: selected.model, projectId: current.value?.projectId || projectId.value || undefined, baseVersionId: current.value?.id, input: { kind: kind.value, brief: brief.value, tone: tone.value || undefined, audience: audience.value || undefined, length: length.value, documentId: current.value?.documentId } })
      quoteKey.value = crypto.randomUUID()
      return
    }
    run.value = await platform.submit(quote.value, quoteKey.value)
    quote.value = undefined
    await navigateTo({ query: { run: run.value.id } }, { replace: true })
    savedMessage.value = '任务已受理，可离开页面，完成后可在作品库查看。'
    polling.resume()
  }
  catch (error) {
    errorMessage.value = apiError(error)
  }
  finally {
    generating.value = false
  }
}
async function saveVersion() {
  if (!current.value || !draft.value)
    return
  errorMessage.value = ''
  savedMessage.value = ''
  saving.value = true
  try {
    const result = await $fetch<TextDocumentVersionRecord>(`/api/documents/${current.value.documentId}/versions`, {
      method: 'POST',
      body: { baseVersionId: current.value.id, content: draft.value },
    })
    current.value = result
    projectId.value = result.projectId
    draft.value = structuredClone(result.content)
    savedMessage.value = `修改已保存为版本 ${result.version}`
    await loadWorkspace()
  }
  catch (error) {
    errorMessage.value = apiError(error)
  }
  finally {
    saving.value = false
  }
}
async function openDocument(document: TextDocumentSummary) {
  if (!canLeave())
    return
  errorMessage.value = ''
  try {
    const latest = await $fetch<TextDocumentVersionRecord>(`/api/documents/${document.id}`)
    if (!latest)
      return
    current.value = latest
    projectId.value = latest.projectId
    draft.value = structuredClone(latest.content)
    kind.value = document.kind
    savedMessage.value = `已打开版本 ${latest.version}`
  }
  catch (error) {
    errorMessage.value = apiError(error)
  }
}
function newDocument() {
  if (!canLeave())
    return
  current.value = undefined
  draft.value = undefined
  brief.value = ''
  savedMessage.value = ''
  errorMessage.value = ''
}
function selectKind(value: TextCreationKind) {
  if (!canLeave())
    return
  if (current.value && value !== kind.value) {
    current.value = undefined
    draft.value = undefined
    savedMessage.value = '已切换创作类型，将创建新文档'
  }
  kind.value = value
}
watch([kind, brief, tone, audience, length, connectionId, projectId, current], () => {
  quote.value = undefined
})
async function loadMoreDocuments() {
  if (!documentCursor.value)
    return
  const page = await $fetch<Page<TextDocumentSummary>>('/api/documents', { query: { cursor: documentCursor.value } })
  documents.value.push(...page.items)
  documentCursor.value = page.nextCursor
}
const versions = ref<Array<{
  id: string
  version: number
}>>([])
const versionCursor = ref<string | null>(null)

const projectItems = computed(() => [
  { label: '自动创建项目', value: '' },
  ...projects.value.map(p => ({ label: p.name, value: p.id })),
])

const versionSelectItems = computed(() =>
  versions.value.map(v => ({
    label: `版本 ${v.version}`,
    value: v.id,
  })),
)

async function showVersions(more = false) {
  if (!current.value)
    return
  try {
    const page = await $fetch<Page<{ id: string, version: number }>>(`/api/documents/${current.value.documentId}/versions`, { query: more && versionCursor.value ? { cursor: versionCursor.value } : {} })
    versions.value = more ? [...versions.value, ...page.items] : page.items
    versionCursor.value = page.nextCursor
  }
  catch (error) { errorMessage.value = apiError(error) }
}
async function openVersion(id: string) {
  if (!current.value || !canLeave())
    return
  const result = await $fetch<TextDocumentVersionRecord>(`/api/documents/${current.value.documentId}/versions/${id}`)
  draft.value = structuredClone(result.content)
  savedMessage.value = `已载入历史版本 ${result.version}，保存将创建新版本`
}
onBeforeRouteLeave(() => canLeave())
onMounted(async () => {
  try {
    if (typeof route.query.run === 'string') {
      run.value = await platform.run(route.query.run)
      if (run.value.documentVersion) {
        current.value = await $fetch<TextDocumentVersionRecord>(`/api/documents/${run.value.documentVersion.documentId}`)
        kind.value = current.value.kind || kind.value
        projectId.value = current.value.projectId
        draft.value = structuredClone(toRaw(current.value.content))
      }
      errorMessage.value = run.value.error || ''
      if (['PENDING', 'RUNNING'].includes(run.value.status))
        polling.resume()
    }
    if (typeof route.query.document === 'string') {
      const result = await $fetch<TextDocumentVersionRecord>(`/api/documents/${route.query.document}`)
      current.value = result
      projectId.value = result.projectId
      kind.value = result.kind || kind.value
      draft.value = structuredClone(result.content)
    }
  }
  catch (error) {
    errorMessage.value = apiError(error)
  }
})
</script>

<template>
  <main class="min-h-[calc(100svh-var(--app-header-offset))] bg-muted/35 py-3 md:py-4">
    <div class="creation-content">
      <div class="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <div class="space-y-4">
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <div class="flex items-start justify-between gap-3 border-b border-default px-5 py-4">
              <div>
                <p class="type-kicker text-[11px] font-semibold tracking-wider text-dimmed uppercase">
                  文本创作
                </p>
                <h1 class="mt-1 text-lg font-650 text-highlighted">
                  从想法到可拍摄故事
                </h1>
                <p class="mt-1 text-xs leading-relaxed text-muted">
                  生成内容保存为可编辑版本，选定片段后可继续生成视频。
                </p>
              </div>
              <UTooltip text="新建文档">
                <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-file-plus-2" aria-label="新建文档" @click="newDocument" />
              </UTooltip>
            </div>

            <div class="space-y-4 p-5">
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="item in kindOptions"
                  :key="item.value"
                  type="button"
                  class="rounded-lg border px-2 py-3 text-center transition"
                  :class="kind === item.value ? 'border-primary bg-primary/8 text-primary' : 'border-default bg-elevated text-muted hover:border-accented'"
                  @click="selectKind(item.value)"
                >
                  <UIcon :name="item.icon" class="mx-auto mb-1.5 size-4" />
                  <span class="block text-xs font-semibold">{{ item.label }}</span>
                  <span class="mt-0.5 hidden text-[10px] text-dimmed sm:block">{{ item.hint }}</span>
                </button>
              </div>

              <div v-if="run" class="rounded-xl border border-default bg-muted/40 p-3 text-xs">
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-1.5 font-medium text-highlighted">
                    <UIcon
                      :name="run.status === 'RUNNING' ? 'i-lucide-loader-circle' : run.status === 'PENDING' ? 'i-lucide-clock' : 'i-lucide-circle-check'"
                      class="size-3.5 text-signal-500"
                      :class="run.status === 'RUNNING' ? 'animate-spin' : ''"
                    />
                    {{ runStatusLabel[run.status] }}
                  </span>
                  <span class="text-[11px] text-dimmed">
                    {{ settlementLabel(run.billing.settlementStatus) }}
                  </span>
                </div>
                <p v-if="run.stage" class="mt-1 text-[11px] text-dimmed">
                  {{ run.stage }}
                </p>
              </div>

              <UFormField label="创作想法与设定" :hint="`${brief.length} / 12K`" size="sm">
                <UTextarea
                  v-model="brief"
                  :rows="8"
                  autoresize
                  :maxrows="14"
                  maxlength="12000"
                  class="w-full text-sm leading-relaxed"
                  placeholder="输入故事核心大纲、人物关系或创意设定。例如：一个失去记忆的外卖员发现，每送完一单就会想起另一个人的人生……"
                />
              </UFormField>

              <!-- 创作参数摘要胶囊栏 -->
              <div class="rounded-xl border border-default/70 bg-elevated/40 p-2.5 transition-all">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <div class="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-dimmed uppercase">
                    <UIcon name="i-lucide-sliders" class="size-3 text-primary" />
                    <span>创作参数配置</span>
                  </div>
                  <UButton
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    icon="i-lucide-settings-2"
                    class="text-[11px] font-medium px-2 py-1 hover:border-primary/50"
                    @click="textSettingsModalOpen = true"
                  >
                    参数设置
                  </UButton>
                </div>

                <div class="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    class="group inline-flex items-center gap-1.5 rounded-lg border border-default/60 bg-muted/30 px-2.5 py-1 text-toned transition hover:border-primary/40 hover:bg-muted/70"
                    title="点击修改模型连接"
                    @click="textSettingsModalOpen = true"
                  >
                    <UIcon name="i-lucide-cpu" class="size-3.5 text-dimmed group-hover:text-primary transition-colors" />
                    <span class="max-w-[130px] truncate font-medium text-[11px]">{{ selectedModelLabel }}</span>
                  </button>

                  <button
                    type="button"
                    class="group inline-flex items-center gap-1.5 rounded-lg border border-default/60 bg-muted/30 px-2.5 py-1 text-toned transition hover:border-primary/40 hover:bg-muted/70"
                    title="点击修改篇幅要求"
                    @click="textSettingsModalOpen = true"
                  >
                    <UIcon name="i-lucide-align-left" class="size-3.5 text-dimmed group-hover:text-primary transition-colors" />
                    <span class="font-medium text-[11px]">{{ selectedLengthLabel }}</span>
                  </button>

                  <button
                    type="button"
                    class="group inline-flex items-center gap-1.5 rounded-lg border border-default/60 bg-muted/30 px-2.5 py-1 text-toned transition hover:border-primary/40 hover:bg-muted/70"
                    title="点击修改风格基调"
                    @click="textSettingsModalOpen = true"
                  >
                    <UIcon name="i-lucide-palette" class="size-3.5 text-dimmed group-hover:text-primary transition-colors" />
                    <span class="max-w-[120px] truncate font-medium text-[11px]">{{ tone || '默认基调' }}</span>
                  </button>
                </div>
              </div>

              <UAlert v-if="!providerItems.length && user" color="warning" variant="subtle" icon="i-lucide-plug-zap" description="请联系管理员配置文本模型连接及篇幅价格。" />
              <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage" />
              <UAlert v-if="savedMessage" color="success" variant="subtle" icon="i-lucide-circle-check" :description="savedMessage" />

              <UButton block color="primary" size="lg" icon="i-lucide-sparkles" :loading="generating" :disabled="!!user && (!brief.trim() || !providerItems.length || run?.status === 'RUNNING' || run?.status === 'PENDING')" @click="generate">
                {{ quote ? `确认生成 · ${quote.estimatedCredits} 额度` : '获取生成报价' }}
              </UButton>
            </div>
          </UCard>

          <UCard v-if="documents.length" :ui="{ body: 'p-3 sm:p-3' }">
            <div class="mb-2 flex items-center justify-between px-1">
              <h2 class="text-xs font-semibold text-toned">
                最近文档
              </h2>
              <span class="text-[11px] text-dimmed">{{ documents.length }}</span>
            </div>
            <button v-for="document in documents" :key="document.id" type="button" class="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted" @click="openDocument(document)">
              <UIcon :name="document.kind === 'script' ? 'i-lucide-clapperboard' : document.kind === 'copy' ? 'i-lucide-megaphone' : 'i-lucide-book-open'" class="mt-0.5 size-4 shrink-0 text-dimmed" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-xs font-semibold text-toned">{{ document.title }}</span>
                <span class="block truncate text-[11px] text-dimmed">版本 {{ document.currentVersion }} · {{ document.summary }}</span>
              </span>
            </button>
            <UButton v-if="documentCursor" variant="ghost" @click="loadMoreDocuments">
              加载更多
            </UButton>
          </UCard>
        </div>

        <UCard class="min-h-[720px]" :ui="{ body: 'p-0 sm:p-0' }">
          <template v-if="draft">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-5 py-3.5">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 text-[11px] text-dimmed">
                  <span>{{ current?.source === 'ai' ? 'AI 创作版本' : '手动保存版本' }}</span>
                  <span>·</span>
                  <UBadge size="xs" color="neutral" variant="subtle">
                    版本 {{ current?.version }}
                  </UBadge>
                  <span>·</span>
                  <span class="inline-flex items-center gap-1">
                    <span class="size-1.5 rounded-full" :class="dirty ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'" />
                    <span :class="dirty ? 'text-amber-500' : 'text-emerald-500'">{{ dirty ? '未保存修改' : '已保存' }}</span>
                  </span>
                </div>
                <input
                  v-model="draft.title"
                  aria-label="文档标题"
                  class="mt-1 w-full bg-transparent text-lg font-bold text-highlighted outline-none placeholder:text-dimmed"
                  placeholder="输入文档标题…"
                  maxlength="160"
                >
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <!-- Version Selection -->
                <div v-if="versions.length" class="flex items-center gap-1">
                  <USelect
                    :model-value="current?.id"
                    :items="versionSelectItems"
                    size="xs"
                    class="w-28"
                    icon="i-lucide-history"
                    placeholder="选择版本"
                    @update:model-value="openVersion"
                  />
                  <UButton
                    v-if="versionCursor"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    title="加载更早版本"
                    @click="showVersions(true)"
                  >
                    更早
                  </UButton>
                </div>
                <UButton
                  v-else
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-history"
                  @click="showVersions()"
                >
                  版本历史
                </UButton>

                <UButton
                  v-if="dirty"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-undo-2"
                  @click="discardChanges()"
                >
                  放弃修改
                </UButton>

                <UButton
                  color="neutral"
                  variant="soft"
                  size="sm"
                  icon="i-lucide-save"
                  :loading="saving"
                  @click="saveVersion"
                >
                  保存新版本
                </UButton>

                <UButton
                  v-if="current"
                  color="primary"
                  size="sm"
                  icon="i-lucide-film"
                  :to="`/studio/video?document=${current.documentId}&sourceVersion=${current.id}`"
                >
                  继续生成视频
                </UButton>
              </div>
            </div>
            <div class="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-7">
              <div class="min-w-0">
                <UFormField label="摘要" size="sm">
                  <UTextarea v-model="draft.summary" :rows="2" autoresize :maxrows="5" class="w-full text-sm leading-relaxed" />
                </UFormField>
                <UFormField label="正文" :hint="`${draft.content.length} 字`" size="sm" class="mt-5">
                  <UTextarea v-model="draft.content" :rows="25" autoresize :maxrows="50" class="w-full text-[15px] leading-[1.9]" />
                </UFormField>
              </div>
              <aside class="space-y-5">
                <section>
                  <div class="mb-2 flex items-center gap-2 text-xs font-semibold text-toned">
                    <UIcon name="i-lucide-users" />人物设定
                  </div>
                  <div v-if="draft.characters.length" class="space-y-2">
                    <div v-for="character in draft.characters" :key="character.name" class="rounded-lg border border-default bg-muted/45 p-3">
                      <div class="text-xs font-semibold text-highlighted">
                        {{ character.name }}
                      </div>
                      <p class="mt-1 text-[11px] leading-relaxed text-muted">
                        {{ character.profile }}
                      </p>
                    </div>
                  </div>
                  <p v-else class="text-xs text-dimmed">
                    此类型没有人物设定
                  </p>
                </section>
                <section>
                  <div class="mb-2 flex items-center gap-2 text-xs font-semibold text-toned">
                    <UIcon name="i-lucide-panels-top-left" />场景拆解
                  </div>
                  <div v-if="draft.scenes.length" class="space-y-2">
                    <details v-for="(scene, index) in draft.scenes" :key="`${scene.title}-${index}`" class="rounded-lg border border-default bg-elevated p-3">
                      <summary class="cursor-pointer text-xs font-semibold text-highlighted">
                        {{ index + 1 }}. {{ scene.title }}
                      </summary>
                      <p class="mt-2 text-[11px] leading-relaxed text-muted">
                        <strong>画面：</strong>{{ scene.visual }}
                      </p>
                      <p v-if="scene.action" class="mt-1 text-[11px] leading-relaxed text-muted">
                        <strong>动作：</strong>{{ scene.action }}
                      </p>
                      <p v-if="scene.dialogue" class="mt-1 text-[11px] leading-relaxed text-muted">
                        <strong>对白：</strong>{{ scene.dialogue }}
                      </p>
                    </details>
                  </div>
                  <p v-else class="text-xs text-dimmed">
                    此类型没有场景拆解
                  </p>
                </section>
                <div v-if="draft.keywords.length" class="flex flex-wrap gap-1.5">
                  <UBadge v-for="keyword in draft.keywords" :key="keyword" color="neutral" variant="subtle" size="sm">
                    {{ keyword }}
                  </UBadge>
                </div>
              </aside>
            </div>
          </template>
          <div v-else class="flex min-h-[720px] items-center justify-center p-8 text-center">
            <div class="max-w-md">
              <div class="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UIcon name="i-lucide-file-pen-line" class="size-5" />
              </div>
              <h2 class="mt-4 text-lg font-semibold text-highlighted">
                创作结果会在这里成为可编辑文档
              </h2>
              <p class="mt-2 text-sm leading-relaxed text-muted">
                除了正文，还会保留人物设定、场景画面、动作和对白。可选择已保存版本的正文片段，继续创作视频镜头。
              </p>
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- 文本创作参数设置弹窗 -->
    <TextSettingsModal
      v-model:open="textSettingsModalOpen"
      v-model:project-id="projectId"
      v-model:connection-id="connectionId"
      v-model:length="length"
      v-model:tone="tone"
      v-model:audience="audience"
      :project-items="projectItems"
      :provider-items="providerItems"
      :length-items="lengthItems"
      :project-cursor="projectCursor"
      :disabled-project="!!current"
      @more-projects="moreProjects().catch(e => errorMessage = apiError(e))"
    />
  </main>
</template>
