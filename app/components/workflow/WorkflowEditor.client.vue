<script setup lang="ts">
import type { RunSummary } from '#shared/types/platform'
import type { ComfyCatalog, ComfyRuntimeStatus, WorkflowGraph, WorkflowLayout, WorkflowRecord, WorkflowValue } from '#shared/types/workflow'
import type { WorkflowPreview } from '#shared/utils/comfy-visual'
import type { Connection } from '@vue-flow/core'
import { isVisualWorkflow, workflowNodeCount } from '#shared/utils/comfy-visual'
import { compatibleOutput, defaultNodeInputs, importWorkflow, isLink, nodeInputs, validateWorkflow, workflowChoiceIssue } from '#shared/utils/workflow'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useVueFlow, VueFlow } from '@vue-flow/core'
import { useIntervalFn } from '@vueuse/core'
import { runStatusLabel } from '~/utils/run-labels'
import WorkflowMinimap from './WorkflowMinimap.vue'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '~/assets/css/workflow.css'

interface CatalogResponse { installedCount: number, connectionId: string, model: string, revisionId: string, catalog: ComfyCatalog, rules: Record<string, { assetInputs: string[], serverInputs: string[] }>, maxNodes: number }
interface CanvasEdge { id: string, source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null }
interface CanvasNode { id: string, type: string, position: { x: number, y: number }, data: NodeData }
interface NodeData { classType: string, title?: string, inputs: Record<string, WorkflowValue>, definition?: ComfyCatalog[string], previewPorts?: ComfyCatalog[string] }
const { user, refreshSession } = useAuth()
const route = useRoute()
const { fitView, screenToFlowCoordinate, onNodesInitialized } = useVueFlow('workflow')
let pendingFit = false
onNodesInitialized(() => {
  if (pendingFit) {
    pendingFit = false
    void fitView({ padding: 0.2, maxZoom: 1 })
  }
})
const nodes = ref<CanvasNode[]>([])
const edges = ref<CanvasEdge[]>([])
const catalog = ref<CatalogResponse>()
const runtime = ref<ComfyRuntimeStatus>()
const saved = ref<WorkflowRecord[]>([])
const recent = ref<RunSummary[]>([])
const current = ref<RunSummary>()
const name = ref('未命名工作流')
const workflowId = ref<string>()
const revision = ref<number>()
const isTemplate = ref(false)
const bindings = ref<Record<string, string>>({})
const selectedId = ref('')
const search = ref('')
const tab = ref('nodes')
const mobilePanel = ref('canvas')
const busy = ref(false)
const uploading = ref(false)
const toast = useToast()
function notify(description: string, color: 'error' | 'info' | 'warning' = 'info') {
  toast.add({ title: color === 'error' ? '操作未完成' : color === 'warning' ? '工作流需要处理' : '工作流消息', description, color, icon: color === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-info', duration: color === 'info' ? 6000 : 10000, close: true })
}
const loadIssues = ref<string[]>([])
const settingsOpen = ref(false)
watch(() => runtime.value?.message, (value) => {
  if (value)
    notify(value, runtime.value?.state === 'error' ? 'error' : 'info')
})
watch(loadIssues, (issues) => {
  if (issues.length)
    notify(`已恢复画布，${issues.length} 项参数需要处理，暂不可保存或运行。请在右侧查看详情。`, 'warning')
})
const fileInput = ref<HTMLInputElement>()
const assetInput = ref<HTMLInputElement>()
const uploadField = ref('')
const idempotencyKey = ref('')
const selected = computed(() => nodes.value.find(node => node.id === selectedId.value))
const definition = computed(() => selected.value && catalog.value?.catalog[selected.value.data.classType])
const canvasGraph = computed(graph)
const fields = computed(() => Object.entries(nodeInputs(definition.value, canvasGraph.value[selectedId.value]?.inputs)))
const visibleNodes = computed(() => Object.entries(catalog.value?.catalog || {}).filter(([key, node]) => `${key} ${node.display_name} ${node.category}`.toLowerCase().includes(search.value.toLowerCase())))
const groups = computed(() => {
  const grouped: Record<string, typeof visibleNodes.value> = {}
  for (const entry of visibleNodes.value)
    (grouped[entry[1].category || '其他'] ||= []).push(entry)
  return grouped
})
const active = computed(() => current.value && ['PENDING', 'RUNNING'].includes(current.value.status))
const runtimeLabels = { disabled: '独立服务', missing: '尚未安装', stopped: '已停止', starting: '启动中', running: '运行中', external: '外部服务', error: '启动失败' }
function graph(): WorkflowGraph {
  const result: WorkflowGraph = {}
  for (const node of nodes.value)
    result[node.id] = { class_type: node.data.classType, inputs: Object.fromEntries(Object.entries(node.data.inputs).filter(([key]) => !catalog.value?.rules[node.data.classType]?.serverInputs?.includes(key))), _meta: { title: node.data.title } }
  for (const edge of edges.value) {
    if (result[edge.target] && edge.targetHandle)
      result[edge.target]!.inputs[edge.targetHandle] = [edge.source, Number(edge.sourceHandle)]
  }
  return result
}
function layout(): WorkflowLayout {
  return { positions: Object.fromEntries(nodes.value.map(node => [node.id, { ...node.position }])) }
}
const fingerprint = computed(() => JSON.stringify({ name: name.value, graph: graph(), bindings: bindings.value, revision: catalog.value?.revisionId }))
watch(fingerprint, () => {
  idempotencyKey.value = ''
})
const draftKey = `huezumi:workflow:${user.value!.id}`
let draftTimer: ReturnType<typeof setTimeout> | undefined
watch([nodes, edges, bindings, name, workflowId, revision, isTemplate, () => current.value?.id], () => {
  clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    if (loadIssues.value.length)
      return
    try {
      localStorage.setItem(draftKey, JSON.stringify({ graph: graph(), layout: layout(), bindings: bindings.value, name: name.value, workflowId: workflowId.value, revision: revision.value, isTemplate: isTemplate.value, runId: current.value?.id }))
    }
    catch {
      notify('浏览器草稿空间不足，请保存工作流或导出 JSON。')
    }
  }, 500)
}, { deep: true })
onBeforeUnmount(() => clearTimeout(draftTimer))
function message(e: unknown) {
  const err = e as { data?: { data?: { message?: string }, message?: string }, message?: string }
  return err.data?.data?.message || err.data?.message || err.message || '操作失败，请稍后重试'
}
async function attempt(fn: () => Promise<void>) {
  if (busy.value)
    return
  busy.value = true
  try {
    await fn()
  }
  catch (e) {
    notify(message(e), 'error')
  }
  finally {
    busy.value = false
  }
}
function hydrate(input: WorkflowGraph, positions?: WorkflowLayout, ports?: ComfyCatalog) {
  loadIssues.value = []
  pendingFit = true
  const nextEdges: CanvasEdge[] = []
  nodes.value = Object.entries(input).map(([id, node], index) => {
    const inputs: Record<string, WorkflowValue> = {}
    for (const [field, value] of Object.entries(node.inputs)) {
      if (isLink(value))
        nextEdges.push({ id: `${id}:${field}`, source: value[0], sourceHandle: String(value[1]), target: id, targetHandle: field })
      else
        inputs[field] = value
    }
    return { id, type: 'comfy', position: positions?.positions[id] || { x: (index % 3) * 340, y: Math.floor(index / 3) * 330 }, data: { classType: node.class_type, inputs, title: node._meta?.title, definition: catalog.value?.catalog[node.class_type], previewPorts: ports?.[id] } }
  })
  edges.value = nextEdges
  selectedId.value = nodes.value[0]?.id || ''
}
async function refreshCatalog() {
  catalog.value = await $fetch<CatalogResponse>('/api/workflows/catalog')
  for (const node of nodes.value)
    node.data.definition = catalog.value.catalog[node.data.classType]
}
async function refreshLibrary() {
  saved.value = await $fetch<WorkflowRecord[]>('/api/workflows')
}
async function refreshRuns() {
  const result = await $fetch<{ items: RunSummary[] }>('/api/runs', { query: { kind: 'workflow', limit: 30 } })
  recent.value = result.items
  if (current.value)
    current.value = await $fetch<RunSummary>(`/api/runs/${current.value.id}`)
}
async function refreshRuntime() {
  runtime.value = await $fetch<ComfyRuntimeStatus>('/api/workflows/runtime')
}
async function reload() {
  const results = await Promise.allSettled([refreshCatalog(), refreshRuntime(), refreshLibrary(), refreshRuns()])
  const failed = results.find(result => result.status === 'rejected')
  if (failed?.status === 'rejected')
    notify(message(failed.reason), 'error')
}
onMounted(async () => {
  await reload()
  if (typeof route.query.run === 'string') {
    try {
      current.value = await $fetch<RunSummary>(`/api/runs/${route.query.run}`)
    }
    catch (e) {
      notify(message(e), 'error')
    }
  }
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey) || 'null')
    if (draft) {
      const emptyGraph = draft.graph && typeof draft.graph === 'object' && !Array.isArray(draft.graph) && !Object.keys(draft.graph).length
      if (!emptyGraph)
        hydrate(importWorkflow(draft.graph), draft.layout)
      name.value = draft.name || '未命名工作流'
      bindings.value = draft.bindings || {}
      workflowId.value = draft.workflowId
      revision.value = draft.revision
      isTemplate.value = Boolean(draft.isTemplate)
      if (draft.runId && !route.query.run)
        current.value = recent.value.find(run => run.id === draft.runId)
      if (!emptyGraph)
        notify('已恢复此账户的浏览器草稿')
    }
  }
  catch {
    notify('本地草稿无法恢复，可从已保存工作流载入。')
  }
})
let polling = false
useIntervalFn(async () => {
  if (polling)
    return
  polling = true
  try {
    const wasActive = active.value
    await refreshRuntime()
    if (wasActive || current.value?.stage === 'archiving') {
      await refreshRuns()
      if (wasActive && !active.value)
        await refreshSession()
    }
    if (runtime.value?.state === 'running' && !catalog.value)
      await refreshCatalog()
  }
  catch {
    /* Keep the graph intact during temporary service interruptions. */
  }
  finally {
    polling = false
  }
}, 5000)
function addNode(type: string, position?: { x: number, y: number }) {
  const def = catalog.value?.catalog[type]
  if (!def)
    return
  if (!nodes.value.length && !position)
    pendingFit = true
  const id = String(Math.max(0, ...nodes.value.map(node => Number(node.id) || 0)) + 1)
  nodes.value.push({ id, type: 'comfy', position: position || { x: 80 + nodes.value.length * 35, y: 80 + nodes.value.length * 35 }, data: { classType: type, definition: def, inputs: defaultNodeInputs(def) } })
  selectedId.value = id
}
function connect(connection: Connection) {
  const origin = nodes.value.find(node => node.id === connection.source)
  const target = nodes.value.find(node => node.id === connection.target)
  const output = origin?.data.definition?.output[Number(connection.sourceHandle)]
  const input = nodeInputs(target?.data.definition, canvasGraph.value[connection.target]?.inputs)[connection.targetHandle || '']
  if (!output || !input || !compatibleOutput(output, input) || connection.source === connection.target) {
    notify('端口类型不匹配，请连接兼容的输入和输出', 'error')
    return
  }
  edges.value = edges.value.filter(edge => !(edge.target === connection.target && edge.targetHandle === connection.targetHandle))
  edges.value.push({ ...connection, id: `${connection.target}:${connection.targetHandle}` })
}
function drop(event: DragEvent) {
  event.preventDefault()
  const type = event.dataTransfer?.getData('application/huezumi-node')
  if (type)
    addNode(type, screenToFlowCoordinate({ x: event.clientX, y: event.clientY }))
}
function drag(event: DragEvent, type: string) {
  event.dataTransfer?.setData('application/huezumi-node', type)
}
function linked(field: string) {
  return edges.value.some(edge => edge.target === selectedId.value && edge.targetHandle === field)
}
function selectValue(value: WorkflowValue | undefined): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}
function updateValue(field: string, value: string | number | boolean) {
  if (selected.value) {
    selected.value.data.inputs[field] = value
    if (definition.value) {
      const valid = nodeInputs(definition.value, selected.value.data.inputs)
      const defaults = defaultNodeInputs(definition.value, selected.value.data.inputs)
      selected.value.data.inputs = { ...defaults, ...Object.fromEntries(Object.entries(selected.value.data.inputs).filter(([key]) => key in valid)) }
      edges.value = edges.value.filter(edge => edge.target !== selectedId.value || Boolean(valid[edge.targetHandle || '']))
    }
  }
}
function removeSelected() {
  nodes.value = nodes.value.filter(node => node.id !== selectedId.value)
  edges.value = edges.value.filter(edge => edge.source !== selectedId.value && edge.target !== selectedId.value)
  bindings.value = Object.fromEntries(Object.entries(bindings.value).filter(([key]) => !key.startsWith(`${selectedId.value}.`)))
  selectedId.value = ''
}
async function loadGraph(value: unknown, positions?: WorkflowLayout) {
  if (isVisualWorkflow(value)) {
    const preview = await $fetch<WorkflowPreview>('/api/workflows/preview', { method: 'POST', body: value as Record<string, unknown> })
    hydrate(preview.graph, preview.layout, preview.ports)
    loadIssues.value = preview.issues
  }
  else {
    hydrate(importWorkflow(value), positions)
  }
  current.value = undefined
}
async function loadWorkflow(record: WorkflowRecord) {
  await attempt(async () => {
    await loadGraph(record.graph, record.layout)
    name.value = record.name
    const own = record.ownerId === user.value?.id
    workflowId.value = own ? record.id : undefined
    revision.value = own ? record.revision : undefined
    isTemplate.value = own && record.isTemplate
    bindings.value = own ? record.assets || {} : {}
    notify(own ? '已载入工作流' : '已从模板创建副本，请上传自己的素材')
    mobilePanel.value = 'canvas'
  })
}
function assertCompleteGraph() {
  if (loadIssues.value.length)
    throw new Error('此工作流的部分参数无法还原，请安装对应插件后重新载入，或从官方编辑器导出 API 格式 JSON')
}
function newWorkflow() {
  hydrate({})
  name.value = '未命名工作流'
  workflowId.value = undefined
  revision.value = undefined
  bindings.value = {}
  isTemplate.value = false
  current.value = undefined
  notify('已新建空白工作流')
}
async function save(copy = false) {
  await attempt(async () => {
    assertCompleteGraph()
    const body = { name: name.value, graph: graph(), layout: layout(), assets: bindings.value, revision: revision.value, isTemplate: isTemplate.value }
    const id = copy ? undefined : workflowId.value
    const result = id ? await $fetch<WorkflowRecord>(`/api/workflows/${id}`, { method: 'PUT', body }) : await $fetch<WorkflowRecord>('/api/workflows', { method: 'POST', body })
    workflowId.value = result.id
    revision.value = result.revision
    await refreshLibrary()
    notify('工作流已保存')
  })
}
function exportJson() {
  if (loadIssues.value.length)
    return
  const url = URL.createObjectURL(new Blob([JSON.stringify({ name: name.value, graph: graph(), layout: layout() }, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name.value || 'workflow'}.json`
  link.click()
  URL.revokeObjectURL(url)
}
async function importJson(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  await attempt(async () => {
    if (file.size > 2 * 1024 * 1024)
      throw new Error('工作流文件不能超过 2 MB')
    const data = JSON.parse(await file.text())
    await loadGraph(data.graph || data, data.layout)
    name.value = data.name || file.name.replace(/\.json$/, '')
    bindings.value = {}
    workflowId.value = undefined
    revision.value = undefined
    isTemplate.value = false
    notify('已导入工作流；缺失的节点会在画布中标记')
  })
  input.value = ''
}
function chooseAsset(field: string) {
  uploadField.value = `${selectedId.value}.${field}`
  assetInput.value?.click()
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  const field = uploadField.value
  uploading.value = true
  try {
    const body = new FormData()
    body.set('file', file)
    const asset = await $fetch<{ id: string }>('/api/assets', { method: 'POST', body })
    bindings.value[field] = asset.id
    notify(`已上传 ${file.name}`)
  }
  catch (e) {
    notify(message(e), 'error')
  }
  finally {
    uploading.value = false
    input.value = ''
  }
}
async function generate() {
  await attempt(async () => {
    assertCompleteGraph()
    if (!catalog.value)
      throw new Error('请先启动并配置工作流服务')
    const graphValue = graph()
    // Validate against freshly scanned choices; uploaded fields use owner-bound placeholders.
    await refreshCatalog()
    const validationGraph = structuredClone(graphValue)
    for (const [id, node] of Object.entries(validationGraph)) {
      for (const field of catalog.value.rules[node.class_type]?.assetInputs || []) {
        if (bindings.value[`${id}.${field}`])
          node.inputs[field] = '__owner_asset__'
      }
    }
    const problems = validateWorkflow(validationGraph, catalog.value.catalog)
    if (problems.length) {
      const problemNode = Object.entries(validationGraph).find(([, node]) => Object.entries(nodeInputs(catalog.value?.catalog[node.class_type], node.inputs)).some(([field, spec]) => workflowChoiceIssue(spec, node.inputs[field])))
      if (problemNode) {
        selectedId.value = problemNode[0]
        mobilePanel.value = 'details'
      }
    }
    if (problems.length)
      throw new Error(problems.slice(0, 4).join('；'))
    idempotencyKey.value ||= crypto.randomUUID()
    current.value = await $fetch<RunSummary>('/api/workflows/runs', { method: 'POST', body: { input: { prompt: name.value, graph: graphValue, assets: bindings.value }, idempotencyKey: idempotencyKey.value } })
    idempotencyKey.value = ''
    await refreshRuns()
  })
}
async function command(action: 'sync' | 'archive') {
  await attempt(async () => {
    await $fetch(`/api/runs/${current.value!.id}/${action}`, { method: 'POST' })
    notify(action === 'archive' ? '已安排重新保存，不会重新生成' : '已安排同步状态')
    await refreshRuns()
  })
}
async function runtimeCommand(action: 'start' | 'stop') {
  await attempt(async () => {
    runtime.value = await $fetch<ComfyRuntimeStatus>('/api/workflows/runtime', { method: 'POST', body: { action } })
  })
}
</script>

<template>
  <section class="studio-workspace">
    <div class="creation-content workflow-studio">
      <h1 class="sr-only">
        工作流创作台
      </h1>
      <div class="workflow-mobile-tabs studio-mode-picker">
        <button v-for="item in [{ id: 'library', label: '节点与模板' }, { id: 'canvas', label: '画布' }, { id: 'details', label: '参数与结果' }]" :key="item.id" type="button" class="studio-mode-picker__item" :class="{ 'is-active': mobilePanel === item.id }" :aria-pressed="mobilePanel === item.id" @click="mobilePanel = item.id">
          {{ item.label }}
        </button>
      </div>
      <div class="workflow-workspace">
        <aside class="workflow-library" :class="{ 'mobile-visible': mobilePanel === 'library' }">
          <StudioPanelHeader title="工作流创作" description="连接节点，组合你的创作灵感。" icon="i-lucide-workflow" />
          <div class="p-4 pb-3">
            <div class="studio-mode-picker" aria-label="工作流资源">
              <button v-for="item in [{ id: 'nodes', label: '节点', icon: 'i-lucide-box' }, { id: 'templates', label: '模板', icon: 'i-lucide-panels-top-left' }, { id: 'history', label: '任务', icon: 'i-lucide-history' }]" :key="item.id" type="button" class="studio-mode-picker__item" :class="{ 'is-active': tab === item.id }" :aria-pressed="tab === item.id" @click="tab = item.id">
                <UIcon :name="item.icon" class="size-4 shrink-0" />{{ item.label }}
              </button>
            </div>
          </div>
          <template v-if="tab === 'nodes'">
            <div class="px-4 pb-3">
              <UInput v-model="search" icon="i-lucide-search" placeholder="搜索节点…" class="w-full" />
              <div class="mt-2 flex items-center justify-between gap-2 text-xs text-dimmed">
                <span>已加载 {{ catalog?.installedCount || 0 }} 个节点</span>
                <UButton v-if="user?.role === 'admin'" size="xs" color="neutral" variant="ghost" @click="attempt(reload)">
                  刷新节点
                </UButton>
              </div>
            </div>
            <div class="workflow-scroll studio-scroll">
              <details v-for="(items, category) in groups" :key="category" :open="!!search" class="workflow-category">
                <summary>{{ category }} <span>{{ items?.length }}</span></summary>
                <button v-for="[key, node] in items" :key="key" type="button" class="workflow-library-node" draggable="true" @dragstart="drag($event, key)" @click="addNode(key)">
                  <UIcon name="i-lucide-box" /><span>{{ node.display_name || key }}<small>{{ key }}</small></span><UIcon name="i-lucide-plus" />
                </button>
              </details>
              <div v-if="!visibleNodes.length" class="p-5 text-sm text-muted">
                {{ catalog ? '没有匹配的节点' : '连接 ComfyUI 服务后，即可自动读取全部节点。' }}
              </div>
            </div>
          </template>
          <div v-else-if="tab === 'templates'" class="workflow-scroll studio-scroll p-3">
            <p class="mb-3 text-xs text-muted">
              我的工作流与平台模板 · 可另存副本
            </p>
            <button v-for="item in saved" :key="item.id" type="button" class="workflow-template" :disabled="busy" @click="loadWorkflow(item)">
              <UIcon name="i-lucide-panels-top-left" /><strong>{{ item.name }}</strong><small>{{ item.isTemplate ? '平台模板' : '我的工作流' }} · {{ workflowNodeCount(item.graph) }} 个节点</small>
            </button>
            <p v-if="!saved.length" class="py-6 text-sm text-muted">
              保存第一份工作流，或导入 ComfyUI API JSON 开始创作。
            </p>
          </div>
          <div v-else class="workflow-scroll studio-scroll p-3">
            <button v-for="run in recent" :key="run.id" type="button" class="workflow-template" @click="current = run; mobilePanel = 'details'">
              <strong>{{ runStatusLabel[run.status] }}</strong><small>{{ new Date(run.createdAt).toLocaleString() }}</small><small>{{ run.outputs.length }} 个作品</small>
            </button><p v-if="!recent.length" class="p-3 text-sm text-muted">
              还没有工作流任务
            </p>
          </div>
          <div class="studio-generate-action workflow-actions">
            <div class="workflow-service-controls">
              <span class="workflow-service-state" :class="{ 'is-running': runtime?.state === 'running' }">
                <span aria-hidden="true" />{{ runtime ? runtimeLabels[runtime.state] : '连接中' }}
              </span>
              <div class="flex items-center gap-1">
                <template v-if="user?.role === 'admin'">
                  <UButton size="xs" color="neutral" variant="ghost" :disabled="busy" @click="runtimeCommand(runtime?.state === 'running' ? 'stop' : 'start')">
                    {{ runtime?.state === 'running' ? '停止服务' : '启动服务' }}
                  </UButton>
                  <UTooltip text="服务设置">
                    <UButton icon="i-lucide-settings-2" size="xs" aria-label="工作流服务设置" color="neutral" variant="ghost" @click="settingsOpen = true" />
                  </UTooltip>
                </template>
                <UTooltip text="刷新节点与服务状态">
                  <UButton icon="i-lucide-refresh-cw" size="xs" aria-label="刷新节点与服务状态" color="neutral" variant="ghost" :loading="busy" @click="attempt(reload)" />
                </UTooltip>
              </div>
            </div>
            <UButton :loading="busy" :disabled="!!active || uploading || !!loadIssues.length || !nodes.length" icon="i-lucide-play" size="xl" block class="workflow-run-button" @click="generate">
              {{ active ? '正在生成' : '运行工作流' }}
            </UButton>
            <p class="mt-2 text-center text-xs text-dimmed">
              暂不计费 · 结果自动保存到作品库
            </p>
          </div>
        </aside>
        <main class="workflow-canvas-shell" :class="{ 'mobile-visible': mobilePanel === 'canvas' }">
          <div class="workflow-canvas-toolbar studio-result__header">
            <UIcon name="i-lucide-workflow" class="size-4 shrink-0 text-primary" />
            <UInput v-model="name" aria-label="工作流名称" variant="none" class="workflow-name min-w-0 flex-1" :ui="{ base: 'font-semibold text-sm' }" />
            <UButton icon="i-lucide-save" color="neutral" variant="ghost" :disabled="busy || !!loadIssues.length || !nodes.length" @click="save()">
              保存
            </UButton>
            <UButton color="neutral" variant="ghost" :disabled="busy || !!loadIssues.length || !nodes.length" @click="save(true)">
              另存
            </UButton>
            <UButton icon="i-lucide-file-plus" aria-label="新建空白工作流" color="neutral" variant="ghost" :disabled="busy" @click="newWorkflow" />
            <UButton icon="i-lucide-import" aria-label="导入工作流 JSON" color="neutral" variant="ghost" @click="fileInput?.click()" />
            <UButton icon="i-lucide-download" aria-label="导出工作流 JSON" color="neutral" variant="ghost" :disabled="!!loadIssues.length || !nodes.length" @click="exportJson" />
          </div>
          <div class="workflow-canvas" @drop="drop" @dragover.prevent>
            <VueFlow id="workflow" v-model:nodes="nodes" v-model:edges="edges" :min-zoom="0.15" :max-zoom="2" :default-edge-options="{ type: 'smoothstep' }" :delete-key-code="['Backspace', 'Delete']" @connect="connect" @node-click="({ node }) => { selectedId = node.id }" @pane-click="selectedId = ''">
              <template #node-comfy="props">
                <WorkflowNode v-bind="props" :data="{ ...props.data, inputs: canvasGraph[props.id]?.inputs || props.data.inputs }" />
              </template>
              <Background v-if="nodes.length" :gap="24" :size="0.7" />
              <Controls v-if="nodes.length" />
              <WorkflowMinimap v-if="nodes.length" />
            </VueFlow>
            <StudioEmptyState v-if="!nodes.length" class="workflow-empty" icon="i-lucide-workflow" title="让每一个灵感，都有自己的路径" description="从一个节点或模板开始，连接文本、图片与视频，组合成你的创作工作流。">
              <UButton color="neutral" variant="outline" icon="i-lucide-import" @click="fileInput?.click()">
                导入工作流
              </UButton>
            </StudioEmptyState>
          </div>
          <footer class="workflow-canvas-footer">
            <span>{{ nodes.length }} 个节点 · {{ edges.length }} 条连接</span><span>滚轮缩放 · 拖动画布 · Delete 删除选中项</span>
          </footer>
        </main>
        <aside class="workflow-inspector" :class="{ 'mobile-visible': mobilePanel === 'details' }">
          <div class="workflow-inspector-heading studio-result__header">
            <h2 class="flex items-center gap-2 text-sm font-semibold">
              <UIcon name="i-lucide-sliders-horizontal" class="size-4 text-primary" />节点详情
            </h2><UButton v-if="selected" icon="i-lucide-trash-2" aria-label="删除节点" color="neutral" variant="ghost" size="xs" @click="removeSelected" />
          </div>
          <div class="workflow-scroll studio-scroll">
            <details v-if="loadIssues.length" class="m-4 rounded-lg border border-default p-3 text-xs" open>
              <summary class="cursor-pointer font-medium">
                {{ loadIssues.length }} 项参数需要处理
              </summary>
              <p class="mt-2 text-muted">
                安装对应插件后重新载入，或从官方编辑器导出 API 格式 JSON。
              </p>
              <p v-for="issue in loadIssues" :key="issue" class="mt-2 text-muted">
                {{ issue }}
              </p>
            </details>
            <div v-if="selected" class="space-y-4 p-4">
              <div>
                <h3 class="font-semibold">
                  {{ definition?.display_name || selected.data.classType }}
                </h3><p class="mt-1 text-xs text-muted break-all">
                  {{ selected.data.classType }} · #{{ selected.id }}
                </p>
              </div>
              <p v-if="definition?.description" class="text-xs text-muted">
                {{ definition.description }}
              </p>
              <UFormField label="节点名称">
                <UInput v-model="selected.data.title" class="w-full" placeholder="自定义名称" />
              </UFormField>
              <UFormField v-for="[field, spec] in fields" :key="`${selected.id}.${field}`" :label="field" :description="spec[1]?.tooltip">
                <div v-if="linked(field)" class="flex items-center gap-2 text-xs text-primary">
                  <UIcon name="i-lucide-link" />已连接上游节点<UButton size="xs" variant="ghost" @click="edges = edges.filter(edge => !(edge.target === selectedId && edge.targetHandle === field))">
                    断开
                  </UButton>
                </div>
                <div v-else-if="catalog?.rules[selected.data.classType]?.assetInputs.includes(field)" class="space-y-2">
                  <UButton icon="i-lucide-upload" variant="soft" :loading="uploading" @click="chooseAsset(field)">
                    {{ bindings[`${selected.id}.${field}`] ? '更换素材' : '上传图片 / 视频' }}
                  </UButton><img v-if="bindings[`${selected.id}.${field}`]" :src="`/api/assets/${bindings[`${selected.id}.${field}`]}/content`" alt="输入素材" class="max-h-32 rounded-lg object-contain" @error="($event.target as HTMLImageElement).style.display = 'none'"><small v-if="bindings[`${selected.id}.${field}`]" class="block text-muted">素材已绑定当前账户</small>
                </div>
                <div v-else-if="Array.isArray(spec[0])" class="space-y-2">
                  <USelect :model-value="spec[0].includes(selectValue(selected.data.inputs[field])!) ? selectValue(selected.data.inputs[field]) : undefined" :items="spec[0]" :disabled="!spec[0].length" :placeholder="spec[0].length ? '请选择可用选项' : '暂无可选项'" class="w-full" @update:model-value="value => updateValue(field, value!)" />
                  <p v-if="workflowChoiceIssue(spec, selected.data.inputs[field])" role="status" class="text-xs text-muted">
                    {{ workflowChoiceIssue(spec, selected.data.inputs[field]) }}
                  </p>
                  <UButton v-if="workflowChoiceIssue(spec, selected.data.inputs[field])" size="xs" variant="soft" color="neutral" icon="i-lucide-refresh-cw" :disabled="busy" @click="attempt(refreshCatalog)">
                    刷新可选项
                  </UButton>
                </div>
                <UTextarea v-else-if="spec[0] === 'STRING' && spec[1]?.multiline" :model-value="String(selected.data.inputs[field] ?? '')" :rows="5" autoresize class="w-full" placeholder="写下你的创作描述…" @update:model-value="value => updateValue(field, value)" />
                <UInput v-else-if="spec[0] === 'STRING'" :model-value="String(selected.data.inputs[field] ?? '')" class="w-full" @update:model-value="value => updateValue(field, value)" />
                <UInput v-else-if="spec[0] === 'INT' || spec[0] === 'FLOAT'" type="number" :model-value="selected.data.inputs[field] as number" :min="spec[1]?.min" :max="spec[1]?.max" :step="spec[1]?.step || (spec[0] === 'INT' ? 1 : 0.01)" class="w-full" @update:model-value="value => updateValue(field, Number(value))" />
                <USwitch v-else-if="spec[0] === 'BOOLEAN'" :model-value="Boolean(selected.data.inputs[field])" @update:model-value="value => updateValue(field, value)" />
                <p v-else class="text-xs text-muted">
                  请在画布连接 {{ spec[0] }} 类型输出
                </p>
              </UFormField>
            </div>
            <div v-else class="workflow-inspector-empty">
              <UIcon name="i-lucide-sliders-horizontal" /><p>选择一个节点<br>编辑提示词、模型与素材</p>
            </div>
            <div v-if="user?.role === 'admin'" class="border-t border-default p-4">
              <UCheckbox v-model="isTemplate" label="保存为平台模板" />
            </div>
            <section v-if="current" class="workflow-results">
              <div class="flex items-center justify-between">
                <h2>运行结果</h2><UBadge variant="soft" size="xs">
                  {{ runStatusLabel[current.status] }}
                </UBadge>
              </div>
              <p class="mt-2 text-xs text-muted">
                {{ current.stage === 'review' ? '待核查执行状态' : current.stage === 'archiving' ? '正在保存作品' : '工作流暂不计费' }}
              </p>
              <p v-if="current.error" role="status" class="my-3 text-xs text-error">
                {{ current.error }}
              </p>
              <div v-for="(output, index) in current.workflow?.outputs?.filter(o => o.kind === 'text')" :key="index" class="workflow-text-output">
                {{ output.text }}
              </div>
              <template v-for="output in current.outputs" :key="output.id">
                <img v-if="output.kind === 'image' && output.url" :src="output.url" alt="工作流生成图片" class="mt-3 w-full rounded-lg"><video v-if="output.kind === 'video' && output.url" :src="output.url" controls preload="metadata" class="mt-3 w-full rounded-lg" />
              </template>
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton v-for="action in current.allowedActions" :key="action" size="xs" variant="soft" :disabled="busy" @click="command(action)">
                  {{ action === 'archive' ? '重试保存' : '同步状态' }}
                </UButton><UButton v-if="current.outputs.length" to="/projects" size="xs" color="neutral" variant="ghost">
                  作品库
                </UButton><UButton v-if="current.stage === 'review' && user?.role === 'admin'" to="/admin/tasks" size="xs" variant="soft">
                  核对任务
                </UButton>
              </div>
            </section>
          </div>
        </aside>
      </div>
      <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="importJson">
      <input ref="assetInput" type="file" accept="image/*,video/*,audio/*" class="hidden" @change="upload">
      <UModal v-model:open="settingsOpen" title="ComfyUI 服务与节点策略" description="管理员配置本地或独立部署的工作流后端" :ui="{ content: 'max-w-3xl' }">
        <template #body>
          <WorkflowSettings v-if="settingsOpen" @saved="reload" />
        </template>
      </UModal>
    </div>
  </section>
</template>
