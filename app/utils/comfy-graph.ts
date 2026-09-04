import type {
  ComfyHistoryEntry,
  ComfyNodeMode,
  ComfyNodeTypeInfo,
  ComfyObjectInfo,
  ComfyOutputFile,
  ComfySlotSpec,
  ComfyWidgetSpec,
  ComfyWorkflowJSON,
  ComfyWorkflowLink,
  ComfyWorkflowNode,
} from '#shared/types/comfyui'
import type { Edge, Node } from '@vue-flow/core'
import { buildNodeTypeInfo, getWidgetDefault } from '#shared/types/comfyui'

/** 单个节点卡片携带的数据；控件值按控件名索引，序列化时再按声明顺序展开。 */
export interface ComfyNodeData {
  type: string
  title: string
  mode: ComfyNodeMode
  widgets: Record<string, unknown>
  widgetSpecs: ComfyWidgetSpec[]
  inputSlots: ComfySlotSpec[]
  outputSlots: ComfySlotSpec[]
  /** 当前 ComfyUI 环境中不存在该节点类型 */
  missing: boolean
  collapsed?: boolean
  /** 以下两项是运行期的 UI 状态，不参与持久化和序列化 */
  executing?: boolean
  progress?: { value: number, max: number }
}

export type ComfyFlowNode = Node<ComfyNodeData>
export type ComfyFlowEdge = Edge

const DEFAULT_NODE_WIDTH = 260

export function buildTypeIndex(objectInfo: ComfyObjectInfo): Record<string, ComfyNodeTypeInfo> {
  const index: Record<string, ComfyNodeTypeInfo> = {}
  for (const [name, def] of Object.entries(objectInfo ?? {}))
    index[name] = buildNodeTypeInfo(name, def)
  return index
}

/** 按 category 分组，供节点库渲染分组列表。 */
export function groupTypesByCategory(
  types: ComfyNodeTypeInfo[],
): Array<{ category: string, items: ComfyNodeTypeInfo[] }> {
  const groups = new Map<string, ComfyNodeTypeInfo[]>()
  for (const info of types) {
    const [root] = info.category.split('/')
    const key = root || 'uncategorized'
    const bucket = groups.get(key)
    if (bucket)
      bucket.push(info)
    else
      groups.set(key, [info])
  }
  return [...groups.entries()]
    .map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category))
}

export function createNodeData(info: ComfyNodeTypeInfo, values?: Record<string, unknown>): ComfyNodeData {
  const widgets: Record<string, unknown> = {}
  for (const widget of info.widgets) {
    widgets[widget.name] = values?.[widget.name] ?? getWidgetDefault(widget)
  }
  return {
    type: info.name,
    title: info.displayName,
    mode: 0,
    widgets,
    widgetSpecs: info.widgets,
    inputSlots: info.inputs,
    outputSlots: info.outputs,
    missing: false,
  }
}

export function createMissingNodeData(type: string, title?: string): ComfyNodeData {
  return {
    type,
    title: title || type,
    mode: 0,
    widgets: {},
    widgetSpecs: [],
    inputSlots: [],
    outputSlots: [],
    missing: true,
  }
}

/** 按控件声明顺序展开 widgets_values，保证与 ComfyUI 官方前端的位置语义一致。 */
export function collectWidgetValues(data: ComfyNodeData): unknown[] {
  return data.widgetSpecs.map(widget => data.widgets[widget.name] ?? getWidgetDefault(widget))
}

export function nodeOutputCount(data: ComfyNodeData): number {
  return Math.max(data.outputSlots.length, 1)
}

/**
 * 把画布状态导出为 ComfyUI 工作流 JSON。
 * 这是保存、导出和生成 API prompt 的唯一来源，避免多份图状态不一致。
 */
