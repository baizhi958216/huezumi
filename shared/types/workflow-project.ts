/** 作品库里的工作流视频视图；独立于有报价和账本的 GenerationRecord。 */
export interface WorkflowProjectRecord {
  id: string
  promptId: string
  hasOriginalWorkflow: boolean
  name: string
  prompt: string
  model: string
  resolution: string
  ratio: string
  duration: number
  mediaTypes: Array<'image' | 'video' | 'audio'>
  createdAt: string
  filename: string
  videoUrl: string
}
