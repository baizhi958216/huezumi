/**
 * ComfyUI 工作流模块的领域契约。
 *
 * 设计原则：
 * 1. 平台侧不认识任何具体节点，节点的一切形状来自 ComfyUI 的 `/object_info`。
 * 2. 浏览器只与本模块的 `/api/comfyui/**` 通信，ComfyUI 仅作为接口服务存在。
 * 3. 图的数据结构与序列化规则对齐 ComfyUI 官方前端（`ComfyUI_frontend` 的 `graphToPrompt`），
 *    保证工作流 JSON 能与官方前端互通。
 */

/** 接入模式：本地托管进程，或连接其他机器上已运行的 ComfyUI。 */
export type ComfyUIMode = 'local' | 'remote'

/** 运行时状态机。starting 只在本地模式下出现。 */
export type ComfyRuntimeState = 'not_installed' | 'stopped' | 'starting' | 'running' | 'error'

export type ComfyInstallPhase = 'idle' | 'running' | 'succeeded' | 'failed'

export interface ComfyInstallState {
  phase: ComfyInstallPhase
  /** 当前步骤的可读描述，例如「克隆仓库」「安装依赖」 */
  step?: string
  message?: string
  log: string[]
  startedAt?: string
  finishedAt?: string
}

export interface ComfySystemStats {
  system?: {
    os?: string
    python_version?: string
    embedded_python?: boolean
    comfyui_version?: string
    pytorch_version?: string
  }
  devices?: Array<{
    name?: string
    type?: string
    index?: number
    vram_total?: number
    vram_free?: number
    torch_vram_total?: number
    torch_vram_free?: number
  }>
}

export interface ComfyUIStatus {
  mode: ComfyUIMode
  /** 本地模式下仓库目录是否存在（remote 模式恒为 true） */
  installed: boolean
  state: ComfyRuntimeState
  /** 服务端访问 ComfyUI 的基地址；remote 模式下即配置的地址 */
  baseUrl: string
  dir?: string
  pid?: number
  systemStats?: ComfySystemStats
  install: ComfyInstallState
  /** 进程日志尾部（本地模式） */
  log: string[]
  error?: string
}

/* ------------------------------------------------------------------ */
/* 节点定义（/object_info）                                             */
/* ------------------------------------------------------------------ */

export interface ComfyInputOptions {
  default?: unknown
  min?: number
  max?: number
  step?: number
  multiline?: boolean
  dynamic_prompts?: boolean
  /** ComfyUI v3 uses camelCase for these two flags. */
  dynamicPrompts?: boolean
  forceInput?: boolean
  force_input?: boolean
  socketless?: boolean
  round?: number | boolean
  display?: string
  /** ComfyUI 官方加载节点的文件上传标记。 */
  image_upload?: boolean
  audio_upload?: boolean
  video_upload?: boolean
  /** 新版 ComfyUI 对 COMBO 使用 options 数组承载候选值；动态 COMBO 的条目是带 key 的对象。 */
  options?: unknown[]
  multiselect?: boolean
  /** 任意额外键：ComfyUI 允许节点作者自定义提示信息 */
  [key: string]: unknown
}

/** Combo 输入的类型部分是字符串数组，其余是类型名。 */
export type ComfyInputSpec = [string[] | string, ComfyInputOptions?]

export interface ComfyNodeDef {
  input: {
    required: Record<string, ComfyInputSpec>
    optional?: Record<string, ComfyInputSpec>
  }
  output: string[]
  output_name?: string[]
  output_is_list?: boolean[]
  name: string
  display_name?: string
  description?: string
  category?: string
  output_node?: boolean
  deprecated?: boolean
  experimental?: boolean
}

export type ComfyObjectInfo = Record<string, ComfyNodeDef>

/* ------------------------------------------------------------------ */
/* 由节点定义推导出的渲染模型                                            */
/* ------------------------------------------------------------------ */

export type ComfyWidgetKind = 'INT' | 'FLOAT' | 'STRING' | 'BOOLEAN' | 'COMBO' | 'CONTROL_AFTER_GENERATE'

export type ComfyUploadType = 'image' | 'audio' | 'video'

export interface ComfyWidgetSpec {
  name: string
  kind: ComfyWidgetKind
  options: ComfyInputOptions
  /** COMBO 的可选项 */
  choices?: string[]
  /** 该 COMBO 是否由 ComfyUI 的文件上传控件驱动。 */
  uploadType?: ComfyUploadType
  /**
   * 是否参与 API prompt 序列化。
   * 官方前端用 `widget.options.serialize === false` 排除 control_after_generate 等纯前端控件。
   */
  serialize: boolean
  group: 'required' | 'optional'
}

