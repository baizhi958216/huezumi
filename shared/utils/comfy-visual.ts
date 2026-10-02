import type { ComfyCatalog, ComfyInput, WorkflowGraph, WorkflowLayout, WorkflowPolicy } from '../types/workflow'
import { z } from 'zod'
import { isCredentialInput, workflowGraphSchema } from './workflow'

const id = z.union([z.string().regex(/^[\w-]{1,80}$/), z.number().int().nonnegative().safe()]).transform(String)
const field = z.string().min(1).max(200).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value))
const port = z.object({ name: field, type: z.union([z.string(), z.number()]).optional(), link: z.union([id, z.null()]).optional() })
const visualSchema = z.object({
  nodes: z.array(z.object({
    id,
    type: field,
    title: z.string().max(120).optional(),
    pos: z.union([z.tuple([z.number().finite(), z.number().finite()]), z.object({ 0: z.number().finite(), 1: z.number().finite() })]),
    mode: z.number().optional(),
    inputs: z.array(port).default([]),
    outputs: z.array(port).default([]),
    widgets_values: z.array(z.unknown()).default([]),
  })).min(1).max(200),
  links: z.array(z.tuple([id, id, z.number().int().min(0).max(1000), id, z.number().int().min(0).max(1000), z.unknown()])).max(10000).default([]),
})
export function isVisualWorkflow(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'nodes' in value && Array.isArray(value.nodes))
}
export function workflowNodeCount(value: unknown): number {
  if (!value || typeof value !== 'object')
    return 0
  return 'nodes' in value && Array.isArray(value.nodes) ? value.nodes.length : Object.keys(value).length
}
export interface WorkflowPreview {
  graph: WorkflowGraph
  layout: WorkflowLayout
  ports: ComfyCatalog
  issues: string[]
}
/** Convert only schema-described widgets. Ambiguous extension state stays in the original document. */
export function previewVisualWorkflow(value: unknown, catalog: ComfyCatalog, policy?: WorkflowPolicy): WorkflowPreview {
  if (JSON.stringify(value)?.length > 2 * 1024 * 1024)
    throw new Error('工作流不能超过 2 MB')
  const visual = visualSchema.parse(value)
  const graph: WorkflowGraph = {}
  const layout: WorkflowLayout = { positions: {} }
  const ports: ComfyCatalog = {}
  const issues: string[] = []
  for (const node of visual.nodes) {
    if (graph[node.id])
      throw new Error(`节点编号重复：${node.id}`)
    const inputs: WorkflowGraph[string]['inputs'] = {}
    graph[node.id] = { class_type: node.type, inputs, _meta: { title: node.title } }
    layout.positions[node.id] = { x: node.pos[0], y: node.pos[1] }
    ports[node.id] = { input: { required: Object.fromEntries(node.inputs.map(input => [input.name, [String(input.type || '*'), { forceInput: true }]])) }, output: node.outputs.map(output => String(output.type || '*')), output_name: node.outputs.map(output => output.name) }
    const problem = (text: string) => issues.push(`#${node.id} ${node.type}：${text}`)
    if (node.mode && node.mode !== 0)
      problem('包含禁用或旁路状态，请先在官方编辑器导出 API 格式')
    const definition = catalog[node.type]
    if (!definition) {
      problem('当前服务未提供此节点定义，无法还原参数')
      continue
    }
    let cursor = 0
    for (const group of ['required', 'optional'] as const) {
      const specs = definition.input[group] || {}
      const order = definition.input_order?.[group] || Object.keys(specs)
      for (const name of order) {
        const spec = specs[name]
        if (!spec)
          continue
        const [type, options] = spec
        if (options?.forceInput)
          continue
        const widget = Array.isArray(type) || ['STRING', 'INT', 'FLOAT', 'BOOLEAN', 'COMBO'].includes(type)
        if (!widget) {
          if (type.startsWith('COMFY_'))
            problem(`动态输入 ${name} 需要 API 格式`)
          continue
        }
        const val = node.widgets_values[cursor++]
        if (typeof val === 'string' || typeof val === 'boolean' || (typeof val === 'number' && Number.isFinite(val) && Math.abs(val) <= Number.MAX_SAFE_INTEGER)) {
          const rule = policy?.nodes[node.type]
          if (!isCredentialInput(name) && !options?.image_upload && !options?.video_upload && !rule?.assetInputs.includes(name) && !(rule && (name in rule.secretInputs || name in rule.fixedInputs)))
            inputs[name] = val
        }
        else {
          problem(`无法识别 ${name} 的控件值`)
        }
        if (options?.control_after_generate) {
          if (['fixed', 'increment', 'decrement', 'randomize'].includes(String(node.widgets_values[cursor])))
            cursor++
          else
            problem(`${name} 的生成后控制状态不完整`)
        }
      }
    }
    if (cursor !== node.widgets_values.length)
      problem('控件数量与当前节点定义不一致')
  }
  for (const [, source, slot, target, targetSlot] of visual.links) {
    const targetNode = visual.nodes.find(node => node.id === target)
    const input = targetNode?.inputs[targetSlot]
    if (!graph[source] || !graph[target] || !input) {
      issues.push(`连接 ${source} → ${target} 无法还原`)
      continue
    }
    const sourceDefinition = catalog[graph[source]!.class_type]
    const targetDefinition = catalog[graph[target]!.class_type]
    if (sourceDefinition && !sourceDefinition.output[slot])
      issues.push(`#${source} ${graph[source]!.class_type}：当前节点定义已不包含输出端口 ${slot}`)
    if (targetDefinition && !targetDefinition.input.required?.[input.name] && !targetDefinition.input.optional?.[input.name])
      issues.push(`#${target} ${graph[target]!.class_type}：当前节点定义已不包含输入 ${input.name}`)
    if (Array.isArray(graph[target]!.inputs[input.name]))
      issues.push(`#${target}：输入 ${input.name} 存在重复连接`)
    graph[target]!.inputs[input.name] = [source, slot]
    // Keep ports from the original canvas, including nodes absent from the live catalog.
    const targetPorts = ports[target]!.input.required as Record<string, ComfyInput>
    targetPorts[input.name] = [String(input.type || '*'), { forceInput: true }]
  }
  return { graph: workflowGraphSchema.parse(graph), layout, ports, issues: [...new Set(issues)] }
}
