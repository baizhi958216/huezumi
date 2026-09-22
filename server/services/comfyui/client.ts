import type {
  ComfyApiWorkflow,
  ComfyHistory,
  ComfyHistoryEntry,
  ComfyObjectInfo,
  ComfyPromptResponse,
  ComfyQueueState,
  ComfySystemStats,
} from '#shared/types/comfyui'
import { workflowRuntimeConnections } from '../platform/workflow-connections'
import { getComfyBaseUrl, getComfyConfig } from './config'

/** 上游不可用、超时或返回异常时统一抛出的错误。 */
export class ComfyUpstreamError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'ComfyUpstreamError'
  }
}

function summarizeErrorResponse(body: string): string | undefined {
  let payload: unknown
  try {
    payload = JSON.parse(body)
  }
  catch {
    return undefined
  }

  if (!payload || typeof payload !== 'object')
    return undefined
  const record = payload as Record<string, unknown>
  const nodeErrors = record.node_errors
  if (nodeErrors && typeof nodeErrors === 'object') {
    for (const value of Object.values(nodeErrors as Record<string, unknown>)) {
      if (!value || typeof value !== 'object')
        continue
      const errors = (value as Record<string, unknown>).errors
      if (!Array.isArray(errors))
        continue
      const first = errors.find(item => item && typeof item === 'object' && typeof (item as Record<string, unknown>).message === 'string') as Record<string, unknown> | undefined
      if (first) {
        const message = String(first.message)
        const details = typeof first.details === 'string' ? first.details : ''
        return details && details !== message ? `${message}（${details}）` : message
      }
    }
  }

  const error = record.error
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string')
    return String((error as Record<string, unknown>).message)
  return typeof error === 'string' ? error : undefined
}

async function request(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<unknown> {
  const config = getComfyConfig()
  const baseUrl = getComfyBaseUrl(config)
  const { timeoutMs = 30000, ...requestInit } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, { ...requestInit, signal: controller.signal })
  }
  catch (error) {
    clearTimeout(timer)
    const aborted = error instanceof Error && error.name === 'AbortError'
    throw new ComfyUpstreamError(
      aborted ? '请求 ComfyUI 超时' : '无法连接 ComfyUI',
      aborted ? 504 : 502,
      aborted ? undefined : (error instanceof Error ? error.message : undefined),
    )
  }
  clearTimeout(timer)

  if (!response.ok) {
    // 只提取 ComfyUI 返回的节点校验摘要，不把内部路径或完整响应透传给浏览器。
    const body = await response.text().catch(() => '')
    const detail = summarizeErrorResponse(body)
    throw new ComfyUpstreamError(
      detail ? `ComfyUI 返回 ${response.status}：${detail}` : `ComfyUI 返回 ${response.status}`,
      502,
      detail,
    )
  }

  // ComfyUI 部分控制接口（如 POST /queue、POST /free、POST /interrupt）成功时返回 200 但正文为空，
  // 直接 response.json() 会抛出 Unexpected end of JSON input。
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return {}
  }

  const text = await response.text()
  if (!text.trim()) {
    return {}
  }

  try {
    return JSON.parse(text)
  }
  catch (error) {
    throw new ComfyUpstreamError(
      'ComfyUI 返回了无法解析的响应',
      502,
      error instanceof Error ? error.message : undefined,
    )
  }
}

export async function fetchSystemStats(timeoutMs?: number): Promise<ComfySystemStats> {
  return await request('/system_stats', { timeoutMs }) as ComfySystemStats
}

export async function fetchObjectInfo(): Promise<ComfyObjectInfo> {
  return await request('/object_info', { timeoutMs: 60000 }) as ComfyObjectInfo
}

export interface SubmitPromptInput {
  prompt: ComfyApiWorkflow
  clientId?: string
  front?: boolean
  /** ComfyUI 要求 prompt_id 为合法 UUID，未提供时由上游生成 */
  promptId?: string
  /** 原始工作流图，随 extra_pnginfo 一起回传给 ComfyUI，便于在官方前端还原 */
  workflow?: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 提交工作流。ComfyUI 在校验失败时仍返回 200，错误藏在 `{ error, node_errors }` 里，
 * 这里把它翻成 422，避免前端把失败当成功。
 */
export async function submitPrompt(input: SubmitPromptInput): Promise<ComfyPromptResponse> {
  const connections = await workflowRuntimeConnections(input.prompt)
  if (connections) {
    const capability = await request('/huezumi/runtime-capabilities').catch(() => null) as { privateConnections?: number } | null
    if (capability?.privateConnections !== 1)
      throw new ComfyUpstreamError('请先更新并重启 ComfyUI 的 huezumi 节点包，再使用后台连接配置', 422)
  }
  const payload: Record<string, unknown> = { prompt: input.prompt }
  if (input.clientId)
    payload.client_id = input.clientId
  if (input.promptId && UUID_PATTERN.test(input.promptId))
    payload.prompt_id = input.promptId
  if (input.front)
    payload.front = true
  if (input.workflow)
    payload.extra_data = { extra_pnginfo: { workflow: input.workflow } }
  if (connections)
    payload.extra_data = { ...(payload.extra_data as object || {}), huezumi_connections: connections }

  const result = await request('/prompt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: 30000,
  }) as Record<string, unknown>

