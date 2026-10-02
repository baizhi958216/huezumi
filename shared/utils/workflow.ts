import type { ComfyCatalog, ComfyInput, WorkflowGraph, WorkflowInput, WorkflowNodePolicy, WorkflowPolicy, WorkflowValue } from '../types/workflow'
import { z } from 'zod'

const key = z.string().min(1).max(200).refine(value => !['__proto__', 'prototype', 'constructor'].includes(value), '字段名无效')
export function isCredentialInput(name: string) {
  return /api.?key|secret|password|(?:^|[_.])token$/i.test(name)
}
const nodeKey = z.string().regex(/^[\w-]{1,80}$/)
const value = z.union([z.string().max(50000), z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), z.boolean(), z.tuple([nodeKey, z.number().int().min(0).max(1000)])])
export const workflowGraphSchema = z.record(nodeKey, z.object({
  class_type: key,
  inputs: z.record(key, value),
  _meta: z.object({ title: z.string().max(120).optional() }).optional(),
}).strict()).refine(v => Object.keys(v).length > 0 && Object.keys(v).length <= 200, '工作流需要 1–200 个节点').refine(v => JSON.stringify(v).length <= 2 * 1024 * 1024, '工作流不能超过 2 MB')
export const workflowInputSchema = z.object({
  prompt: z.string().trim().min(1).max(120),
  graph: workflowGraphSchema,
  assets: z.record(z.string().max(250), z.uuid()).default({}),
}).strict()
export const workflowLayoutSchema = z.object({ positions: z.record(key, z.object({ x: z.number().finite(), y: z.number().finite() })) })
export const workflowPolicySchema = z.object({
  maxNodes: z.number().int().min(1).max(200).default(100),
  nodes: z.record(key, z.object({
    // Accept old configuration on read; execution never uses node prices.
    credits: z.number().int().min(0).max(1000000).optional(),
    fixedInputs: z.record(key, z.union([z.string().max(10000), z.number().finite(), z.boolean()])).default({}),
    assetInputs: z.array(key).default([]),
    secretInputs: z.record(key, z.enum(['apiKey', 'accessKey', 'secretKey'])).default({}),
  }).strict().superRefine((rule, context) => {
    for (const [name, value] of Object.entries(rule.fixedInputs)) {
      if (isCredentialInput(name) && value !== '')
        context.addIssue({ code: 'custom', message: '凭据必须通过 secretInputs 映射，不能明文固定', path: ['fixedInputs', name] })
    }
    const protectedNames = [...Object.keys(rule.fixedInputs), ...Object.keys(rule.secretInputs), ...rule.assetInputs]
    if (new Set(protectedNames).size !== protectedNames.length)
      context.addIssue({ code: 'custom', message: '固定、密钥和素材输入不能重复配置' })
  })),
}).strict()
/** Expand V3 dependent fields from their schema, never from node class names. */
export function expandedInputs(definition?: ComfyCatalog[string], values: Record<string, WorkflowValue> = {}) {
  const inputs: Record<string, ComfyInput> = {}
  const required: string[] = []
  const expand = (groups: ComfyCatalog[string]['input'], prefix = '', depth = 0) => {
    if (depth > 8)
      throw new Error('节点动态输入嵌套过深')
    for (const group of ['required', 'optional'] as const) {
      for (const [name, spec] of Object.entries(groups[group] || {})) {
        const field = `${prefix}${name}`
        if (spec[1]?.hidden && values[field] === undefined)
          continue
        // Named image groups expose connected ports plus one spare for the next reference.
        const template = spec[1]?.template
        const imageSpecs = Object.values(template?.input?.required || {})
        if (spec[0] === 'COMFY_AUTOGROW_V3' && template?.names?.length && imageSpecs.length === 1 && imageSpecs[0]![0] === 'IMAGE' && !Object.keys(template.input?.optional || {}).length && !imageSpecs[0]![1]?.image_upload && !imageSpecs[0]![1]?.video_upload) {
          const names = template.names
          const minimum = template.min ?? 1
          if (names.length > 200 || new Set(names).size !== names.length || names.some(name => !key.safeParse(name).success || name.includes('.')) || !Number.isInteger(minimum) || minimum < 0 || minimum > names.length)
            throw new Error('节点动态图片端口定义无效')
          const lastUsed = names.reduce((last, name, index) => `${field}.${name}` in values ? index : last, -1)
          for (const [index, name] of names.slice(0, Math.max(minimum, lastUsed + 2)).entries()) {
            const port = `${field}.${name}`
            inputs[port] = ['IMAGE', { forceInput: true }]
            if (group === 'required' && index < minimum)
              required.push(port)
          }
          continue
        }
        // Other empty zero-minimum groups remain valid; unsupported populated ports fail closed.
        if (spec[0] === 'COMFY_AUTOGROW_V3' && spec[1]?.template?.min === 0 && values[field] === undefined)
          continue
        if (spec[0] === 'COMFY_DYNAMICCOMBO_V3') {
          const options = (spec[1]?.options || []).filter((o): o is { key: string, inputs: ComfyCatalog[string]['input'] } => typeof o === 'object')
          inputs[field] = [options.map(o => o.key), spec[1]]
          const selected = options.find(o => o.key === (values[field] ?? options[0]?.key))
          if (selected)
            expand(selected.inputs, `${field}.`, depth + 1)
        }
        else if (spec[0] === 'COMBO') {
          inputs[field] = [(spec[1]?.options || []).filter((o): o is string | number => typeof o !== 'object'), spec[1]]
        }
        else {
          inputs[field] = spec
        }
        if (group === 'required')
          required.push(field)
      }
    }
  }
  if (definition)
    expand(definition.input)
  return { inputs, required }
}
export function nodeInputs(definition?: ComfyCatalog[string], values: Record<string, WorkflowValue> = {}) {
  return expandedInputs(definition, values).inputs
}
export function isLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1])
}
export function inputDefault([type, options]: ComfyInput): string | number | boolean | undefined {
  if (options?.forceInput)
    return undefined
  if (options?.default !== undefined)
    return options.default
  if (Array.isArray(type))
    return type[0]
  return type === 'STRING' ? '' : type === 'BOOLEAN' ? false : type === 'INT' || type === 'FLOAT' ? (options?.min ?? 0) : undefined
}
export function compatibleOutput(output: string, input: ComfyInput) {
  const type = Array.isArray(input[0]) ? 'COMBO' : input[0]
  return output === type || output === '*' || type === '*' || type.split(',').includes(output)
}
/** Explain unavailable choices without replacing the user's selected model. */
export function workflowChoiceIssue(input: ComfyInput, value: WorkflowValue | undefined): string | undefined {
  if (!Array.isArray(input[0]) || isLink(value))
    return undefined
  if (!input[0].length)
    return 'ComfyUI 暂无可选项；请安装对应模型或检查节点配置，然后刷新节点'
  if (value === undefined || value === '')
    return '请从当前可用列表中选择一项'
  if (!input[0].includes(value as string | number))
    return '原选项已不在 ComfyUI 当前列表中，请重新选择'
}
/** Validates graph topology and literal constraints against the live backend schema. */
export function validateWorkflow(graph: WorkflowGraph, catalog: ComfyCatalog) {
  const issues: string[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) {
      issues.push(`节点 ${id} 存在循环连接`)
      return
    }
    if (visited.has(id) || !graph[id])
      return
    visiting.add(id)
    for (const val of Object.values(graph[id]!.inputs)) {
      if (isLink(val))
        visit(val[0])
    }
    visiting.delete(id)
    visited.add(id)
  }
  let output = false
  for (const [id, node] of Object.entries(graph)) {
    const definition = catalog[node.class_type]
    if (!definition) {
      issues.push(`节点 ${id}：未安装 ${node.class_type}`)
      continue
    }
    output ||= Boolean(definition.output_node)
    const { inputs, required } = expandedInputs(definition, node.inputs)
    for (const name of required) {
      if (!(name in node.inputs))
        issues.push(workflowChoiceIssue(inputs[name]!, undefined) ? `节点 ${id} · ${name}：${workflowChoiceIssue(inputs[name]!, undefined)}` : `节点 ${id}：缺少 ${name}`)
    }
    for (const [name, val] of Object.entries(node.inputs)) {
      const input = inputs[name]
      if (!input) {
        issues.push(`节点 ${id}：未知输入 ${name}`)
        continue
      }
      const [type, options] = input
      if (isLink(val)) {
        const origin = graph[val[0]]
        const outputType = origin && catalog[origin.class_type]?.output[val[1]]
        if (!outputType || !compatibleOutput(outputType, input))
          issues.push(`节点 ${id}：${name} 连接类型不匹配或源节点不存在`)
      }
      else if (Array.isArray(type)) {
        const issue = workflowChoiceIssue(input, val)
        if (issue)
          issues.push(`节点 ${id} · ${name}：${issue}`)
      }
      else if (type === 'INT' || type === 'FLOAT' ? typeof val !== 'number' || (type === 'INT' && !Number.isInteger(val)) || (options?.min !== undefined && val < options.min) || (options?.max !== undefined && val > options.max) : type === 'BOOLEAN' ? typeof val !== 'boolean' : type === 'STRING' ? typeof val !== 'string' : true) {
        issues.push(`节点 ${id}：${name} 的值不符合节点定义`)
      }
    }
    visit(id)
  }
  if (!output)
    issues.push('至少需要一个输出节点')
  return [...new Set(issues)]
}
/** Node configuration overrides defaults; it is not an execution allowlist. */
export function workflowNodeRule(definition: ComfyCatalog[string] | undefined, configured?: WorkflowNodePolicy, values: Record<string, WorkflowValue> = {}) {
  const assetInputs = new Set(configured?.assetInputs || [])
  for (const [name, spec] of Object.entries(nodeInputs(definition, values))) {
    if (spec[1]?.image_upload || spec[1]?.video_upload)
      assetInputs.add(name)
  }
  return { fixedInputs: configured?.fixedInputs || {}, secretInputs: configured?.secretInputs || {}, assetInputs: [...assetInputs] }
}
/** Never accept backend file names or credentials from a browser. */
export function applyWorkflowPolicy(input: WorkflowInput, policy: WorkflowPolicy, catalog?: ComfyCatalog) {
  if (Object.keys(input.graph).length > policy.maxNodes)
    throw new Error('节点数量超过连接上限')
  const graph = structuredClone(input.graph)
  const assetKeys = new Set<string>()
  for (const [id, node] of Object.entries(graph)) {
    const definition = catalog?.[node.class_type]
    if (catalog && !definition)
      throw new Error(`ComfyUI 未加载节点 ${node.class_type}`)
    const rule = workflowNodeRule(definition, policy.nodes[node.class_type], node.inputs)
    const required = new Set(expandedInputs(definition, node.inputs).required)
    Object.assign(node.inputs, rule.fixedInputs)
    for (const name of Object.keys(rule.secretInputs))
      node.inputs[name] = '__server_secret__'
    for (const name of rule.assetInputs) {
      const binding = `${id}.${name}`
      if (definition && !required.has(name) && !policy.nodes[node.class_type]?.assetInputs.includes(name) && !input.assets[binding] && (node.inputs[name] === undefined || node.inputs[name] === '')) {
        delete node.inputs[name]
        continue
      }
      if (!input.assets[binding])
        throw new Error(`节点 ${id} 的 ${name} 需要上传素材`)
      assetKeys.add(binding)
      node.inputs[name] = '__owner_asset__'
    }
  }
  if (Object.keys(input.assets).some(key => !assetKeys.has(key)))
    throw new Error('素材绑定不属于已配置的上传字段')
  return { graph }
}
/** Native API JSON keeps custom-node inputs intact without assuming widget order. */
export function importWorkflow(value: unknown): WorkflowGraph {
  if (typeof value !== 'object' || !value)
    throw new Error('请选择工作流 JSON 文件')
  if ('nodes' in value)
    throw new Error('请从 ComfyUI 导出 API 格式 JSON；第三方前端组件格式不能无损转换')
  return workflowGraphSchema.parse('graph' in value ? value.graph : value)
}
export function defaultNodeInputs(definition: ComfyCatalog[string], values: Record<string, WorkflowValue> = {}) {
  const inputs: Record<string, WorkflowValue> = {}
  for (const [name, input] of Object.entries(nodeInputs(definition, values))) {
    const val = inputDefault(input)
    if (val !== undefined)
      inputs[name] = val
  }
  return inputs
}
