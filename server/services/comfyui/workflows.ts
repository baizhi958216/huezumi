import type { ComfyWorkflowJSON, ComfyWorkflowRecord, ComfyWorkflowSummary } from '#shared/types/comfyui'

const INDEX_KEY = 'comfyui:workflows:index'
const RECORD_PREFIX = 'comfyui:workflows:'
const ID_PATTERN = /^[\w-]{1,64}$/

/** 存储 key 直接拼接 id，必须限制字符集，防止写入到预期之外的 key。 */
export function isValidWorkflowId(id: string): boolean {
  return ID_PATTERN.test(id)
}

function toSummary(record: ComfyWorkflowRecord): ComfyWorkflowSummary {
  return {
    id: record.id,
    name: record.name,
    nodeCount: record.graph?.nodes?.length ?? 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export async function listWorkflows(): Promise<ComfyWorkflowSummary[]> {
  const index = await useStorage('data').getItem<ComfyWorkflowSummary[]>(INDEX_KEY)
  if (!index?.length)
    return []
  return index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getWorkflow(id: string): Promise<ComfyWorkflowRecord | undefined> {
  if (!isValidWorkflowId(id))
    return undefined
  return await useStorage('data').getItem<ComfyWorkflowRecord>(`${RECORD_PREFIX}${id}`) ?? undefined
}

export interface SaveWorkflowInput {
  id?: string
  name: string
  graph: ComfyWorkflowJSON
}

export async function saveWorkflow(input: SaveWorkflowInput): Promise<ComfyWorkflowRecord> {
  const storage = useStorage('data')
  const existing = input.id ? await getWorkflow(input.id) : undefined
  const now = new Date().toISOString()
  const record: ComfyWorkflowRecord = {
    id: existing?.id ?? (input.id && isValidWorkflowId(input.id) ? input.id : crypto.randomUUID()),
    name: input.name.trim() || '未命名工作流',
    nodeCount: input.graph?.nodes?.length ?? 0,
    graph: input.graph,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await storage.setItem(`${RECORD_PREFIX}${record.id}`, record)

  const index = (await storage.getItem<ComfyWorkflowSummary[]>(INDEX_KEY)) ?? []
  const rest = index.filter(item => item.id !== record.id)
  await storage.setItem(INDEX_KEY, [toSummary(record), ...rest])

  return record
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  if (!isValidWorkflowId(id))
    return false
  const storage = useStorage('data')
  const existed = await storage.hasItem(`${RECORD_PREFIX}${id}`)
  if (!existed)
    return false

  await storage.removeItem(`${RECORD_PREFIX}${id}`)
  const index = (await storage.getItem<ComfyWorkflowSummary[]>(INDEX_KEY)) ?? []
  await storage.setItem(INDEX_KEY, index.filter(item => item.id !== id))
  return true
}
