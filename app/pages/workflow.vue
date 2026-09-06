<script setup lang="ts">
import type { ComfyObjectInfo, ComfyUploadType, ComfyWorkflowJSON, ComfyWorkflowVisibility } from '#shared/types/comfyui'
import type { Connection } from '@vue-flow/core'
import type { ComfyFlowEdge, ComfyFlowNode, ComfyNodeData } from '~/utils/comfy-graph'
import { canConnectTypes, serializeGraphToApiPrompt } from '#shared/types/comfyui'
import { useVueFlow, VueFlow } from '@vue-flow/core'
import { useIntervalFn } from '@vueuse/core'
import { useComfyEvents, useComfyOutputs, useComfyServer } from '~/composables/useComfyServer'
import {
  buildTypeIndex,
  createNodeData,
  createSampleGraph,
  exportWorkflow,
  importWorkflow,
} from '~/utils/comfy-graph'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

definePageMeta({ title: '工作流 · forkvdo' })

const { data: workflowSession } = await useFetch<{ user: { role: string } | null }>('/api/auth/session')
if (workflowSession.value?.user?.role !== 'admin')
  await navigateTo('/')

const {
  status,
  objectInfo,
  workflows,
  refreshStatus,
  startService,
  stopService,
  installService,
  loadObjectInfo,
  submitPrompt,
  fetchHistoryEntry,
  clearQueue,
  interrupt,
  freeMemory,
  uploadAsset,
  refreshWorkflows,
  loadWorkflow,
  saveWorkflow,
  removeWorkflow,
  messageOf,
} = useComfyServer()

const events = useComfyEvents()
const outputsState = useComfyOutputs()

const {
  nodes,
  edges,
  addNodes,
  removeNodes,
  addEdges,
  removeEdges,
  setNodes,
  setEdges,
  updateNodeInternals,
  updateNodeData,
  fitView,
  screenToFlowCoordinate,
  findNode,
  getSelectedNodes,
  getSelectedEdges,
  zoomIn,
  zoomOut,
  zoomTo,
  viewport,
} = useVueFlow()

const flowNodes = computed<ComfyFlowNode[]>(() => nodes.value as unknown as ComfyFlowNode[])
const flowEdges = computed(() => edges.value as unknown as ComfyFlowEdge[])

const typeIndex = computed(() => buildTypeIndex(objectInfo.value ?? {}))
const typeList = computed(() => Object.values(typeIndex.value))

const workflowName = ref('未命名工作流')
const workflowVisibility = ref<ComfyWorkflowVisibility>('private')
const currentWorkflowId = ref<string | undefined>()
const saving = ref(false)
const issues = ref<string[]>([])
const runError = ref<string | null>(null)
const clientId = ref<string>('')
const isMobile = ref(false)
const showLibrary = ref(true)
const showInspector = ref(true)
const libraryMode = ref<'workflows' | 'nodes'>('workflows')
const workflowLoading = ref(false)
const importInputRef = ref<HTMLInputElement | null>(null)

const runningPromptId = ref<string | null>(null)
const isRunning = computed(() => Boolean(runningPromptId.value))

const selectedNode = computed<ComfyFlowNode | null>(() => {
  const selected = getSelectedNodes.value as unknown as ComfyFlowNode[]
  return selected[0] ?? null
})

const selectedEdge = computed<ComfyFlowEdge | null>(() => {
  const selected = getSelectedEdges.value as unknown as ComfyFlowEdge[]
  return selected[0] ?? null
})

function deleteEdge(id: string) {
  removeEdges([id])
}

const canRun = computed(() => status.value?.state === 'running' && !isRunning.value && flowNodes.value.length > 0)

function nextNodeId(): string {
  let max = 0
  for (const node of flowNodes.value) {
    const n = Number.parseInt(node.id, 10)
    if (!Number.isNaN(n))
      max = Math.max(max, n)
  }
  return String(max + 1)
}

function addNode(type: string, position?: { x: number, y: number }) {
  const info = typeIndex.value[type]
  if (!info)
    return
  const id = nextNodeId()
  const fallbackPosition = {
    x: 80 + (Math.random() - 0.5) * 80,
    y: 120 + (Math.random() - 0.5) * 80,
  }
  const node: ComfyFlowNode = {
    id,
    type: 'comfy',
    position: position ?? fallbackPosition,
    data: createNodeData(info),
  }
  addNodes([node])
  nextTick(() => updateNodeInternals([id]))
}

function ensureObjectInfo(): ComfyObjectInfo {
  if (!objectInfo.value || Object.keys(objectInfo.value).length === 0)
    throw new Error('节点定义尚未加载，请先连接 ComfyUI')
  return objectInfo.value
}