export function exportWorkflow(
  nodes: ComfyFlowNode[],
  edges: ComfyFlowEdge[],
  meta: { name?: string, id?: string } = {},
): ComfyWorkflowJSON {
  const ordered = [...nodes].sort((a, b) => a.position.y - b.position.y)
  const links: ComfyWorkflowLink[] = []
  const linkByInput = new Map<string, number>()
  let linkId = 0

  for (const edge of edges) {
    const source = nodes.find(node => node.id === edge.source)
    const target = nodes.find(node => node.id === edge.target)
    if (!source || !target)
      continue

    const targetData = target.data as ComfyNodeData
    const slotIndex = targetData.inputSlots.findIndex(slot => slot.name === edge.targetHandle)
    if (slotIndex === -1)
      continue

    const sourceData = source.data as ComfyNodeData
    const parsedSlot = Number.parseInt(String(edge.sourceHandle ?? '0'), 10)
    const sourceSlot = Number.isNaN(parsedSlot) ? 0 : parsedSlot
    linkId += 1
    linkByInput.set(`${target.id}:${edge.targetHandle}`, linkId)
    links.push([
      linkId,
      Number(source.id),
      sourceSlot,
      Number(target.id),
      slotIndex,
      sourceData.outputSlots[sourceSlot]?.type ?? '',
    ])
  }

  const exported: ComfyWorkflowNode[] = ordered.map((node, index) => {
    const data = node.data as ComfyNodeData
    const inputs = data.inputSlots.map(slot => ({
      name: slot.name,
      type: slot.type,
      link: linkByInput.get(`${node.id}:${slot.name}`) ?? null,
    }))
    const outputs = data.outputSlots.map((slot, slotIndex) => ({
      name: slot.name,
      type: slot.type,
      links: links
        .filter(link => link[1] === Number(node.id) && link[2] === slotIndex)
        .map(link => link[0]),
      slot_index: slotIndex,
    }))

    return {
      id: Number(node.id),
      type: data.type,
      pos: [Math.round(node.position.x), Math.round(node.position.y)],
      size: [DEFAULT_NODE_WIDTH, Math.round(((node as { dimensions?: { height?: number } }).dimensions?.height ?? 120))],
      flags: {
        collapsed: Boolean(data.collapsed),
      },
      order: index,
      mode: data.mode,
      inputs,
      outputs,
      title: data.title,
      properties: { 'Node name for S&R': data.type },
      widgets_values: collectWidgetValues(data),
    }
  })

  // 连线目标插槽：links 里记录的 0 需要回填成真实的目标输入序号
  for (const link of links) {
    const targetNode = exported.find(node => node.id === link[3])
    const targetInput = targetNode?.inputs?.[link[4]]
    if (targetInput)
      link[5] = targetInput.type
  }

  const maxNodeId = exported.reduce((max, node) => Math.max(max, node.id), 0)

  return {
    id: meta.id,
    name: meta.name,
    last_node_id: maxNodeId,
    last_link_id: linkId,
    nodes: exported,
    links,
    groups: [],
    config: {},
    extra: { ds: { scale: 1, offset: [0, 0] } },
    version: 1,
  }
}

/** 从 ComfyUI 工作流 JSON 还原画布。缺失的节点类型渲染为占位卡片。 */
export function importWorkflow(
  graph: ComfyWorkflowJSON,
  typeIndex: Record<string, ComfyNodeTypeInfo>,
): { nodes: ComfyFlowNode[], edges: ComfyFlowEdge[], missing: string[] } {
  const nodes: ComfyFlowNode[] = []
  const edges: ComfyFlowEdge[] = []
  const nodeIdMap = new Map<number, ComfyFlowNode>()
  const linkById = new Map<number, ComfyWorkflowLink>()
  const missing: string[] = []

  for (const link of graph.links ?? [])
    linkById.set(link[0], link)

  for (const node of graph.nodes ?? []) {
    const info = typeIndex[node.type]
    let data: ComfyNodeData
    if (info) {
      const values: Record<string, unknown> = {}
      const raw = node.widgets_values ?? []
      info.widgets.forEach((widget, index) => {
        if (index < raw.length)
          values[widget.name] = raw[index]
      })
      data = createNodeData(info, values)
      data.title = node.title || info.displayName
      data.mode = node.mode ?? 0
      data.collapsed = Boolean(node.flags?.collapsed)
    }
    else {
      data = createMissingNodeData(node.type, node.title)
      data.collapsed = Boolean(node.flags?.collapsed)
      if (!missing.includes(node.type))
        missing.push(node.type)
    }

    const [x = 0, y = 0] = node.pos ?? [0, 0]
    const flowNode: ComfyFlowNode = {
      id: String(node.id),
      type: 'comfy',
      position: { x, y },
      data,
    }
    nodes.push(flowNode)
    nodeIdMap.set(node.id, flowNode)
  }

  for (const node of graph.nodes ?? []) {
    const inputs = node.inputs ?? []
    inputs.forEach((slot) => {
      if (slot.link == null)
        return
      const link = linkById.get(slot.link)
      if (!link)
        return
      const source = nodeIdMap.get(link[1])
      const target = nodeIdMap.get(link[3])
      if (!source || !target)
        return
      const targetData = target.data as ComfyNodeData
      const sourceData = source.data as ComfyNodeData
      const outputType = sourceData.outputSlots[link[2]]?.type ?? ''
      if (!targetData.inputSlots.some(item => item.name === slot.name))
        return
      edges.push({
        id: `e${link[0]}`,
        source: String(source.id),
        target: String(target.id),
        sourceHandle: String(link[2]),
        targetHandle: slot.name,
        data: { type: outputType },
      })
    })
  }

  return { nodes, edges, missing }
}

