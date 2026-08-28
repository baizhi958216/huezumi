import type { GenerationRequest, GenerationStatus, ProviderTaskResult } from '#shared/types/generation'
import type { VideoProvider } from './base'

interface MiniMaxConfig {
  apiKey: string
  baseUrl: string
  groupId?: string
}

interface MiniMaxBaseResp {
  status_code: number
  status_msg?: string
}

interface MiniMaxSubmitResponse {
  task_id?: string
  base_resp?: MiniMaxBaseResp
}

interface MiniMaxQueryResponse {
  task_id?: string
  status?: string
  file_id?: string
  base_resp?: MiniMaxBaseResp
}

interface MiniMaxFileResponse {
  file?: {
    download_url?: string
  }
  base_resp?: MiniMaxBaseResp
}

function normalizeStatus(status?: string): GenerationStatus {
  switch (status) {
    case 'Queueing':
    case 'queued':
      return 'PENDING'
    case 'Processing':
    case 'in_progress':
      return 'RUNNING'
    case 'Success':
    case 'completed':
      return 'SUCCEEDED'
    case 'Failed':
    case 'failed':
      return 'FAILED'
    default:
      return 'UNKNOWN'
  }
}

/**
 * MiniMax 视频生成（海螺 Hailuo 系列）。
 * 提交：POST /v1/video_generation；查询：GET /v1/query/video_generation；取文件：GET /v1/files/retrieve。
 * 画幅不提供参数：文生默认 16:9，图生跟随首帧图片。reference_image 语义上映射为首帧（图生视频）。
 */
export class MiniMaxProvider implements VideoProvider {
  readonly id = 'minimax'

  constructor(private readonly config: MiniMaxConfig) {}

  private buildBody(request: GenerationRequest) {
    const frames = new Map(request.media.map(item => [item.type, item.url]))
    const firstFrame = frames.get('first_frame') || frames.get('reference_image')
    const lastFrame = frames.get('last_frame')

    return {
      model: request.model || 'MiniMax-Hailuo-2.3',
      prompt: request.prompt || undefined,
      duration: request.duration,
      resolution: request.resolution,
      prompt_optimizer: request.promptExtend,
      aigc_watermark: request.watermark,
      first_frame_image: firstFrame || undefined,
      last_frame_image: lastFrame || undefined,
    }
  }

  async submit(request: GenerationRequest) {
    const query = this.config.groupId ? `?GroupId=${encodeURIComponent(this.config.groupId)}` : ''
    const response = await $fetch<MiniMaxSubmitResponse>(`${this.config.baseUrl}/video_generation${query}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: this.buildBody(request),
    })

    if (response.base_resp?.status_code !== 0)
      throw new Error(response.base_resp?.status_msg || 'MiniMax 提交失败')
    if (!response.task_id)
      throw new Error('MiniMax 未返回任务 ID')

    return { taskId: response.task_id, status: 'PENDING' as GenerationStatus }
  }

  async getTask(taskId: string): Promise<ProviderTaskResult> {
    const query = this.config.groupId ? `&GroupId=${encodeURIComponent(this.config.groupId)}` : ''
    const queryResponse = await $fetch<MiniMaxQueryResponse>(`${this.config.baseUrl}/query/video_generation?task_id=${encodeURIComponent(taskId)}${query}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    })

    if (queryResponse.base_resp?.status_code !== 0)
      throw new Error(queryResponse.base_resp?.status_msg || 'MiniMax 查询失败')

    const status = normalizeStatus(queryResponse.status)
    if (status !== 'SUCCEEDED' || !queryResponse.file_id)
      return { status, error: status === 'FAILED' ? 'MiniMax 生成失败' : undefined }

    const fileResponse = await $fetch<MiniMaxFileResponse>(`${this.config.baseUrl}/files/retrieve?file_id=${encodeURIComponent(queryResponse.file_id)}&purpose=video_output${query}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    })

    return { status, videoUrl: fileResponse.file?.download_url }
  }
}