function isValidConnection(connection: Connection) {
  const source = findNode(connection.source)
  const target = findNode(connection.target)
  if (!source || !target)
    return false
  const sourceData = source.data as ComfyNodeData
  const targetData = target.data as ComfyNodeData
  const outputSlot = sourceData.outputSlots[Number(connection.sourceHandle ?? 0)]
  const inputSlot = targetData.inputSlots.find(slot => slot.name === connection.targetHandle)
  if (!outputSlot || !inputSlot)
    return false
  return canConnectTypes(inputSlot.type, outputSlot.type)
}

function onConnect(connection: Connection) {
  if (!isValidConnection(connection))
    return

  const source = findNode(connection.source)
  const target = findNode(connection.target)
  if (!source || !target)
    return

  const sourceData = source.data as ComfyNodeData
  const outputSlot = sourceData.outputSlots[Number(connection.sourceHandle ?? 0)]
  if (!outputSlot)
    return

  // ComfyUI 拓扑规则：一个输入插槽只能接一根连线。若目标插槽已有连线，自动替换旧连线
  const existingEdge = flowEdges.value.find(
    edge => edge.target === connection.target && edge.targetHandle === connection.targetHandle,
  )
  if (existingEdge) {
    removeEdges([existingEdge.id])
  }

  const nextId = `e${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const newEdge: ComfyFlowEdge = {
    id: nextId,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    data: { type: outputSlot.type },
  }

  addEdges([newEdge])
}

function onDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/comfy-node')
  if (!type)
    return
  event.preventDefault()
  const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  addNode(type, position)
}

function onDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('application/comfy-node'))
    event.preventDefault()
}

function buildGraph(): ComfyWorkflowJSON {
  return exportWorkflow(flowNodes.value, flowEdges.value, {
    name: workflowName.value,
    id: currentWorkflowId.value,
  })
}

async function runWorkflow() {
  runError.value = null
  issues.value = []
  try {
    const info = ensureObjectInfo()
    const graph = buildGraph()
    const { prompt, issues: serializeIssues } = serializeGraphToApiPrompt(graph, info)
    issues.value = serializeIssues
    if (serializeIssues.length) {
      runError.value = '工作流还有未解决的输入问题，请先按右侧提示修正'
      return
    }
    if (Object.keys(prompt).length === 0) {
      runError.value = '当前工作流没有可执行的节点（所有节点都已被静音或绕过）'
      return
    }
    const result = await submitPrompt({ prompt, workflow: graph, clientId: clientId.value })
    runningPromptId.value = result.promptId
    events.watchPrompt(result.promptId)
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

async function loadSample() {
  const sample = createSampleGraph(typeIndex.value)
  if (!sample) {
    runError.value = '当前 ComfyUI 缺少示例所需的基础节点（CheckpointLoaderSimple / KSampler / VAEDecode / SaveImage 等）'
    return
  }
  setNodes(sample.nodes)
  setEdges(sample.edges)
  await nextTick()
  fitView({ padding: 0.2, duration: 300, maxZoom: 1 })
}

function resetGraph(name = '未命名工作流') {
  setNodes([])
  setEdges([])
  workflowName.value = name
  workflowVisibility.value = 'private'
  currentWorkflowId.value = undefined
  issues.value = []
  runError.value = null
  outputsState.outputs.value = []
}

async function saveCurrent() {
  saving.value = true
  try {
    const graph = buildGraph()
    const record = await saveWorkflow({
      id: currentWorkflowId.value,
      name: workflowName.value,
      visibility: workflowVisibility.value,
      graph,
    })
    currentWorkflowId.value = record.id
    workflowVisibility.value = record.visibility
  }
  catch (error) {
    runError.value = messageOf(error)
  }
  finally {
    saving.value = false
  }
}

async function openSaved(id: string) {
  try {
    const record = await loadWorkflow(id)
    if (record.scope === 'public') {
      currentWorkflowId.value = undefined
      workflowName.value = `${record.name}（副本）`
      workflowVisibility.value = 'private'
    }
    else {
      currentWorkflowId.value = record.id
      workflowName.value = record.name
      workflowVisibility.value = record.visibility
    }
    const { nodes: nextNodes, edges: nextEdges } = importWorkflow(record.graph, typeIndex.value)
    setNodes(nextNodes)
    setEdges(nextEdges)
    issues.value = []
    outputsState.outputs.value = []
    await nextTick()
    fitView({ padding: 0.2, duration: 300, maxZoom: 1 })
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

async function deleteSaved(id: string) {
  try {
    await removeWorkflow(id)
    if (currentWorkflowId.value === id)
      currentWorkflowId.value = undefined
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

async function exportJson() {
  const json = JSON.stringify(buildGraph(), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${workflowName.value || 'workflow'}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function onImportChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    input.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const graph = JSON.parse(String(reader.result)) as ComfyWorkflowJSON
      const result = importWorkflow(graph, typeIndex.value)
      setNodes(result.nodes)
      setEdges(result.edges)
      issues.value = result.missing.map(type => `工作流使用了当前环境没有的节点类型：${type}`)
      workflowName.value = graph.name || '导入的工作流'
      workflowVisibility.value = 'private'
      currentWorkflowId.value = undefined
      nextTick(() => fitView({ padding: 0.2, duration: 300, maxZoom: 1 }))
    }
    catch (error) {
      runError.value = error instanceof Error ? `解析 JSON 失败：${error.message}` : '解析 JSON 失败'
    }
    finally {
      input.value = ''
    }
  }
  reader.readAsText(file)
}

function updateNodeWidget(payload: { nodeId: string, widgetName: string, value: unknown }) {
  const node = findNode(payload.nodeId)
  if (!node)
    return

  const data = node.data as ComfyNodeData
  updateNodeData<ComfyNodeData>(payload.nodeId, {
    widgets: { ...data.widgets, [payload.widgetName]: payload.value },
  })
}

async function onUpload(payload: { file: File, kind: ComfyUploadType, nodeId: string, widgetName: string }) {
  try {
    const uploaded = await uploadAsset(payload.file, payload.kind)
    const value = [uploaded.subfolder, uploaded.name].filter(Boolean).join('/')
    if (!value)
      throw new Error('ComfyUI 没有返回上传文件名')

    const node = findNode(payload.nodeId)
    if (!node)
      return

    const data = node.data as ComfyNodeData
    const info = typeIndex.value[data.type]
    if (info) {
      updateNodeData<ComfyNodeData>(payload.nodeId, {
        widgetSpecs: info.widgets,
        inputSlots: info.inputs,
        outputSlots: info.outputs,
      })
    }
    updateNodeData<ComfyNodeData>(payload.nodeId, {
      widgets: { ...data.widgets, [payload.widgetName]: value },
    })
    await nextTick()
    updateNodeInternals([payload.nodeId])
    runError.value = null
    issues.value = []
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

/** 提交后轮询历史记录，WS 不可用或断连时仍能拿到终态。 */
async function pollCompletion() {
  if (!runningPromptId.value)
    return
  try {
    const entry = await fetchHistoryEntry(runningPromptId.value)
    if (entry?.status?.completed) {
      const id = runningPromptId.value
      outputsState.setFromHistory(entry)
      if (entry.status.status_str === 'error') {
        runError.value = events.lastError.value ?? '工作流执行失败，请查看 ComfyUI 日志'
      }
      runningPromptId.value = null
      events.resetRun()
      void id
    }
  }
  catch {
    // 上游抖动时留到下一次再试
  }
}

async function doStart() {
  try {
    await startService()
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

async function doStop() {
  try {
    await stopService()
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

async function doInstall() {
  try {
    await installService(true)
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

async function doRefresh() {
  try {
    await refreshStatus()
    if (status.value?.state === 'running')
      await loadObjectInfo(true)
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

async function loadWorkflowLibrary() {
  workflowLoading.value = true
  try {
    await refreshWorkflows()
  }
  catch (error) {
    runError.value = messageOf(error)
  }
  finally {
    workflowLoading.value = false
  }
}

async function doClearQueue() {
  try {
    runError.value = null
    await clearQueue()
    events.queueRemaining.value = 0
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

async function doInterrupt() {
  try {
    runError.value = null
    await interrupt()
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

async function doFreeMemory() {
  try {
    runError.value = null
    await freeMemory()
  }
  catch (error) {
    runError.value = messageOf(error)
  }
}

/** 监听 ws事件 进度，反映到对应节点的卡片上。 */
watch(
  () => [events.executingNodeId.value, events.progress.value, events.cachedNodeIds.value.length],
  () => {
    for (const node of flowNodes.value) {
      const data = node.data as ComfyNodeData
      const isExecuting = events.executingNodeId.value === node.id
      data.executing = isExecuting
      data.progress = isExecuting ? events.progress.value ?? undefined : undefined
    }
  },
)

watch(
  () => events.completedPromptIds.value,
  (completed) => {
    if (runningPromptId.value && completed.includes(runningPromptId.value)) {
      void pollCompletion()
    }
  },
  { deep: true },
)

const statusPolling = useIntervalFn(() => {
  if (status.value?.install.phase === 'running' || status.value?.state === 'starting')
    void refreshStatus()
}, 1500, { immediateCallback: false })
const completionPolling = useIntervalFn(pollCompletion, 1500, { immediateCallback: false })

onMounted(async () => {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
  clientId.value = crypto.randomUUID()
  events.connect(clientId.value)

  await refreshStatus()
  await loadWorkflowLibrary()

  if (status.value?.state === 'running')
    await loadObjectInfo()

  statusPolling.resume()
  completionPolling.resume()
})

onBeforeUnmount(() => {
  statusPolling.pause()
  completionPolling.pause()
  events.disconnect()
})
</script>

<template>
  <div class="comfy-shell">
    <WorkflowToolbar
      v-model:name="workflowName"
      v-model:visibility="workflowVisibility"
      :status="status"
      :busy="status?.install.phase === 'running' || status?.state === 'starting'"
      :running="isRunning"
      :queue-remaining="events.queueRemaining.value"
      :connected="events.connected.value"
      :workflows="workflows"
      :can-run="canRun"
      @refresh="doRefresh"
      @start="doStart"
      @stop="doStop"
      @install="doInstall"
      @run="runWorkflow"
      @save="saveCurrent"
      @load="openSaved"
      @remove="deleteSaved"
      @create="resetGraph"
      @import-json="() => importInputRef?.click()"
      @export-json="exportJson"
    />

    <div v-if="status?.mode === 'remote'" class="comfy-shell__notice">
      已连接远程 ComfyUI：<code>{{ status.baseUrl }}</code>。本地启动/停止按钮已禁用。
    </div>

    <div class="comfy-shell__grid" :class="{ 'comfy-shell__grid--collapsed': !showLibrary && !showInspector }">
      <WorkflowLibrary
        v-if="showLibrary"
        v-model:mode="libraryMode"
        :types="typeList"
        :workflows="workflows"
        :disabled="!typeList.length"
        :loading="workflowLoading"
        class="comfy-shell__library"
        @add="addNode"
        @load="openSaved"
      />

      <section
        class="comfy-shell__canvas"
        @drop="onDrop"
        @dragover="onDragOver"
      >
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          :is-valid-connection="isValidConnection"
          :delete-key-code="['Backspace', 'Delete']"
          :fit-view-on-init="false"
          :default-viewport="{ zoom: 1, x: 50, y: 50 }"
          :min-zoom="0.2"
          :max-zoom="2"
          :fit-view-options="{ maxZoom: 1, padding: 0.2 }"
          :default-edge-options="{ type: 'smoothstep', animated: true }"
          class="comfy-canvas__flow"
          @connect="onConnect"
        >
          <template #node-comfy="nodeProps">
            <WorkflowNodeCard v-bind="nodeProps" />
          </template>
        </VueFlow>

        <div class="comfy-canvas__controls nodrag">
          <button type="button" class="comfy-canvas__control-btn" title="缩小" @click="zoomOut()">
            <span class="i-lucide-minus" />
          </button>
          <button type="button" class="comfy-canvas__zoom-badge" title="重设缩放为 100%" @click="zoomTo(1)">
            {{ Math.round((viewport.zoom ?? 1) * 100) }}%
          </button>
          <button type="button" class="comfy-canvas__control-btn" title="放大" @click="zoomIn()">
            <span class="i-lucide-plus" />
          </button>
          <button type="button" class="comfy-canvas__control-btn" title="适应画布" @click="fitView({ maxZoom: 1, padding: 0.2, duration: 250 })">
            <span class="i-lucide-maximize-2" />
          </button>
        </div>

        <div v-if="!flowNodes.length" class="comfy-canvas__empty">
          <p>画布是空的</p>
          <p class="comfy-canvas__empty-meta">
            在左侧点击或拖拽节点加入画布，或
            <button type="button" class="comfy-canvas__sample" @click="loadSample">
              载入示例（文生图）
            </button>
          </p>
        </div>
      </section>

      <WorkflowInspector
        v-if="showInspector"
        :running="isRunning"
        :queue-remaining="events.queueRemaining.value"
        :progress="events.progress.value"
        :outputs="outputsState.outputs.value"
        :error="runError ?? events.lastError.value"
        :issues="issues"
        :selected-node="selectedNode"
        :selected-edge="selectedEdge"
        :node-count="flowNodes.length"
        :link-count="flowEdges.length"
        class="comfy-shell__inspector"
        @interrupt="doInterrupt"
        @clear-queue="doClearQueue"
        @free-memory="doFreeMemory"
        @upload="onUpload"
        @update-node-widget="updateNodeWidget"
        @delete-node="removeNodes"
        @delete-edge="deleteEdge"
      />
    </div>

    <input ref="importInputRef" type="file" accept="application/json" class="hidden" @change="onImportChange">
  </div>
</template>
