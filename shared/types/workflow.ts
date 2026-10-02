/** ComfyUI's API graph is the execution contract, independent of the canvas library. */
export type WorkflowValue = string | number | boolean | [string, number]
export interface WorkflowNode {
  class_type: string
  inputs: Record<string, WorkflowValue>
  _meta?: { title?: string }
}
export type WorkflowGraph = Record<string, WorkflowNode>
export interface WorkflowInput {
  prompt: string
  graph: WorkflowGraph
  assets: Record<string, string>
}
export interface WorkflowLayout {
  positions: Record<string, { x: number, y: number }>
}
export interface WorkflowRecord {
  id: string
  name: string
  graph: WorkflowGraph
  layout: WorkflowLayout
  assets: Record<string, string>
  revision: number
  isTemplate: boolean
  ownerId: string
}
export interface ComfyInputOptions {
  default?: string | number | boolean
  min?: number
  max?: number
  step?: number
  multiline?: boolean
  control_after_generate?: boolean
  forceInput?: boolean
  image_upload?: boolean
  video_upload?: boolean
  tooltip?: string
  hidden?: boolean
  template?: { min?: number, names?: string[], input?: ComfyNodeDefinition['input'] }
  options?: Array<string | number | { key: string, inputs: ComfyNodeDefinition['input'] }>
}
export type ComfyInput = [string | Array<string | number>, ComfyInputOptions?]
export interface ComfyNodeDefinition {
  display_name?: string
  description?: string
  category?: string
  input: { required?: Record<string, ComfyInput>, optional?: Record<string, ComfyInput> }
  input_order?: { required?: string[], optional?: string[] }
  output: string[]
  output_name?: string[]
  output_node?: boolean
}
export type ComfyCatalog = Record<string, ComfyNodeDefinition>
export interface ComfyInstalledNode {
  name: string
  displayName: string
  category: string
  assetInputs: string[]
  credentialInputs: string[]
}
/** Optional node parameter overrides, stored in a versioned database connection. */
export interface WorkflowNodePolicy {
  fixedInputs: Record<string, string | number | boolean>
  assetInputs: string[]
  secretInputs: Record<string, 'apiKey' | 'accessKey' | 'secretKey'>
}
export interface WorkflowPolicy {
  nodes: Record<string, WorkflowNodePolicy>
  maxNodes: number
}
export interface ComfyOutput {
  nodeId: string
  kind: 'text' | 'image' | 'video'
  text?: string
  filename?: string
  subfolder?: string
  type?: 'output'
}
export interface WorkflowExecution {
  promptId?: string
  outputs?: ComfyOutput[]
}
export interface ComfyRuntimeStatus {
  state: 'disabled' | 'missing' | 'stopped' | 'starting' | 'running' | 'external' | 'error'
  managed: boolean
  message?: string
}
