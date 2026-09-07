import type {
  ComfyHistoryEntry,
  ComfyObjectInfo,
  ComfyOutputFile,
  ComfyPromptResponse,
  ComfyQueueState,
  ComfyUIStatus,
  ComfyUploadType,
  ComfyWorkflowJSON,
  ComfyWorkflowRecord,
  ComfyWorkflowSummary,
  ComfyWorkflowVisibility,
  ComfyWsMessage,
} from '#shared/types/comfyui'
import { buildViewUrl, collectOutputFiles } from '~/utils/comfy-graph'

/** 模块级状态：工作流页面是唯一消费者，多处组件共享同一份服务状态。 */
const status = ref<ComfyUIStatus | null>(null)
const objectInfo = shallowRef<ComfyObjectInfo>({})
const workflows = ref<ComfyWorkflowSummary[]>([])

function messageOf(error: unknown): string {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  }
  return candidate?.data?.statusMessage || candidate?.statusMessage || candidate?.message || '请求失败'
}

export function useComfyServer() {
  async function refreshStatus() {
    status.value = await $fetch<ComfyUIStatus>('/api/comfyui/status')
    return status.value
  }

  async function startService() {
    status.value = await $fetch<ComfyUIStatus>('/api/comfyui/start', { method: 'POST', body: {} })
    return status.value
  }

  async function stopService() {
    status.value = await $fetch<ComfyUIStatus>('/api/comfyui/stop', { method: 'POST', body: {} })
    return status.value
  }

  async function installService(installDeps = true) {
    await $fetch('/api/comfyui/install', { method: 'POST', body: { installDeps } })
    await refreshStatus()
  }

  async function loadObjectInfo(refresh = false) {
    const result = await $fetch<ComfyObjectInfo>('/api/comfyui/object-info', {
      query: refresh ? { refresh: '1' } : undefined,
    })
    objectInfo.value = result ?? {}
    return objectInfo.value
  }

  async function submitPrompt(payload: {
    prompt: Record<string, unknown>
    workflow?: ComfyWorkflowJSON
    clientId?: string
    front?: boolean
  }) {
    return await $fetch<ComfyPromptResponse>('/api/comfyui/prompt', { method: 'POST', body: payload })
  }

  async function fetchHistoryEntry(promptId: string) {
    return await $fetch<ComfyHistoryEntry>(`/api/comfyui/history/${promptId}`)
  }

  async function fetchQueue() {
    return await $fetch<ComfyQueueState>('/api/comfyui/queue')
  }

  async function clearQueue() {
    await $fetch('/api/comfyui/queue', { method: 'POST', body: { clear: true } })
  }

  async function deleteQueueItems(numbers: number[]) {
    await $fetch('/api/comfyui/queue', { method: 'POST', body: { delete: numbers } })
  }

  async function interrupt() {
    await $fetch('/api/comfyui/interrupt', { method: 'POST', body: {} })
  }

  async function freeMemory() {
    await $fetch('/api/comfyui/free', { method: 'POST', body: { unloadModels: true, freeMemory: true } })
  }

  async function uploadAsset(file: File, kind: ComfyUploadType) {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    const uploaded = await $fetch<{ name: string, subfolder: string, type: string }>('/api/comfyui/upload', { method: 'POST', body: form })
    // 上传后加载节点的 COMBO 需要新文件，必须回源刷新节点定义。
    await loadObjectInfo(true)
    return uploaded
  }

  async function refreshWorkflows() {
    workflows.value = await $fetch<ComfyWorkflowSummary[]>('/api/comfyui/workflows')
    return workflows.value
  }

  async function loadWorkflow(id: string) {
    return await $fetch<ComfyWorkflowRecord>(`/api/comfyui/workflows/${id}`)
  }

  async function saveWorkflow(payload: { id?: string, name: string, graph: ComfyWorkflowJSON, visibility?: ComfyWorkflowVisibility }) {
    const record = await $fetch<ComfyWorkflowRecord>('/api/comfyui/workflows', {
      method: 'POST',
      body: payload,
    })
    await refreshWorkflows()
    return record
  }

  async function removeWorkflow(id: string) {
    await $fetch(`/api/comfyui/workflows/${id}`, { method: 'DELETE' })
    await refreshWorkflows()
  }

  return {
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
    fetchQueue,
    clearQueue,
    deleteQueueItems,
    interrupt,
    freeMemory,
    uploadAsset,
    refreshWorkflows,
    loadWorkflow,
    saveWorkflow,
    removeWorkflow,
    messageOf,
  }
}

