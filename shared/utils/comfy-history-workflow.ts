import type { ComfyHistoryEntry, ComfyWorkflowJSON } from '../types/comfyui'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'number' && Number.isFinite(item))
}

function isWorkflowNode(value: unknown): boolean {
  if (!isRecord(value)
    || !Number.isInteger(value.id)
    || typeof value.type !== 'string'
    || value.type.length === 0
    || !isPosition(value.pos)
    || !isPosition(value.size)
    || !Number.isInteger(value.order)
    || (value.mode !== 0 && value.mode !== 2 && value.mode !== 4)
    || (value.widgets_values !== undefined && !Array.isArray(value.widgets_values))) {
    return false
  }
  return value.inputs === undefined || (Array.isArray(value.inputs) && value.inputs.every(slot => isRecord(slot)
    && typeof slot.name === 'string'
    && typeof slot.type === 'string'
    && (slot.link === undefined || slot.link === null || Number.isInteger(slot.link))))
}

function isWorkflowGraph(value: unknown): value is ComfyWorkflowJSON {
  if (!isRecord(value) || !Number.isInteger(value.last_node_id) || !Number.isInteger(value.last_link_id))
    return false
  if (!Array.isArray(value.nodes) || value.nodes.length === 0 || !Array.isArray(value.links))
    return false
  if (!value.nodes.every(isWorkflowNode)) {
    return false
  }
  return value.links.every(link => Array.isArray(link)
    && link.length === 6
    && link.slice(0, 5).every(item => Number.isInteger(item))
    && typeof link[5] === 'string')
}

/** 执行时的画布快照，不用同名保存工作流代替。 */
export function workflowGraphFromHistory(entry?: ComfyHistoryEntry): ComfyWorkflowJSON | null {
  const extra = entry?.prompt?.[3]?.extra_pnginfo
  if (!isRecord(extra) || !isWorkflowGraph(extra.workflow))
    return null
  return extra.workflow
}
