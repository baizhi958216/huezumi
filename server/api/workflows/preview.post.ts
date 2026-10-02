import type { ComfyCatalog, WorkflowPolicy } from '#shared/types/workflow'
import { previewVisualWorkflow } from '#shared/utils/comfy-visual'
import { workflowConnection } from '../../services/comfyui/catalog'
import { comfyClient } from '../../services/comfyui/client'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody(event)
  let catalog: ComfyCatalog = {}
  let policy: WorkflowPolicy | undefined
  try {
    const { version, secrets } = await workflowConnection()
    policy = version.settings.workflowPolicy
    catalog = await comfyClient(version.settings, secrets).catalog()
  }
  catch {
    // The original canvas can still be inspected while the backend is offline.
  }
  try {
    return previewVisualWorkflow(body, catalog, policy)
  }
  catch {
    throw createError({ statusCode: 422, statusMessage: '工作流画布格式无效，请检查节点、位置和连线，或导出 API 格式 JSON' })
  }
})
