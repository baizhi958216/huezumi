<script setup lang="ts">
import type { TextCreationContent, TextCreationKind, TextCreationLength, TextDocumentSummary, TextDocumentVersionRecord, TextProviderOption } from '#shared/types/text-creation'

const { user, authDialogOpen } = useAuth()
const kind = ref<TextCreationKind>('story')
const brief = ref('')
const tone = ref('电影感、克制、有悬念')
const audience = ref('')
const length = ref<TextCreationLength>('medium')
const connectionId = ref<string>()
const generating = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const savedMessage = ref('')
const current = ref<TextDocumentVersionRecord>()
const draft = ref<TextCreationContent>()

const providers = ref<TextProviderOption[]>([])
const documents = ref<TextDocumentSummary[]>([])
const providerItems = computed(() => providers.value.map(item => ({ label: `${item.label} · ${item.model}`, value: item.id })))

const kindOptions: Array<{ value: TextCreationKind, label: string, hint: string, icon: string }> = [
  { value: 'story', label: '故事', hint: '完整叙事、人物与场景', icon: 'i-lucide-book-open' },
  { value: 'script', label: '短剧剧本', hint: '分场、动作与对白', icon: 'i-lucide-clapperboard' },
  { value: 'copy', label: '营销文案', hint: '标题、卖点与正文', icon: 'i-lucide-megaphone' },
]
const lengthItems = [
  { label: '精简 · 500–800 字', value: 'short' },
  { label: '标准 · 1200–2000 字', value: 'medium' },
  { label: '详细 · 2500–4000 字', value: 'long' },
]

async function loadWorkspace() {
  if (!user.value)
    return
  try {
    const [providerData, documentData] = await Promise.all([
      $fetch<TextProviderOption[]>('/api/text-creation/providers'),
      $fetch<TextDocumentSummary[]>('/api/text-creation/documents'),
    ])
    providers.value = providerData
    documents.value = documentData
    if (!providers.value.some(item => item.id === connectionId.value))
      connectionId.value = providers.value[0]?.id
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || '加载文本创作配置失败'
  }
}

watch(user, loadWorkspace, { immediate: true })

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
    const result = await $fetch<TextDocumentVersionRecord>('/api/text-creation/generate', {
      method: 'POST',
      body: {
        kind: kind.value,
        brief: brief.value,
        tone: tone.value || undefined,
        audience: audience.value || undefined,
        length: length.value,
        connectionId: connectionId.value,
        projectId: current.value?.projectId,
        documentId: current.value?.documentId,
      },
    })
    current.value = result
    draft.value = structuredClone(result.content)
    savedMessage.value = `已保存为版本 ${result.version}`
    await loadWorkspace()
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.statusMessage || '生成失败，请稍后重试'
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
    const result = await $fetch<TextDocumentVersionRecord>(`/api/text-creation/documents/${current.value.documentId}/versions`, {
      method: 'POST',
      body: draft.value,
    })
    current.value = result
    draft.value = structuredClone(result.content)
    savedMessage.value = `修改已保存为版本 ${result.version}`
    await loadWorkspace()
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || '保存失败，编辑内容仍保留在当前页面'
  }
  finally {
    saving.value = false
  }
}

async function openDocument(document: TextDocumentSummary) {
  errorMessage.value = ''
  try {
    const versions = await $fetch<TextDocumentVersionRecord[]>(`/api/text-creation/documents/${document.id}/versions`)
    const latest = versions[0]
    if (!latest)
      return
    current.value = latest
    draft.value = structuredClone(latest.content)
    kind.value = document.kind
    savedMessage.value = `已打开版本 ${latest.version}`
  }
  catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || '打开文档失败'
  }
}

function newDocument() {
  current.value = undefined
  draft.value = undefined
  brief.value = ''
  savedMessage.value = ''
  errorMessage.value = ''
}

function selectKind(value: TextCreationKind) {
  if (current.value && value !== kind.value) {
    current.value = undefined
    draft.value = undefined
    savedMessage.value = '已切换创作类型，将创建新文档'
  }
  kind.value = value
}
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
                  结果会保存人物和场景结构，后续可直接衔接图片与视频。
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

              <UFormField label="创作想法" :hint="`${brief.length} / 12K`" size="sm">
                <UTextarea v-model="brief" :rows="7" autoresize :maxrows="12" maxlength="12000" class="w-full text-sm leading-relaxed" placeholder="例如：一个失去记忆的外卖员发现，每送完一单就会想起另一个人的人生……" />
              </UFormField>

              <div class="grid grid-cols-2 gap-3">
                <UFormField label="风格与基调" size="sm">
                  <UInput v-model="tone" class="w-full" size="sm" placeholder="温暖、悬疑、快节奏" />
                </UFormField>
                <UFormField label="目标受众" size="sm">
                  <UInput v-model="audience" class="w-full" size="sm" placeholder="可选" />
                </UFormField>
              </div>

              <UFormField label="目标篇幅" size="sm">
                <USelect v-model="length" :items="lengthItems" class="w-full" size="sm" />
              </UFormField>
              <UFormField label="文本模型" size="sm">
                <USelect v-model="connectionId" :items="providerItems" class="w-full" size="sm" placeholder="选择私有连接" :disabled="!providerItems.length" />
              </UFormField>

              <UAlert v-if="!providerItems.length && user" color="warning" variant="subtle" icon="i-lucide-plug-zap" description="请在服务端配置 NUXT_TEXT_LLM_CONNECTIONS_JSON；也可自动复用现有 ComfyUI 大模型连接。" />
              <UAlert v-if="errorMessage" color="error" variant="subtle" icon="i-lucide-circle-alert" :description="errorMessage" />
              <UAlert v-if="savedMessage" color="success" variant="subtle" icon="i-lucide-circle-check" :description="savedMessage" />

              <UButton block color="primary" size="lg" icon="i-lucide-sparkles" :loading="generating" :disabled="!!user && (!brief.trim() || !providerItems.length)" @click="generate">
                {{ current ? '基于当前文档重新生成' : '生成并保存' }}
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
            <button v-for="document in documents.slice(0, 6)" :key="document.id" type="button" class="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted" @click="openDocument(document)">
              <UIcon :name="document.kind === 'script' ? 'i-lucide-clapperboard' : document.kind === 'copy' ? 'i-lucide-megaphone' : 'i-lucide-book-open'" class="mt-0.5 size-4 shrink-0 text-dimmed" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-xs font-semibold text-toned">{{ document.title }}</span>
                <span class="block truncate text-[11px] text-dimmed">版本 {{ document.currentVersion }} · {{ document.summary }}</span>
              </span>
            </button>
          </UCard>
        </div>

        <UCard class="min-h-[720px]" :ui="{ body: 'p-0 sm:p-0' }">
          <template v-if="draft">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-5 py-3.5">
              <div class="min-w-0">
                <p class="text-[11px] text-dimmed">
                  项目文档 · 版本 {{ current?.version }} · {{ current?.source === 'ai' ? 'AI 生成' : '手动保存' }}
                </p>
                <input v-model="draft.title" aria-label="文档标题" class="mt-0.5 w-full bg-transparent text-lg font-650 text-highlighted outline-none" maxlength="160">
              </div>
              <UButton color="primary" variant="soft" size="sm" icon="i-lucide-save" :loading="saving" @click="saveVersion">
                保存新版本
              </UButton>
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
                除了正文，还会保留人物设定、场景画面、动作和对白。它们将成为后续角色图、分镜图和视频镜头的稳定输入。
              </p>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </main>
</template>
