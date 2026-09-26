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
// Keep the select's non-empty UI value out of quote and run requests.
const selectedProject = computed({
  get: () => projectId.value || '__auto__',
  set: (value: string) => {
    projectId.value = value === '__auto__' ? '' : value
  },
})
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
const active = computed(() => !!run.value && ['PENDING', 'RUNNING'].includes(run.value.status))
const selectedProvider = computed(() => providers.value.find(item => item.id === connectionId.value))
const promptIdeas = computed(() => ({
  story: [
    { label: '治愈故事', prompt: '写一个温暖的故事：小镇上有一家修补回忆的店，店主收到一段没有主人的童年记忆。' },
    { label: '悬疑反转', prompt: '一个每晚收到明日新闻的电台主持人，某天在新闻里听到了自己的名字。设置意外而合理的反转。' },
  ],
  script: [
    { label: '都市短剧', prompt: '创作一集三分钟的都市短剧：两个互不相识的人拿错了手机，因此发现同一个秘密。包含分场、动作和对白。' },
    { label: '奇幻冒险', prompt: '创作一个奇幻短剧开场：邮递员第一次向月球投递信件，却发现收件人是未来的自己。' },
  ],
  copy: [
    { label: '新品发布', prompt: '为一家独立咖啡店的秋季桂花拿铁写新品发布文案，面向都市上班族，突出真实桂花香与午后放松，包含标题和行动引导。' },
    { label: '社交分享', prompt: '为一本旅行手账写社交平台种草文案，突出记录旅途的小惊喜，语气自然真诚，避免夸张承诺。' },
  ],
})[kind.value])
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
      connectionId.value = providers.value.find(item => item.available)?.id
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
  if (generating.value || active.value)
    return
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
  if (!selectedProvider.value?.available) {
    errorMessage.value = '尚未配置可用的文本大模型连接'
    return
  }
  generating.value = true
  try {
    const selected = selectedProvider.value!
    if (!quote.value || new Date(quote.value.expiresAt).getTime() <= Date.now()) {
      const snapshot = JSON.stringify([kind.value, brief.value, tone.value, audience.value, length.value, connectionId.value, projectId.value, current.value?.id])
      const result = await platform.quote({ kind: 'text', connectionId: selected.connectionId, model: selected.model, projectId: current.value?.projectId || projectId.value || undefined, baseVersionId: current.value?.id, input: { kind: kind.value, brief: brief.value, tone: tone.value || undefined, audience: audience.value || undefined, length: length.value, documentId: current.value?.documentId } })
      if (snapshot !== JSON.stringify([kind.value, brief.value, tone.value, audience.value, length.value, connectionId.value, projectId.value, current.value?.id]))
        return
      quote.value = result
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
  { label: '自动创建项目', value: '__auto__' },
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
  <StudioWorkspace>
    <template #composer>
      <UCard class="studio-composer" :ui="{ body: 'flex min-h-0 flex-1 flex-col p-0 sm:p-0' }">
        <StudioPanelHeader title="文案生成" description="让灵感成文，让故事有声。" icon="i-lucide-file-pen-line">
          <UTooltip text="新建文档">
            <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-file-plus-2" aria-label="新建文档" @click="newDocument" />
          </UTooltip>
        </StudioPanelHeader>
        <div class="studio-composer__body">
          <StudioModePicker :model-value="kind" :items="kindOptions" label="文案类型" @update:model-value="selectKind" />
          <UFormField label="创作想法与设定" :hint="`${brief.length} / 12K`" size="sm">
            <UTextarea
              v-model="brief"
              :rows="4"
              autoresize
              :maxrows="10"
              maxlength="12000"
              class="w-full text-sm leading-relaxed"
              placeholder="写下故事、角色或场景的想法。例如：住在小星球上的邮递员，每天替人们寄出心愿。今天，她收到了一封写给自己的信……"
            />
          </UFormField>

          <StudioPromptIdeas v-model="brief" :items="promptIdeas" :maxlength="12000" />
          <UFormField label="目标篇幅">
            <USelect v-model="length" :items="lengthItems" class="w-full" />
          </UFormField>
          <UButton color="neutral" variant="outline" icon="i-lucide-settings-2" block @click="textSettingsModalOpen = true">
            更多设置 · 风格与项目
          </UButton>
          <UAlert v-if="!selectedProvider?.available && user" color="warning" variant="subtle" icon="i-lucide-plug-zap" description="文案生成暂不可用，请联系管理员分配生成服务并配置篇幅价格。" />
          <UAlert v-if="savedMessage" color="success" variant="subtle" icon="i-lucide-circle-check" :description="savedMessage" />
        </div>
        <StudioGenerateAction :submitting="generating" :active="active" :disabled="!!user && (brief.trim().length < 5 || !selectedProvider?.available)" :quote="quote" :error-message="errorMessage" @generate="generate" />
      </UCard>
      <details v-if="documents.length" class="studio-recent">
        <summary class="cursor-pointer text-sm font-medium text-toned">
          最近文档 · {{ documents.length }}
        </summary>
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
      </details>
    </template>
    <UCard class="studio-result" :ui="{ body: 'p-0 sm:p-0' }">
      <div class="studio-result__header">
        <h2 class="flex items-center gap-2 text-sm font-semibold">
          <UIcon name="i-lucide-file-text" class="size-4 text-primary" />文案预览
        </h2>
        <UButton to="/projects?kind=text" variant="ghost" color="neutral" size="xs" trailing-icon="i-lucide-arrow-up-right">
          作品库
        </UButton>
      </div>
      <div v-if="run" class="mx-5 mt-4 flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-xs" role="status">
        <span class="flex items-center gap-2"><UIcon :name="active ? 'i-lucide-loader-circle' : run.status === 'SUCCEEDED' ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'" :class="{ 'animate-spin': active }" />{{ runStatusLabel[run.status] }}</span>
        <span class="text-muted">{{ settlementLabel(run.billing.settlementStatus) }}</span>
      </div>
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
      <StudioEmptyState v-else icon="i-lucide-file-pen-line" :busy="active" :title="active ? '你的灵感正在成文' : '好故事，从一句想法开始'" :description="active ? '完成后会在这里展示，也可以稍后到作品库查看。' : '写下想法，选择篇幅。生成后可直接编辑、保存版本，或继续创作视频。'" />
    </UCard>
    <template #dialogs>
      <!-- 文本创作参数设置弹窗 -->
      <TextSettingsModal
        v-model:open="textSettingsModalOpen"
        v-model:project-id="selectedProject"
        v-model:length="length"
        v-model:tone="tone"
        v-model:audience="audience"
        :project-items="projectItems"
        :length-items="lengthItems"
        :project-cursor="projectCursor"
        :disabled-project="!!current"
        @more-projects="moreProjects().catch(e => errorMessage = apiError(e))"
      />
    </template>
  </StudioWorkspace>
</template>
