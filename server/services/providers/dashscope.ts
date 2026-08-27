import type { GenerationRequest, GenerationStatus, ProviderTaskResult } from '#shared/types/generation'
import type { VideoProvider } from './base'

interface DashScopeConfig {
  apiKey: string
  baseUrl: string
  model: string
}

interface DashScopeResponse {
  code?: string
  message?: string
  output?: {
    task_id?: string
    task_status?: string
    video_url?: string
  }
}

function normalizeStatus(status?: string): GenerationStatus {
  if (status && ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(status))
    return status as GenerationStatus
  return 'UNKNOWN'
}

export class DashScopeProvider implements VideoProvider {
  readonly id = 'dashscope'

  constructor(private readonly config: DashScopeConfig) {}

  async submit(request: GenerationRequest) {
    const body = {
      model: request.model || this.config.model,
      input: {
        prompt: request.prompt || undefined,
        negative_prompt: request.negativePrompt || undefined,
        media: request.media.length ? request.media.map(({ type, url }) => ({ type, url })) : undefined,
      },
      parameters: {
        resolution: request.resolution,
        ratio: request.ratio,
        duration: request.duration,
        audio: request.audio,
        prompt_extend: request.promptExtend,
        watermark: request.watermark,
        seed: request.seed,
      },
    }

    const response = await $fetch<DashScopeResponse>(`${this.config.baseUrl}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body,
    })

    const taskId = response.output?.task_id
    if (!taskId)
      throw new Error(response.message || response.code || 'DashScope 未返回任务 ID')

    return { taskId, status: normalizeStatus(response.output?.task_status || 'PENDING') }
  }

  async getTask(taskId: string): Promise<ProviderTaskResult> {
    const response = await $fetch<DashScopeResponse>(`${this.config.baseUrl}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    })

    return {
      status: normalizeStatus(response.output?.task_status),
      videoUrl: response.output?.video_url,
      error: response.output?.task_status === 'FAILED' ? (response.message || response.code || '生成失败') : undefined,
    }
  }
}
