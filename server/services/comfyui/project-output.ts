import type { ComfyApiWorkflow, ComfyHistoryEntry, ComfyOutputFile } from '#shared/types/comfyui'
import type { WorkflowProjectRecord } from '#shared/types/workflow-project'
import { workflowGraphFromHistory } from '../../../shared/utils/comfy-history-workflow'

interface OwnedExecution {
  promptId: string
  createdAt: Date
}

function safeVideoFile(value: unknown): value is ComfyOutputFile {
  if (!value || typeof value !== 'object')
    return false
  const file = value as Partial<ComfyOutputFile>
  return file.type === 'output'
    && (file.subfolder === '' || file.subfolder === undefined)
    && typeof file.filename === 'string'
    && /^[\p{L}\p{N} _.-]+\.(?:mp4|webm|mov)$/iu.test(file.filename)
    && !file.filename.startsWith('.')
    && !file.filename.includes('..')
}

function textInput(value: unknown, prompt: ComfyApiWorkflow): string {
  if (typeof value === 'string')
    return value
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== 'string')
    return ''
  const source = prompt[value[0]]
  const text = source?.inputs.text
  return typeof text === 'string' ? text : ''
}

function inputString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function workflowName(entry: ComfyHistoryEntry) {
  const name = workflowGraphFromHistory(entry)?.name
  if (typeof name === 'string' && name.trim())
    return name.trim().slice(0, 120)
  return '工作流视频'
}

export function workflowProjectsFromHistory(owned: OwnedExecution, entry?: ComfyHistoryEntry): WorkflowProjectRecord[] {
  if (!entry || entry.status?.status_str !== 'success' || !entry.status.completed)
    return []

  const prompt = entry.prompt?.[2] ?? {}
  const generator = Object.values(prompt).find(node => node.class_type === 'HuezumiBailianWan3Video')
  const inputs = generator?.inputs ?? {}
  const mediaTypes: WorkflowProjectRecord['mediaTypes'] = []
  for (const [type, kind] of [
    ['HuezumiBailianImage', 'image'],
    ['HuezumiBailianVideo', 'video'],
    ['HuezumiBailianAudio', 'audio'],
  ] as const) {
    if (Object.values(prompt).some(node => node.class_type === type && typeof node.inputs.file === 'string' && node.inputs.file.trim()))
      mediaTypes.push(kind)
  }

  const files = new Set<string>()
  for (const output of Object.values(entry.outputs ?? {})) {
    const videos = output.videos
    if (!Array.isArray(videos))
      continue
    for (const video of videos) {
      if (safeVideoFile(video))
        files.add(video.filename)
    }
  }

  return [...files].map(filename => ({
    id: `${owned.promptId}:${filename}`,
    promptId: owned.promptId,
    hasOriginalWorkflow: workflowGraphFromHistory(entry) !== null,
    name: workflowName(entry),
    prompt: textInput(inputs.positive_prompt, prompt),
    model: inputString(inputs.model, 'ComfyUI'),
    resolution: inputString(inputs.resolution, '—'),
    ratio: inputString(inputs.ratio, 'adaptive'),
    duration: typeof inputs.duration === 'number' ? inputs.duration : 0,
    mediaTypes,
    createdAt: owned.createdAt.toISOString(),
    filename,
    videoUrl: `/api/comfyui/view?${new URLSearchParams({ filename, type: 'output' })}`,
  }))
}
