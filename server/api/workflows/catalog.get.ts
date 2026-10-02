import { discoverComfyNodes } from '#shared/utils/comfy-discovery'
import { publicCatalog, workflowConnection } from '../../services/comfyui/catalog'
import { comfyClient } from '../../services/comfyui/client'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const { connection, version, secrets } = await workflowConnection()
  const policy = version.settings.workflowPolicy || { maxNodes: 100, nodes: {} }
  const installed = await comfyClient(version.settings, secrets).catalog()
  const catalog = publicCatalog(installed, policy)
  return { connectionId: connection.id, model: version.settings.defaultModel, revisionId: version.id, catalog, installedCount: Object.keys(installed).length, rules: Object.fromEntries(discoverComfyNodes(installed).map((node) => {
    const rule = policy.nodes[node.name]
    return [node.name, { assetInputs: [...new Set([...node.assetInputs, ...(rule?.assetInputs || [])])], serverInputs: [...Object.keys(rule?.fixedInputs || {}), ...Object.keys(rule?.secretInputs || {})] }]
  })), maxNodes: policy.maxNodes }
})