const executedOutputs = ref<Record<string, Record<string, unknown>>>({})

// 模块级事件状态：保证工作流页面、工具栏、检查器与各节点卡片状态完全同步
const connected = ref(false)
const queueRemaining = ref(0)
const runningPromptId = ref<string | null>(null)
const executingNodeId = ref<string | null>(null)
const progress = ref<{ value: number, max: number } | null>(null)
const cachedNodeIds = ref<string[]>([])
const lastError = ref<string | null>(null)
const lastErrorNodeId = ref<string | null>(null)
const completedPromptIds = ref<string[]>([])

let socket: WebSocket | null = null

/**
 * ComfyUI 实时事件流。浏览器连本服务的 WebSocket 代理，不直连 ComfyUI。
 * 连接不可用时调用方退化为轮询历史，功能不缺失，只是没有逐节点进度。
 */
export function useComfyEvents() {
  function handleMessage(message: ComfyWsMessage) {
    const data = (message.data ?? {}) as Record<string, unknown>
    const promptId = typeof data.prompt_id === 'string' ? data.prompt_id : null
    if (promptId && runningPromptId.value && promptId !== runningPromptId.value)
      return

    switch (message.type) {
      case 'status':
        queueRemaining.value = (data.status as { exec_info?: { queue_remaining?: number } } | undefined)
          ?.exec_info
          ?.queue_remaining ?? 0
        break
      case 'execution_start':
        progress.value = null
        cachedNodeIds.value = []
        break
      case 'execution_cached': {
        const cached = (data.nodes as string[] | undefined) ?? []
        cachedNodeIds.value = cached
        break
      }
      case 'executing': {
        const node = typeof data.node === 'string' ? data.node : null
        executingNodeId.value = node
        if (!node && promptId) {
          progress.value = null
          if (!completedPromptIds.value.includes(promptId))
            completedPromptIds.value = [...completedPromptIds.value, promptId]
        }
        break
      }
      case 'progress':
        progress.value = { value: Number(data.value ?? 0), max: Number(data.max ?? 100) }
        break
      case 'executed': {
        const node = typeof data.node === 'string' ? data.node : null
        const output = data.output as Record<string, unknown> | undefined
        if (node && output) {
          executedOutputs.value = {
            ...executedOutputs.value,
            [node]: output,
          }
        }
        break
      }
      case 'execution_error': {
        lastError.value = String(data.exception_message ?? '工作流执行失败')
        const failedNodeId = typeof data.node_id === 'string' ? data.node_id : null
        lastErrorNodeId.value = failedNodeId
        runningPromptId.value = null
        executingNodeId.value = null
        progress.value = null
        break
      }
      case 'execution_interrupted':
        runningPromptId.value = null
        executingNodeId.value = null
        progress.value = null
        break
      default:
        break
    }
  }

  function connect(clientId: string) {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))
      return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(`${protocol}//${window.location.host}/api/comfyui/ws?clientId=${encodeURIComponent(clientId)}`)
    socket.addEventListener('open', () => {
      connected.value = true
    })
    socket.addEventListener('message', (event) => {
      try {
        handleMessage(JSON.parse(String(event.data)) as ComfyWsMessage)
      }
      catch {
        // 忽略无法解析的事件，避免中断后续消息处理
      }
    })
    socket.addEventListener('close', () => {
      connected.value = false
      socket = null
    })
    socket.addEventListener('error', () => {
      connected.value = false
    })
  }

  function disconnect() {
    socket?.close()
    socket = null
    connected.value = false
  }

  function watchPrompt(promptId: string) {
    runningPromptId.value = promptId
    lastError.value = null
    lastErrorNodeId.value = null
    completedPromptIds.value = completedPromptIds.value.filter(id => id !== promptId)
  }

  function resetRun() {
    runningPromptId.value = null
    executingNodeId.value = null
    progress.value = null
    cachedNodeIds.value = []
    lastError.value = null
    lastErrorNodeId.value = null
  }

  return {
    connected,
    queueRemaining,
    runningPromptId,
    executingNodeId,
    progress,
    cachedNodeIds,
    lastError,
    lastErrorNodeId,
    completedPromptIds,
    executedOutputs,
    connect,
    disconnect,
    watchPrompt,
    resetRun,
  }
}

export function useComfyOutputs() {
  const outputs = ref<ComfyOutputFile[]>([])

  function setFromHistory(entry?: ComfyHistoryEntry) {
    outputs.value = collectOutputFiles(entry)
  }

  return { outputs, setFromHistory, viewUrl: buildViewUrl }
}
