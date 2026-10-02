import { isCredentialInput, workflowGraphSchema, workflowLayoutSchema } from '#shared/utils/workflow'
import { and, desc, eq, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { useDatabase } from '../../database/client'
import { connectionVersions, platformConnections, workflows } from '../../database/schema'
import { readSettings } from '../platform/connections'
import { assertWorkflowAssets } from './catalog'

const schema = z.object({ name: z.string().trim().min(1).max(120), graph: workflowGraphSchema, layout: workflowLayoutSchema, assets: z.record(z.string(), z.uuid()).default({}), revision: z.number().int().min(1).optional(), isTemplate: z.boolean().default(false) }).strict()
export async function listWorkflows(ownerId: string) {
  return useDatabase().select().from(workflows).where(or(eq(workflows.ownerId, ownerId), eq(workflows.isTemplate, true))).orderBy(desc(workflows.updatedAt)).limit(200)
}
export async function saveWorkflow(ownerId: string, admin: boolean, input: unknown, id?: string) {
  const body = schema.parse(input)
  if (body.isTemplate && !admin)
    throw createError({ statusCode: 403, statusMessage: '只有管理员可以发布模板' })
  const settings = await readSettings()
  const [connection] = settings.defaultWorkflowConnectionId ? await useDatabase().select({ settings: connectionVersions.settings }).from(platformConnections).innerJoin(connectionVersions, eq(connectionVersions.id, platformConnections.currentVersionId)).where(eq(platformConnections.id, settings.defaultWorkflowConnectionId)) : []
  for (const node of Object.values(body.graph)) {
    const rule = connection?.settings.workflowPolicy?.nodes[node.class_type]
    for (const field of [...Object.keys(rule?.secretInputs || {}), ...Object.keys(rule?.fixedInputs || {}), ...(rule?.assetInputs || [])])
      delete node.inputs[field]
  }
  if (Object.values(body.graph).some(node => Object.keys(node.inputs).some(name => isCredentialInput(name))))
    throw createError({ statusCode: 422, statusMessage: '请移除工作流中的凭据字段，改用连接密钥映射' })
  if (body.isTemplate)
    body.assets = {}
  else
    await assertWorkflowAssets(ownerId, { prompt: body.name, graph: body.graph, assets: body.assets })
  if (!id) {
    const [row] = await useDatabase().insert(workflows).values({ ownerId, name: body.name, graph: body.graph, layout: body.layout, assets: body.assets, isTemplate: body.isTemplate }).returning()
    return row!
  }
  const [row] = await useDatabase().update(workflows).set({ name: body.name, graph: body.graph, layout: body.layout, assets: body.assets, isTemplate: body.isTemplate, revision: sql`${workflows.revision} + 1`, updatedAt: new Date() }).where(and(eq(workflows.id, id), eq(workflows.ownerId, ownerId), eq(workflows.revision, body.revision || 0))).returning()
  if (!row)
    throw createError({ statusCode: 409, statusMessage: '工作流已更新或不属于当前用户；请另存副本，保留当前编辑' })
  return row
}
