import type { GenerationRequest, GenerationStatus, ProviderTaskResult } from '#shared/types/generation'
import type { VideoProvider } from './base'
import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'

interface KlingConfig {
  accessKey: string
  secretKey: string
  baseUrl: string
}

interface KlingTaskResponse {
  code?: number
  message?: string
  data?: {
    task_id?: string
    task_status?: string
    task_result?: {
      videos?: Array<{ url?: string, duration?: string | number }>
    }
  }
}

/** Kling 状态枚举：submitted / processing / succeed / failed */
function normalizeStatus(status?: string): GenerationStatus {
  switch (status) {
    case 'submitted':
      return 'PENDING'
    case 'processing':
      return 'RUNNING'
    case 'succeed':
      return 'SUCCEEDED'
    case 'failed':
      return 'FAILED'
    default:
      return 'UNKNOWN'
  }
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url')
}

/**
 * 快手可灵 Kling。
 * 鉴权为 JWT（HS256）：header {alg,typ} + payload {iss: accessKey, exp, nbf}，用 secretKey 签名。
 * 分辨率不直接传参：std 模式 = 720P，pro 模式 = 1080P，由适配器映射。
 * 文生走 /videos/text2video，图生/首尾帧走 /videos/image2video；
 * providerTaskId 编码为 "<kind>:<taskId>" 以便查询时回到正确端点。
 */
export class KlingProvider implements VideoProvider {
  readonly id = 'kling'

  constructor(private readonly config: KlingConfig) {}

  private signToken() {
    const now = Math.floor(Date.now() / 1000)
    const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = base64Url(JSON.stringify({ iss: this.config.accessKey, exp: now + 1800, nbf: now - 5 }))
    const signature = createHmac('sha256', this.config.secretKey)
      .update(`${header}.${payload}`)
      .digest('base64url')
    return `${header}.${payload}.${signature}`
  }

  private headers() {
    return {
      'Authorization': `Bearer ${this.signToken()}`,
      'Content-Type': 'application/json',
    }
  }

  async submit(request: GenerationRequest) {
    const frames = new Map(request.media.map(item => [item.type, item.url]))
    const firstFrame = frames.get('first_frame') || frames.get('reference_image')
    const lastFrame = frames.get('last_frame')
    const kind = firstFrame ? 'image2video' : 'text2video'

    const body: Record<string, unknown> = {
      model_name: request.model || 'kling-v2-6',
      prompt: request.prompt || undefined,
      negative_prompt: request.negativePrompt || undefined,
      mode: request.resolution === '1080P' ? 'pro' : 'std',
      duration: String(request.duration),
    }

    if (kind === 'text2video') {
      body.aspect_ratio = request.ratio === 'adaptive' ? '16:9' : request.ratio
    }
    else {
      body.image = firstFrame
      body.image_tail = lastFrame || undefined
    }

    if (request.watermark)
      body.watermark = true

    const response = await $fetch<KlingTaskResponse>(`${this.config.baseUrl}/videos/${kind}`, {
      method: 'POST',
      headers: this.headers(),
      body,
    })

    if (response.code !== 0)
      throw new Error(response.message || '可灵提交失败')
    if (!response.data?.task_id)
      throw new Error('可灵未返回任务 ID')

    return { taskId: `${kind}:${response.data.task_id}`, status: 'PENDING' as GenerationStatus }
  }

  async getTask(encodedTaskId: string): Promise<ProviderTaskResult> {
    const [kind, taskId] = encodedTaskId.split(':')
    const endpoint = kind === 'image2video' ? 'image2video' : 'text2video'
    const response = await $fetch<KlingTaskResponse>(`${this.config.baseUrl}/videos/${endpoint}/${encodeURIComponent(taskId)}`, {
      headers: this.headers(),
    })

    if (response.code !== 0)
      throw new Error(response.message || '可灵查询失败')

    const status = normalizeStatus(response.data?.task_status)
    const video = response.data?.task_result?.videos?.[0]
    return {
      status,
      videoUrl: video?.url,
      usage: video?.duration ? { duration: Number(video.duration) } : undefined,
      error: status === 'FAILED' ? (response.message || '可灵生成失败') : undefined,
    }
  }
}
