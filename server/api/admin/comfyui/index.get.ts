import type { ComfyInstalledNode } from '#shared/types/workflow'
import { discoverComfyNodes } from '#shared/utils/comfy-discovery'
import { comfyClient } from '../../../services/comfyui/client'
import { listConnections, readConnectionVersion, readSettings } from '../../../services/platform/connections'
import { requireAdmin } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const settings = await readSettings()
  const connection = (await listConnections()).find(c => c.id === settings.defaultWorkflowConnectionId)
  let nodes: ComfyInstalledNode[] = []
  let scanError: string | undefined
  if (connection) {
    try {
      const { version, secrets } = await readConnectionVersion(connection.revisionId)
      nodes = discoverComfyNodes(await comfyClient(version.settings, secrets).catalog())
    }
    catch {
      scanError = '无法读取节点目录，请检查 ComfyUI 服务状态和已保存的连接地址。'
    }
  }
  return { connection: connection || null, nodes, nodeNames: nodes.map(node => node.name), scanError }
})
