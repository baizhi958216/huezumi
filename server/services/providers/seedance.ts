import type { GenerationRequest, GenerationStatus, ProviderTaskResult } from '#shared/types/generation'
import type { VideoProvider } from './base'

interface SeedanceConfig {
  apiKey: string
  baseUrl: string
  model: string
}

interface SeedanceSubmitResponse {
  id?: string
  error?: { message?: string }
}

interface SeedanceTaskResponse {
  id?: string
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'expired'
  error?: { message?: string }
  content?: {
    video_url?: string
    last_frame_url?: string
  }
  usage?: {
    completion_tokens?: number
  }
}

function normalizeStatus(status?: string): GenerationStatus {
  switch (status) {
    case 'queued':
      return 'PENDING'
    case 'running':
      return 'RUNNING'
    case 'succeeded':
      return 'SUCCEEDED'
    case 'failed':
    case 'expired':
      return 'FAILED'
    default:
      return 'UNKNOWN'
  }
}

/**
 * 字节跳动 Seedance（火山方舟 Ark 协议）。
 * 提交：POST /contents/generations/tasks；查询：GET /contents/generations/tasks/{id}。
 * 文本与图片放在 content 数组中，图片通过 role 区分 first_frame / last_frame / reference_image；
 * 分辨率、比例、时长、音频、种子等参数平铺在 body 顶层（非 content 内）。
 */
export class SeedanceProvider implements VideoProvider {
  readonly id = 'seedance'

  constructor(private readonly config: SeedanceConfig) {}

  async submit(request: GenerationRequest) {
    const content: Array<Record<string, unknown>> = []
    if (request.prompt.trim())
      content.push({ type: 'text', text: request.prompt.trim() })

    for (const item of request.media) {
      if (item.type === 'file' || item.type === 'link' || item.type === 'reference_video' || item.type === 'reference_audio')
        continue
      content.push({ type: 'image_url', image_url: { url: item.url }, role: item.type })
    }

    const body: Record<string, unknown> = {
      model: request.model || this.config.model,
      content,
      resolution: request.resolution.toLowerCase(),
      ratio: request.ratio,
      duration: request.duration,
      watermark: request.watermark,
    }

    if (request.seed !== undefined)
      body.seed = request.seed
    if (request.audio !== undefined)
      body.generate_audio = request.audio

    const response = await $fetch<SeedanceSubmitResponse>(`${this.config.baseUrl}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    })

    if (!response.id)
      throw new Error(response.error?.message || 'Seedance 未返回任务 ID')

    return { taskId: response.id, status: 'PENDING' as GenerationStatus }
  }

  async getTask(taskId: string): Promise<ProviderTaskResult> {
    const response = await $fetch<SeedanceTaskResponse>(`${this.config.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    })

    return {
      status: normalizeStatus(response.status),
      videoUrl: response.content?.video_url,
      error: response.status === 'failed' || response.status === 'expired'
        ? (response.error?.message || 'Seedance 生成失败')
        : undefined,
    }
  }
}