export interface ComfySlotSpec {
  name: string
  type: string
  /** 输入分组；输出插槽该字段无意义，恒为 undefined */
  group?: 'required' | 'optional'
}

export interface ComfyNodeTypeInfo {
  name: string
  displayName: string
  description: string
  category: string
  outputNode: boolean
  /** 控件顺序即 widgets_values 的位置顺序 */
  widgets: ComfyWidgetSpec[]
  inputs: ComfySlotSpec[]
  outputs: ComfySlotSpec[]
}

export const CONTROL_AFTER_GENERATE_NODES = ['KSampler', 'KSamplerAdvanced', 'PrimitiveNode'] as const
export const CONTROL_AFTER_GENERATE_OPTIONS = ['randomize', 'fixed', 'increment', 'decrement'] as const

const WIDGET_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN'])
const COMBO_TYPES = new Set(['COMBO', 'COMFY_DYNAMICCOMBO_V3'])

function getComboChoices(options: ComfyInputOptions): string[] {
  if (!Array.isArray(options.options))
    return []
  return options.options.flatMap((option) => {
    if (typeof option === 'string' || typeof option === 'number')
      return [String(option)]
    if (option && typeof option === 'object' && 'key' in option) {
      const key = (option as { key?: unknown }).key
      return typeof key === 'string' || typeof key === 'number' ? [String(key)] : []
    }
    return []
  })
}

function getUploadType(options: ComfyInputOptions): ComfyUploadType | undefined {
  if (options.image_upload)
    return 'image'
  if (options.audio_upload)
    return 'audio'
  if (options.video_upload)
    return 'video'
  return undefined
}

/**
 * STRING inputs in ComfyUI can be both a visible widget and a socket. The
 * built-in CLIPTextEncode uses multiline/dynamicPrompts without forceInput,
 * so the editor must retain the widget while exposing its text socket.
 */
function isConnectableString(options: ComfyInputOptions): boolean {
  if (options.socketless)
    return false
  return Boolean(
    options.forceInput
    || options.force_input
    || options.multiline
    || options.dynamicPrompts
    || options.dynamic_prompts,
  )
}

/**
 * 把 `/object_info` 的一条节点定义拆成「控件」与「连线插槽」。
 *
 * 规则与 ComfyUI 官方前端一致：类型名是数组或 COMBO → 下拉控件；类型是 INT/FLOAT/STRING/BOOLEAN → 控件；
 * 其余（MODEL / CLIP / VAE / IMAGE / LATENT / CONDITIONING …）→ 连线输入插槽。
 * 必填项先于可选项，各自保持声明顺序。
 */
export function buildNodeTypeInfo(name: string, def: ComfyNodeDef): ComfyNodeTypeInfo {
  const widgets: ComfyWidgetSpec[] = []
  const inputs: ComfySlotSpec[] = []
  const groups: Array<['required' | 'optional', Record<string, ComfyInputSpec>]> = [
    ['required', def.input?.required ?? {}],
    ['optional', def.input?.optional ?? {}],
  ]

  for (const [group, spec] of groups) {
    for (const [inputName, entry] of Object.entries(spec ?? {})) {
      const [type, options = {}] = entry ?? []
      if (Array.isArray(type)) {
        widgets.push({
          name: inputName,
          kind: 'COMBO',
          options,
          choices: type,
          uploadType: getUploadType(options),
          serialize: true,
          group,
        })
        continue
      }
      // 新版 ComfyUI 的媒体节点使用字符串 COMBO；动态 COMBO v3 的候选项是带 key 的对象。
      if (COMBO_TYPES.has(type)) {
        widgets.push({
          name: inputName,
          kind: 'COMBO',
          options,
          choices: getComboChoices(options),
          uploadType: getUploadType(options),
          serialize: true,
          group,
        })
        continue
      }
      if (WIDGET_TYPES.has(type)) {
        if (options.forceInput || options.force_input) {
          inputs.push({ name: inputName, type, group })
          continue
        }
        widgets.push({ name: inputName, kind: type as ComfyWidgetKind, options, serialize: true, group })
        if (type === 'STRING' && isConnectableString(options))
          inputs.push({ name: inputName, type, group })
        if ((inputName === 'seed' || inputName === 'noise_seed')
          && (options.control_after_generate || (CONTROL_AFTER_GENERATE_NODES as readonly string[]).includes(name))) {
          widgets.push({
            name: 'control_after_generate',
            kind: 'CONTROL_AFTER_GENERATE',
            options: {},
            serialize: false,
            group,
          })
        }
        continue
      }
      inputs.push({ name: inputName, type, group })
    }
  }

  const outputs = (def.output ?? []).map((type, index) => ({
    name: def.output_name?.[index] ?? type,
    type,
  }))

  return {
    name,
    displayName: def.display_name || name,
    description: def.description || '',
    category: def.category || 'uncategorized',
    outputNode: Boolean(def.output_node),
    widgets,
    inputs,
    outputs,
  }
}

