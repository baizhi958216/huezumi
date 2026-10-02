import type { ConnectionSecrets, ConnectionSettings } from '#shared/types/platform'
import type { ComfyCatalog, WorkflowInput, WorkflowPolicy } from '#shared/types/workflow'
import { applyWorkflowPolicy, expandedInputs, isCredentialInput, validateWorkflow, workflowNodeRule } from '#shared/utils/workflow'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { assets } from '../../database/schema'
import { currentConnection, readSettings } from '../platform/connections'
import { comfyClient } from './client'

export async function workflowConnection() {
  const settings = await readSettings()
  if (!settings.defaultWorkflowConnectionId)
    throw createError({ statusCode: 503, statusMessage: '管理员尚未配置工作流服务' })
  const result = await currentConnection(settings.defaultWorkflowConnectionId)
  if (result.connection.kind !== 'workflow' || result.connection.provider !== 'comfyui')
    throw createError({ statusCode: 503, statusMessage: '工作流连接无效' })
  return result
}
/** File-choice lists in /object_info contain other users' input filenames. Never expose them. */
export function publicCatalog(raw: ComfyCatalog, policy: WorkflowPolicy = { maxNodes: 100, nodes: {} }, execution = false): ComfyCatalog {
  const result: ComfyCatalog = {}
  for (const [name, definition] of Object.entries(raw)) {
    const rule = workflowNodeRule(definition, policy.nodes[name])
    const copy: ComfyCatalog[string] = { display_name: definition.display_name, description: definition.description, category: definition.category, input: structuredClone(definition.input), output: definition.output, output_name: definition.output_name, output_node: definition.output_node }
    const sanitize = (groups: ComfyCatalog[string]['input'], prefix = '') => {
      for (const group of ['required', 'optional'] as const) {
        for (const [field, input] of Object.entries(groups[group] || {})) {
          const path = `${prefix}${field}`
          if (rule.assetInputs.includes(path) || input[1]?.image_upload || input[1]?.video_upload) {
            groups[group]![field] = ['STRING', { image_upload: true }]
          }
          else if (path in rule.secretInputs || path in rule.fixedInputs || isCredentialInput(path)) {
            if (execution && path in rule.secretInputs)
              groups[group]![field] = ['STRING']
            else if (!execution)
              delete groups[group]![field]
          }
          for (const option of input[1]?.options || []) {
            if (typeof option === 'object')
              sanitize(option.inputs, `${path}.`)
          }
        }
      }
    }
    // Do not forward backend-only hidden fields or private metadata.
    copy.input = { required: copy.input.required, optional: copy.input.optional }
    sanitize(copy.input)
    result[name] = copy
  }
  return result
}
export async function assertWorkflowAssets(ownerId: string, input: WorkflowInput) {
  const ids = [...new Set(Object.values(input.assets))]
  if (!ids.length)
    return []
  const rows = await useDatabase().select().from(assets).where(and(eq(assets.ownerId, ownerId), inArray(assets.id, ids), isNull(assets.deletedAt)))
  if (rows.length !== ids.length || rows.some(row => !/^(?:image|video|audio)\//.test(row.contentType)))
    throw createError({ statusCode: 422, statusMessage: '工作流素材不存在或不属于当前账户' })
  return rows
}
export async function prepareWorkflow(ownerId: string, input: WorkflowInput, settings: ConnectionSettings, provider: string, secrets: ConnectionSecrets) {
  if (provider !== 'comfyui')
    throw createError({ statusCode: 422, statusMessage: '工作流连接无效' })
  const policy = settings.workflowPolicy || { maxNodes: 100, nodes: {} }
  const raw = await comfyClient(settings, secrets).catalog()
  try {
    const normalized = applyWorkflowPolicy(input, policy, raw)
    for (const node of Object.values(input.graph)) {
      const rule = workflowNodeRule(raw[node.class_type], policy.nodes[node.class_type], node.inputs)
      const { inputs, required } = expandedInputs(raw[node.class_type], node.inputs)
      for (const name of Object.keys(inputs)) {
        if (isCredentialInput(name) && (required.includes(name) || name in node.inputs) && !rule.secretInputs[name] && !(name in rule.fixedInputs))
          throw new Error('凭据字段必须通过服务端策略配置')
      }
    }
    const errors = validateWorkflow(normalized.graph, publicCatalog(raw, policy, true))
    if (errors.length)
      throw new Error(errors.slice(0, 8).join('；'))
    // Normalize protected inputs before hashing; browser copies never retain secrets or paths.
    input.graph = normalized.graph
    await assertWorkflowAssets(ownerId, input)
  }
  catch (error) {
    throw createError({ statusCode: 422, statusMessage: error instanceof Error ? error.message : '工作流无效' })
  }
}