  if (result.error) {
    const nodeErrors = (result.node_errors ?? {}) as Record<string, { errors?: Array<{ message?: string }> }>
    const firstMessage = Object.values(nodeErrors)
      .flatMap(entry => entry.errors ?? [])
      .map(entry => entry.message)
      .find(Boolean)
    throw new ComfyUpstreamError(
      firstMessage || String(result.error) || 'ComfyUI 拒绝了这次提交',
      422,
      undefined,
    )
  }

  return {
    promptId: String(result.prompt_id ?? ''),
    number: Number(result.number ?? 0),
    nodeErrors: (result.node_errors ?? {}) as Record<string, unknown>,
  }
}

export async function fetchHistory(maxItems?: number): Promise<ComfyHistory> {
  const query = maxItems ? `?max_items=${encodeURIComponent(String(maxItems))}` : ''
  return await request(`/history${query}`) as ComfyHistory
}

export async function fetchHistoryEntry(promptId: string): Promise<ComfyHistoryEntry | undefined> {
  const history = await request(`/history/${encodeURIComponent(promptId)}`) as ComfyHistory
  return history?.[promptId]
}

export async function fetchQueue(): Promise<ComfyQueueState> {
  const raw = await request('/queue') as { queue_running?: unknown[], queue_pending?: unknown[] }
  return {
    queueRunning: raw.queue_running ?? [],
    queuePending: raw.queue_pending ?? [],
  }
}

export interface QueueMutation {
  clear?: boolean
  delete?: number[]
}

export async function mutateQueue(mutation: QueueMutation): Promise<void> {
  await request('/queue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(mutation),
  })
}

export async function interrupt(): Promise<void> {
  await request('/interrupt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
}

export async function freeMemory(options: { unloadModels?: boolean, freeMemory?: boolean }): Promise<void> {
  await request('/free', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      unload_models: options.unloadModels ?? true,
      free_memory: options.freeMemory ?? true,
    }),
  })
}

export interface UploadedImage {
  name: string
  subfolder: string
  type: string
}

export async function uploadImage(file: Blob, filename: string, overwrite = true): Promise<UploadedImage> {
  const form = new FormData()
  form.append('image', file, filename)
  form.append('overwrite', String(overwrite))

  const result = await request('/upload/image', { method: 'POST', body: form, timeoutMs: 60000 }) as Record<string, unknown>
  return {
    name: String(result.name ?? ''),
    subfolder: String(result.subfolder ?? ''),
    type: String(result.type ?? 'input'),
  }
}

export interface ViewedFile {
  body: ReadableStream<Uint8Array> | null
  contentType: string
}

/**
 * 读取 ComfyUI 输出/输入文件。type 只允许 input/output/temp，避免把仓库里的任意文件代理出去。
 */
export async function viewFile(params: {
  filename: string
  subfolder?: string
  type: 'input' | 'output' | 'temp'
  preview?: string
  channel?: string
}): Promise<ViewedFile> {
  const config = getComfyConfig()
  const search = new URLSearchParams({ filename: params.filename, type: params.type })
  if (params.subfolder)
    search.set('subfolder', params.subfolder)
  if (params.preview)
    search.set('preview', params.preview)
  if (params.channel)
    search.set('channel', params.channel)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  let response: Response
  try {
    response = await fetch(`${getComfyBaseUrl(config)}/view?${search.toString()}`, { signal: controller.signal })
  }
  catch (error) {
    clearTimeout(timer)
    const aborted = error instanceof Error && error.name === 'AbortError'
    throw new ComfyUpstreamError(aborted ? '读取 ComfyUI 文件超时' : '无法连接 ComfyUI', aborted ? 504 : 502)
  }
  clearTimeout(timer)

  if (!response.ok)
    throw new ComfyUpstreamError(`ComfyUI 读取文件失败（${response.status}）`, response.status === 404 ? 404 : 502)

  return {
    body: response.body,
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  }
}
