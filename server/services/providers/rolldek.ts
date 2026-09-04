import type { GenerationRequest, GenerationStatus, ProviderTaskResult, Resolution } from '#shared/types/generation'
import type { VideoProvider } from './base'

interface RollDekConfig {
  apiKey: string
  baseUrl: string
}

interface RollDekError {
  message?: string
  code?: string
}

interface RollDekCreateResponse {
  id?: string
  task_id?: string
  object?: string
  status?: string
  error?: string | RollDekError
  message?: string
}

interface RollDekTaskResponse {
  id?: string
  task_id?: string
  object?: string
  status?: string
  progress?: number
  metadata?: {
    url?: string
    duration?: number | string
  }
  video_url?: string
  error?: string | RollDekError
  message?: string
}

type RollDekResolution = Extract<Resolution, '480P' | '720P' | '1080P'>

const resolutionBySuffix: Record<Lowercase<RollDekResolution>, RollDekResolution> = {
  '480p': '480P',
  '720p': '720P',
  '1080p': '1080P',
}

/** RollDek 的模型后缀决定输出清晰度，不能使用统一请求里的 resolution 覆盖它。 */
export function resolveRollDekResolution(model: string): RollDekResolution {
  const suffix = model.match(/-(480p|720p|1080p)$/i)?.[1]?.toLowerCase() as Lowercase<RollDekResolution> | undefined
  const resolution = suffix ? resolutionBySuffix[suffix] : undefined
  if (!resolution)
    throw new Error('RollDek 模型必须带有 -480p、-720p 或 -1080p 分辨率后缀')
  return resolution
}

export function normalizeRollDekStatus(status?: string): GenerationStatus {
  switch (status?.toLowerCase()) {
    case 'queued':
      return 'PENDING'
    case 'in_progress':
    case 'running':
    case 'processing':
      return 'RUNNING'
    case 'completed':
    case 'succeeded':
      return 'SUCCEEDED'
    case 'failed':
      return 'FAILED'
    default:
      return 'UNKNOWN'
  }
}

function errorMessage(error: string | RollDekError | undefined, fallback: string) {
  if (typeof error === 'string' && error.trim())
    return error
  if (typeof error === 'object' && error !== null) {
    if (error.message?.trim())
      return error.message
    if (error.code?.trim())
      return error.code
  }
  return fallback
}

function buildReferenceImages(request: GenerationRequest) {
  return request.media
    .filter(item => item.type === 'first_frame' || item.type === 'last_frame' || item.type === 'reference_image')
    .map((item) => {
      const image: { url: string, role?: 'first_frame' | 'last_frame' } = { url: item.url }
      if (item.type === 'first_frame' || item.type === 'last_frame')
        image.role = item.type
      return image
    })
}

function buildReferenceVideos(request: GenerationRequest) {
  return request.media
    .filter(item => item.type === 'reference_video')
    .map((item) => {
      const video: { url: string, duration?: number } = { url: item.url }
      if (item.duration !== undefined)
        video.duration = item.duration
      return video
    })
}

function buildReferenceAudios(request: GenerationRequest) {
  return request.media
    .filter(item => item.type === 'reference_audio')
    .map(({ url }) => ({ url }))
}

/** 将平台请求转换为 RollDek WAN 3.0 的扁平 OpenAI 风格请求。 */
export function buildRollDekRequest(request: GenerationRequest) {
  const model = request.model || 'wan3.0-video-480p'
  const resolution = resolveRollDekResolution(model)
  const body: Record<string, unknown> = {
    model,
    prompt: request.prompt,
    seconds: String(request.duration),
    // RollDek 明确要求模型后缀优先；两个兼容字段始终保持一致。
    size: resolution,
    resolution,
    aspect_ratio: request.ratio,
    ratio: request.ratio,
  }

  const referenceImages = buildReferenceImages(request)
  const referenceVideos = buildReferenceVideos(request)
  const referenceAudios = buildReferenceAudios(request)
  if (referenceImages.length)
    body.reference_images = referenceImages
  if (referenceVideos.length)
    body.reference_videos = referenceVideos
  if (referenceAudios.length)
    body.reference_audios = referenceAudios

  return body
}

function responseTaskId(response: RollDekCreateResponse) {
  return response.id || response.task_id
}

function responseError(response: RollDekCreateResponse | RollDekTaskResponse, fallback: string) {
  return errorMessage(response.error, response.message || fallback)
}

export class RollDekProvider implements VideoProvider {
  readonly id = 'rolldek'

  constructor(private readonly config: RollDekConfig) {}

  private headers() {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  async submit(request: GenerationRequest) {
    const response = await $fetch<RollDekCreateResponse>(`${this.config.baseUrl}/v1/videos`, {
      method: 'POST',
      headers: this.headers(),
      body: buildRollDekRequest(request),
    })

    const taskId = responseTaskId(response)
    if (!taskId)
      throw new Error(responseError(response, 'RollDek 未返回任务 ID'))

    return { taskId, status: normalizeRollDekStatus(response.status || 'queued') }
  }

  async getTask(taskId: string): Promise<ProviderTaskResult> {
    const response = await $fetch<RollDekTaskResponse>(`${this.config.baseUrl}/v1/videos/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    })
    const status = normalizeRollDekStatus(response.status)
    const videoUrl = response.metadata?.url || response.video_url

    return {
      status,
      videoUrl,
      usage: response.metadata?.duration !== undefined ? { duration: Number(response.metadata.duration) } : undefined,
      error: status === 'FAILED' ? responseError(response, 'RollDek 生成失败') : undefined,
    }
  }
}