/**
 * 内置示例：经典文生图工作流。
 * 只是把节点摆好并连线，参数仍由各节点的默认值决定，用于快速验证整条链路。
 */
export function createSampleGraph(typeIndex: Record<string, ComfyNodeTypeInfo>): {
  nodes: ComfyFlowNode[]
  edges: ComfyFlowEdge[]
} | null {
  const required = ['CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage']
  if (!required.every(type => typeIndex[type]))
    return null

  const make = (id: number, type: string, x: number, y: number, values?: Record<string, unknown>) => {
    const info = typeIndex[type]
    if (!info)
      throw new Error(`缺少节点类型 ${type}`)
    return {
      id: String(id),
      type: 'comfy',
      position: { x, y },
      data: createNodeData(info, values),
    }
  }

  const nodes: ComfyFlowNode[] = [
    make(4, 'CheckpointLoaderSimple', 40, 60),
    make(6, 'CLIPTextEncode', 40, 300, { text: 'masterpiece, cinematic lighting, ultra detailed' }),
    make(7, 'CLIPTextEncode', 40, 520, { text: 'bad hands, blurry, watermark' }),
    make(5, 'EmptyLatentImage', 420, 620, { width: 512, height: 512, batch_size: 1 }),
    make(3, 'KSampler', 420, 220, { steps: 20, cfg: 8, sampler_name: 'euler', scheduler: 'normal', denoise: 1 }),
    make(8, 'VAEDecode', 800, 300),
    make(9, 'SaveImage', 1080, 340),
  ]

  const edges: ComfyFlowEdge[] = [
    { id: 'e1', source: '4', target: '3', sourceHandle: '0', targetHandle: 'model', data: { type: 'MODEL' } },
    { id: 'e2', source: '4', target: '6', sourceHandle: '1', targetHandle: 'clip', data: { type: 'CLIP' } },
    { id: 'e3', source: '4', target: '7', sourceHandle: '1', targetHandle: 'clip', data: { type: 'CLIP' } },
    { id: 'e4', source: '6', target: '3', sourceHandle: '0', targetHandle: 'positive', data: { type: 'CONDITIONING' } },
    { id: 'e5', source: '7', target: '3', sourceHandle: '0', targetHandle: 'negative', data: { type: 'CONDITIONING' } },
    { id: 'e6', source: '5', target: '3', sourceHandle: '0', targetHandle: 'latent_image', data: { type: 'LATENT' } },
    { id: 'e7', source: '3', target: '8', sourceHandle: '0', targetHandle: 'samples', data: { type: 'LATENT' } },
    { id: 'e8', source: '4', target: '8', sourceHandle: '2', targetHandle: 'vae', data: { type: 'VAE' } },
    { id: 'e9', source: '8', target: '9', sourceHandle: '0', targetHandle: 'images', data: { type: 'IMAGE' } },
  ]

  return { nodes, edges }
}

export function collectOutputFiles(entry?: ComfyHistoryEntry): ComfyOutputFile[] {
  const files: ComfyOutputFile[] = []
  for (const group of Object.values(entry?.outputs ?? {})) {
    for (const value of Object.values(group ?? {})) {
      if (!Array.isArray(value))
        continue
      for (const item of value) {
        if (item && typeof item === 'object' && 'filename' in item) {
          files.push({
            filename: String(item.filename),
            subfolder: String(item.subfolder ?? ''),
            type: String(item.type ?? 'output'),
            format: item.format ? String(item.format) : undefined,
          })
        }
      }
    }
  }
  return files
}

export function buildViewUrl(file: ComfyOutputFile): string {
  const params = new URLSearchParams({ filename: file.filename, type: file.type || 'output' })
  if (file.subfolder)
    params.set('subfolder', file.subfolder)
  return `/api/comfyui/view?${params.toString()}`
}

export function isVideoFile(file: ComfyOutputFile): boolean {
  return /\.(?:mp4|webm|mov|mkv|gif)$/i.test(file.filename)
}