/** 控件缺省值：优先节点声明的 default，其次按类型兜底。 */
export function getWidgetDefault(widget: ComfyWidgetSpec): unknown {
  if (widget.options.default !== undefined)
    return widget.options.default
  switch (widget.kind) {
    case 'INT':
    case 'FLOAT':
      return widget.options.min ?? 0
    case 'STRING':
      return ''
    case 'BOOLEAN':
      return false
    case 'COMBO':
      return widget.choices?.[0] ?? ''
    case 'CONTROL_AFTER_GENERATE':
      return 'randomize'
    default:
      return undefined
  }
}

/** ComfyUI 的连线类型校验：类型相同，或任一端为通配 `*`。 */
export function canConnectTypes(inputType: string, outputType: string): boolean {
  if (!inputType || !outputType)
    return false
  return inputType === outputType || inputType === '*' || outputType === '*'
}

/* ------------------------------------------------------------------ */
/* 工作流图                                                             */
/* ------------------------------------------------------------------ */

/** litegraph 的事件模式：0 正常，2 静音（mute），4 绕过（bypass）。 */
export const COMFY_NODE_MODE = {
  ALWAYS: 0,
  NEVER: 2,
  BYPASS: 4,
} as const

export type ComfyNodeMode = 0 | 2 | 4

export interface ComfyNodeSlot {
  name: string
  type: string
  link?: number | null
  slot_index?: number
  links?: number[] | null
}

export interface ComfyWorkflowNode {
  id: number
  type: string
  pos: [number, number]
  size: [number, number]
  flags?: Record<string, unknown>
  order: number
  mode: ComfyNodeMode
  inputs?: ComfyNodeSlot[]
  outputs?: ComfyNodeSlot[]
  title?: string
  properties?: Record<string, unknown>
  widgets_values?: unknown[]
}

/** [linkId, 源节点 id, 源插槽, 目标节点 id, 目标插槽, 类型] */
export type ComfyWorkflowLink = [number, number, number, number, number, string]

export interface ComfyWorkflowJSON {
  id?: string
  name?: string
  last_node_id: number
  last_link_id: number
  nodes: ComfyWorkflowNode[]
  links: ComfyWorkflowLink[]
  groups?: unknown[]
  config?: Record<string, unknown>
  extra?: Record<string, unknown> & { ds?: { scale?: number, offset?: [number, number] } }
  version?: number
}

export function createEmptyWorkflow(name = '未命名工作流'): ComfyWorkflowJSON {
  return {
    name,
    last_node_id: 0,
    last_link_id: 0,
    nodes: [],
    links: [],
    groups: [],
    config: {},
    extra: { ds: { scale: 1, offset: [0, 0] } },
    version: 1,
  }
}

/* ------------------------------------------------------------------ */
/* ComfyUI /prompt 的 API 结构                                          */
/* ------------------------------------------------------------------ */

/** 连线在 API 中表示为 [源节点 id, 源插槽序号]，字面数组额外包一层 { __value__ }。 */
export type ComfyApiInputValue = unknown

export interface ComfyApiNode {
  class_type: string
  inputs: Record<string, ComfyApiInputValue>
  _meta?: { title?: string }
}

export type ComfyApiWorkflow = Record<string, ComfyApiNode>

/* ------------------------------------------------------------------ */
/* 图 → API prompt                                                     */
/* ------------------------------------------------------------------ */

export interface ComfySerializeResult {
  prompt: ComfyApiWorkflow
  /** 需要在提交前向 UI 展示并处理的问题 */
  issues: string[]
  /** 引用了当前环境不存在节点类型的节点 id */
  missingNodes: number[]
}

/**
 * 把工作流图序列化为 ComfyUI `/prompt` 需要的 API 结构。
 *
 * 对齐官方 `graphToPrompt`：跳过静音与绕过节点；控件按声明顺序写入字面值，
 * `control_after_generate` 不写入；连线写成 `[源节点 id, 源插槽]`；最后清理指向不存在节点的连线。
 */
