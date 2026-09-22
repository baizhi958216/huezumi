import type { ComfyWorkflowJSON, ComfyWorkflowRecord, ComfyWorkflowScope, ComfyWorkflowSummary, ComfyWorkflowVisibility } from '#shared/types/comfyui'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { and, desc, eq, or } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { workflows } from '../../database/schema'

const ID_PATTERN = /^[\w-]{1,64}$/

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidWorkflowId(id: string): boolean {
  return ID_PATTERN.test(id)
}

export function isUuid(id: string): boolean {
  return UUID_PATTERN.test(id)
}

function normalizeVisibility(value: string): ComfyWorkflowVisibility {
  return value === 'public' ? 'public' : 'private'
}

/** A workflow-owned key is intentionally visible to its owner, but never to a public copy. */
export function hasEmbeddedLlmSecret(graph: ComfyWorkflowJSON): boolean {
  return graph.nodes?.some((node) => {
    if (node.type !== 'HuezumiLLMConfig')
      return false
    const apiKey = node.widgets_values?.[1]
    return typeof apiKey === 'string' && apiKey.trim().length > 0
  }) ?? false
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

interface BuiltinWorkflowEntry {
  id: string
  name: string
  nodeCount: number
  visibility: ComfyWorkflowVisibility
  scope: ComfyWorkflowScope
  graph: ComfyWorkflowJSON
  createdAt: string
  updatedAt: string
}

let cachedBuiltins: BuiltinWorkflowEntry[] | null = null

function loadBuiltinWorkflows(): BuiltinWorkflowEntry[] {
  if (cachedBuiltins && process.env.NODE_ENV === 'production')
    return cachedBuiltins

  const dir = resolve(process.cwd(), 'workflows')
  if (!existsSync(dir)) {
    cachedBuiltins = []
    return []
  }

  const entries: BuiltinWorkflowEntry[] = []
  try {
    const files = readdirSync(dir).filter(name => name.endsWith('.json') && !name.endsWith('-api.json'))
    for (const file of files) {
      const fullPath = join(dir, file)
      try {
        const content = readFileSync(fullPath, 'utf8')
        const graph = JSON.parse(content) as ComfyWorkflowJSON
        const basename = file.replace(/\.json$/, '')
        const id = `builtin-${basename.replace(/[^\w-]/g, '-')}`
        const stats = statSync(fullPath)
        entries.push({
          id,
          name: graph.name || file.replace(/\.json$/, ''),
          nodeCount: graph.nodes?.length ?? 0,
          visibility: 'public',
          scope: 'public',
          graph,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
        })
      }
      catch {
        // 忽略无效文件
      }
    }
  }
  catch {
    // 忽略目录读取异常
  }

  cachedBuiltins = entries
  return entries
}

export async function listWorkflows(ownerId: string): Promise<ComfyWorkflowSummary[]> {
  const rows = await useDatabase().select().from(workflows).where(or(eq(workflows.ownerId, ownerId), eq(workflows.visibility, 'public'))).orderBy(desc(workflows.updatedAt))
  const dbSummaries: ComfyWorkflowSummary[] = rows.map(row => ({
    id: row.id,
    name: row.name,
    nodeCount: row.graph.nodes?.length ?? 0,
    visibility: normalizeVisibility(row.visibility),
    scope: scopeFor(row, ownerId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))

  const existingIds = new Set(dbSummaries.map(s => s.id))
  const existingNames = new Set(dbSummaries.map(s => s.name))
  const builtins = loadBuiltinWorkflows()
    .filter(b => !existingIds.has(b.id) && !existingNames.has(b.name))
    .map(b => ({
      id: b.id,
      name: b.name,
      nodeCount: b.nodeCount,
      visibility: b.visibility,
      scope: b.scope,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }))

  return [...dbSummaries, ...builtins]
}

export async function getWorkflow(ownerId: string, id: string): Promise<ComfyWorkflowRecord | undefined> {
  if (!isValidWorkflowId(id))
    return undefined

  const builtin = loadBuiltinWorkflows().find(entry => entry.id === id)
  if (builtin) {
    return {
      id: builtin.id,
      name: builtin.name,
      nodeCount: builtin.nodeCount,
      visibility: 'public',
      scope: 'public',
      graph: builtin.graph,
      createdAt: builtin.createdAt,
      updatedAt: builtin.updatedAt,
    }
  }

  if (!isUuid(id))
    return undefined

  const [row] = await useDatabase().select().from(workflows).where(and(eq(workflows.id, id), or(eq(workflows.ownerId, ownerId), eq(workflows.visibility, 'public')))).limit(1)
  if (row)
    return toRecord(row, ownerId)

  return undefined
}

export interface SaveWorkflowInput { id?: string, name: string, graph: ComfyWorkflowJSON, visibility?: ComfyWorkflowVisibility }

export async function saveWorkflow(ownerId: string, input: SaveWorkflowInput): Promise<ComfyWorkflowRecord> {
  const db = useDatabase()
  if (input.id) {
    if (!isUuid(input.id))
      throw createError({ statusCode: 400, statusMessage: '无法直接覆盖内置工作流' })
    const [existing] = await db.select({ visibility: workflows.visibility }).from(workflows).where(and(eq(workflows.id, input.id), eq(workflows.ownerId, ownerId))).limit(1)
    if (!existing)
      throw createError({ statusCode: 404, statusMessage: '工作流不存在' })
    const visibility = normalizeVisibility(input.visibility ?? existing.visibility)
    if (visibility === 'public' && hasEmbeddedLlmSecret(input.graph))
      throw createError({ statusCode: 422, statusMessage: '包含工作流 API Key 的工作流不能设为公开，请改为私有后保存' })
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
  const visibility = input.visibility ?? 'private'
  if (visibility === 'public' && hasEmbeddedLlmSecret(input.graph))
    throw createError({ statusCode: 422, statusMessage: '包含工作流 API Key 的工作流不能设为公开，请改为私有后保存' })
  const [created] = await db.insert(workflows).values({ ownerId, name: input.name.trim() || '未命名工作流', visibility, graph: input.graph }).returning()
  return toRecord(created!, ownerId)
}

export async function deleteWorkflow(ownerId: string, id: string): Promise<boolean> {
  if (!isValidWorkflowId(id) || !isUuid(id))
    return false
  const deleted = await useDatabase().delete(workflows).where(and(eq(workflows.id, id), eq(workflows.ownerId, ownerId))).returning({ id: workflows.id })
  return deleted.length > 0
}
