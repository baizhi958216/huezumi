import type { ComfyApiWorkflow } from '#shared/types/comfyui'
import { currentConnection, readSettings } from './connections'

/** Private, per-submission snapshot. Never persist this payload in workflow JSON. */
export async function workflowRuntimeConnections(prompt: ComfyApiWorkflow) {
  const types = new Set(Object.values(prompt).map(node => node.class_type))
  const managedPrompt = Object.values(prompt).some(node => node.class_type === 'HuezumiPrompt' && node.inputs.connection_id !== 'manual' && !node.inputs.llm_config)
  const purposes = [
    { purpose: 'agent', needed: types.has('HuezumiQwenImage21Agent') || managedPrompt, field: 'workflowAgentConnectionId', kind: 'text' },
    { purpose: 'image', needed: types.has('HuezumiApiImage'), field: 'defaultImageConnectionId', kind: 'image' },
    { purpose: 'video', needed: types.has('HuezumiBailianWan3Video'), field: 'workflowVideoConnectionId', kind: 'video' },
  ] as const
  if (!purposes.some(item => item.needed) && !types.has('HuezumiPrompt'))
    return undefined
  const settings = await readSettings()
  const result: Record<string, Record<string, unknown>> = {}
  for (const item of purposes) {
    if (!item.needed)
      continue
    const id = settings[item.field]
    if (!id) {
      // Agent nodes can still explicitly use manual/offline mode.
      if (item.purpose === 'agent' && !managedPrompt)
        continue
      throw createError({ statusCode: 422, statusMessage: `请在管理面板分配工作流${{ agent: 'Agent', image: '图片', video: '视频' }[item.purpose]}连接` })
    }
    const { connection, version, secrets } = await currentConnection(id)
    if (connection.kind !== item.kind || (item.purpose === 'video' && connection.provider !== 'dashscope'))
      throw createError({ statusCode: 422, statusMessage: '工作流连接类型不匹配，请在管理面板重新分配' })
    const config = version.settings
    const baseUrl = config.baseUrl || (config.workspaceId
      ? `https://${config.workspaceId}.${config.region || 'cn-beijing'}.maas.aliyuncs.com/api/v1`
      : 'https://dashscope.aliyuncs.com/api/v1')
    result[item.purpose] = { ...config, provider: connection.provider, baseUrl, ...secrets, revisionId: version.id }
  }
  return result
}
