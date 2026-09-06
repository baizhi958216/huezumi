import type { ComfyWorkflowJSON, ComfyWorkflowRecord, ComfyWorkflowScope, ComfyWorkflowSummary, ComfyWorkflowVisibility } from '#shared/types/comfyui'
import { and, desc, eq, or } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { workflows } from '../../database/schema'

const ID_PATTERN = /^[\w-]{1,64}$/

export function isValidWorkflowId(id: string): boolean {
  return ID_PATTERN.test(id)
}

function normalizeVisibility(value: string): ComfyWorkflowVisibility {
  return value === 'public' ? 'public' : 'private'
}

function scopeFor(row: typeof workflows.$inferSelect, ownerId: string): ComfyWorkflowScope {
  return row.ownerId === ownerId ? 'mine' : 'public'
}

function toRecord(row: typeof workflows.$inferSelect, ownerId: string): ComfyWorkflowRecord {
  return {
    id: row.id,
    name: row.name,
    nodeCount: row.graph.nodes?.length ?? 0,
    visibility: normalizeVisibility(row.visibility),
    scope: scopeFor(row, ownerId),
    graph: row.graph,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listWorkflows(ownerId: string): Promise<ComfyWorkflowSummary[]> {
  const rows = await useDatabase().select().from(workflows).where(or(eq(workflows.ownerId, ownerId), eq(workflows.visibility, 'public'))).orderBy(desc(workflows.updatedAt))
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    nodeCount: row.graph.nodes?.length ?? 0,
    visibility: normalizeVisibility(row.visibility),
    scope: scopeFor(row, ownerId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function getWorkflow(ownerId: string, id: string): Promise<ComfyWorkflowRecord | undefined> {
  if (!isValidWorkflowId(id))
    return undefined
  const [row] = await useDatabase().select().from(workflows).where(and(eq(workflows.id, id), or(eq(workflows.ownerId, ownerId), eq(workflows.visibility, 'public')))).limit(1)
  return row ? toRecord(row, ownerId) : undefined
}

export interface SaveWorkflowInput { id?: string, name: string, graph: ComfyWorkflowJSON, visibility?: ComfyWorkflowVisibility }

export async function saveWorkflow(ownerId: string, input: SaveWorkflowInput): Promise<ComfyWorkflowRecord> {
  const db = useDatabase()
  if (input.id) {
    const values: { name: string, graph: ComfyWorkflowJSON, updatedAt: Date, visibility?: ComfyWorkflowVisibility } = {
      name: input.name.trim() || '未命名工作流',
      graph: input.graph,
      updatedAt: new Date(),
    }
    if (input.visibility)
      values.visibility = input.visibility
    const [updated] = await db.update(workflows).set(values).where(and(eq(workflows.id, input.id), eq(workflows.ownerId, ownerId))).returning()
    if (!updated)
      throw createError({ statusCode: 404, statusMessage: '工作流不存在' })
    return toRecord(updated, ownerId)
  }
  const [created] = await db.insert(workflows).values({ ownerId, name: input.name.trim() || '未命名工作流', visibility: input.visibility ?? 'private', graph: input.graph }).returning()
  return toRecord(created!, ownerId)
}

export async function deleteWorkflow(ownerId: string, id: string): Promise<boolean> {
  if (!isValidWorkflowId(id))
    return false
  const deleted = await useDatabase().delete(workflows).where(and(eq(workflows.id, id), eq(workflows.ownerId, ownerId))).returning({ id: workflows.id })
  return deleted.length > 0
}