export function serializeGraphToApiPrompt(
  graph: ComfyWorkflowJSON,
  objectInfo: ComfyObjectInfo,
): ComfySerializeResult {
  const prompt: ComfyApiWorkflow = {}
  const issues: string[] = []
  const missingNodes: number[] = []
  const infoCache = new Map<string, ComfyNodeTypeInfo>()
  const linkById = new Map<number, ComfyWorkflowLink>()

  for (const link of graph.links ?? [])
    linkById.set(link[0], link)

  const nodes = graph.nodes ?? []
  const activeNodes = nodes.filter(
    node => node.mode !== COMFY_NODE_MODE.NEVER && node.mode !== COMFY_NODE_MODE.BYPASS,
  )

  for (const node of activeNodes) {
    const def = objectInfo[node.type]
    if (!def) {
      missingNodes.push(node.id)
      issues.push(`节点「${node.title || node.type}」（${node.type}）在当前 ComfyUI 环境中不存在`)
      continue
    }

    let info = infoCache.get(node.type)
    if (!info) {
      info = buildNodeTypeInfo(node.type, def)
      infoCache.set(node.type, info)
    }

    const inputs: Record<string, unknown> = {}
    const values = node.widgets_values ?? []
    info.widgets.forEach((widget, index) => {
      if (!widget.serialize)
        return
      const value = index < values.length ? values[index] : getWidgetDefault(widget)
      if (widget.kind === 'COMBO') {
        const choices = widget.choices ?? []
        if (!choices.length) {
          issues.push(`节点「${node.title || info.displayName}」的输入「${widget.name}」没有可用选项，请先在 ComfyUI 配置对应资源`)
        }
        else if (!choices.includes(String(value))) {
          issues.push(`节点「${node.title || info.displayName}」的输入「${widget.name}」当前值无效，请重新选择`)
        }
      }
      // 数组在 API 里表示连线，字面数组必须包一层，后端执行时会自动解包。
      inputs[widget.name] = Array.isArray(value) ? { __value__: value } : value
    })

    for (const slot of node.inputs ?? []) {
      if (slot.link == null)
        continue
      const link = linkById.get(slot.link)
      if (!link)
        continue
      inputs[slot.name] = [String(link[1]), link[2]]
    }

    prompt[String(node.id)] = {
      class_type: node.type,
      inputs,
      _meta: { title: node.title || info.displayName },
    }
  }

  for (const entry of Object.values(prompt)) {
    for (const [key, value] of Object.entries(entry.inputs)) {
      if (Array.isArray(value) && value.length === 2 && !prompt[String(value[0])])
        delete entry.inputs[key]
    }
  }

  return { prompt, issues, missingNodes }
}

/* ------------------------------------------------------------------ */
/* 历史 / 队列 / 输出                                                   */
/* ------------------------------------------------------------------ */

export interface ComfyOutputFile {
  filename: string
  subfolder: string
  type: string
  format?: string
}

export interface ComfyHistoryStatus {
  status_str: 'success' | 'error'
  completed: boolean
  messages?: Array<[string, Record<string, unknown>]>
}

export interface ComfyHistoryEntry {
  prompt?: [number, string, ComfyApiWorkflow, Record<string, unknown>, string[]]
  outputs?: Record<string, Record<string, unknown>>
  status?: ComfyHistoryStatus
  meta?: Record<string, unknown>
}

export type ComfyHistory = Record<string, ComfyHistoryEntry>

export interface ComfyQueueState {
  queueRunning: unknown[]
  queuePending: unknown[]
}

export interface ComfyPromptResponse {
  promptId: string
  number: number
  nodeErrors: Record<string, unknown>
}

/* ------------------------------------------------------------------ */
/* WebSocket 事件                                                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* WebSocket 事件                                                       */
/* ------------------------------------------------------------------ */

export type ComfyWsMessage
  = | { type: 'status', data: { status?: { exec_info?: { queue_remaining?: number } }, sid?: string } }
    | { type: 'execution_start', data: { prompt_id: string, timestamp?: number } }
    | { type: 'execution_cached', data: { nodes?: string[], prompt_id: string, timestamp?: number } }
    | { type: 'executing', data: { node?: string | null, prompt_id?: string } }
    | { type: 'progress', data: { value: number, max: number, node?: string, prompt_id?: string } }
    | { type: 'executed', data: { node?: string, prompt_id?: string, output?: Record<string, unknown> } }
    | {
      type: 'execution_error'
      data: {
        prompt_id?: string
        node_id?: string
        node_type?: string
        exception_message?: string
        exception_type?: string
        traceback?: string[]
      }
    }
    | { type: 'execution_interrupted', data: { prompt_id?: string, node_id?: string } }
    | { type: string, data?: Record<string, unknown> }

/* ------------------------------------------------------------------ */
/* 工作流持久化                                                         */
/* ------------------------------------------------------------------ */

export interface ComfyWorkflowSummary {
  id: string
  name: string
  nodeCount: number
  visibility: ComfyWorkflowVisibility
  scope: ComfyWorkflowScope
  createdAt: string
  updatedAt: string
}

export type ComfyWorkflowVisibility = 'private' | 'public'

export type ComfyWorkflowScope = 'mine' | 'public'

export interface ComfyWorkflowRecord extends ComfyWorkflowSummary {
  graph: ComfyWorkflowJSON
}
