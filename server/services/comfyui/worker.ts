import type { ComfyOutput } from '#shared/types/workflow'
import { Buffer } from 'node:buffer'
import { comfyOutputs } from '#shared/utils/comfy-output'
import { applyWorkflowPolicy, workflowNodeRule } from '#shared/utils/workflow'
import { and, eq, sql } from 'drizzle-orm'
import { useDatabase } from '../../database/client'
import { assets, creativeDocuments, creativeDocumentVersions, outboxEvents, runs, works } from '../../database/schema'
import { createOssUploader } from '../../utils/oss'
import { archiveComfyResponse } from '../output-archive'
import { readConnectionVersion } from '../platform/connections'
import { runRequestSchema } from '../platform/schemas'
import { assertWorkflowAssets } from './catalog'
import { comfyClient, ComfyRequestError } from './client'

async function completeWorkflow(id: string, outputs: ComfyOutput[], failed = false) {
  await useDatabase().transaction(async (tx) => {
    const [row] = await tx.select().from(runs).where(eq(runs.id, id)).for('update')
    if (!row || row.kind !== 'workflow' || row.settlementStatus !== 'not_required' || row.status === 'SUCCEEDED' || row.status === 'FAILED')
      return
    for (const [index, output] of outputs.entries()) {
      let documentId: string | undefined
      let versionId: string | undefined
      const title = row.request?.kind === 'workflow' ? (row.request.input as { prompt: string }).prompt : '工作流作品'
      if (output.kind === 'text') {
        const [doc] = await tx.insert(creativeDocuments).values({ ownerId: row.ownerId, projectId: row.projectId!, kind: 'copy', title }).returning()
        documentId = doc!.id
        const [version] = await tx.insert(creativeDocumentVersions).values({ documentId, version: 1, source: 'ai', provider: 'comfyui', model: 'workflow', content: { title, summary: (output.text || '').slice(0, 500), content: output.text || '', characters: [], scenes: [], keywords: [] } }).returning()
        versionId = version!.id
        await tx.update(creativeDocuments).set({ currentVersionId: versionId }).where(eq(creativeDocuments.id, documentId))
      }
      await tx.insert(works).values({ ownerId: row.ownerId, projectId: row.projectId, runId: id, kind: output.kind, title, summary: (output.text || '').slice(0, 500), documentId, versionId, sourceKey: `workflow:${id}:${index}`, sourceFile: output.filename ? { filename: output.filename, subfolder: output.subfolder, type: 'output' } : undefined, availability: output.kind === 'text' ? 'available' : 'pending' }).onConflictDoNothing()
    }
    await tx.update(runs).set({ status: failed ? 'FAILED' : 'SUCCEEDED', stage: failed || outputs.every(o => o.kind === 'text') ? 'complete' : 'archiving', workflow: { ...row.workflow, outputs }, error: failed ? '工作流执行失败。请检查节点配置和素材。' : !outputs.length ? '工作流完成，但没有受支持的文本、图片或视频输出。' : null, updatedAt: new Date() }).where(eq(runs.id, id))
  })
}
export async function runWorkflowJob(id: string) {
  const db = useDatabase()
  const [row] = await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.kind, 'workflow')))
  if (!row || row.stage === 'complete' || row.stage === 'review')
    return
  if (row.stage === 'submitting') {
    await failWorkflowJob(id)
    return
  }
  if (!row.connectionVersionId)
    throw new Error('Missing workflow connection')
  const { version, secrets } = await readConnectionVersion(row.connectionVersionId)
  const client = comfyClient(version.settings, secrets)
  if (row.stage === 'queued') {
    // Claim before any external submission; a crash after this point cannot resubmit.
    const [claimed] = await db.update(runs).set({ status: 'RUNNING', stage: 'submitting', updatedAt: new Date() }).where(and(eq(runs.id, id), eq(runs.stage, 'queued'), eq(runs.settlementStatus, 'not_required'))).returning()
    if (!claimed)
      return
    let dispatched = false
    try {
      const request = runRequestSchema.parse(row.request)
      if (request.kind !== 'workflow')
        throw new Error('Invalid workflow')
      const policy = version.settings.workflowPolicy || { maxNodes: 100, nodes: {} }
      const catalog = await client.catalog()
      const graph = applyWorkflowPolicy(request.input, policy, catalog).graph
      const owned = await assertWorkflowAssets(row.ownerId, request.input)
      for (const [binding, assetId] of Object.entries(request.input.assets)) {
        const asset = owned.find(a => a.id === assetId)!
        let bytes: Uint8Array
        const maxBytes = asset.contentType.startsWith('video/') ? 100 * 1024 * 1024 : 20 * 1024 * 1024
        if (asset.size > maxBytes)
          throw new Error('Asset too large')
        if (asset.objectKey) {
          const uploader = createOssUploader()
          if (!uploader)
            throw new Error('Private storage unavailable')
          const response = await fetch(await uploader.sign(asset.objectKey, 300), { signal: AbortSignal.timeout(120000) })
          if (!response.ok)
            throw new Error('Asset unavailable')
          bytes = new Uint8Array(await response.arrayBuffer())
        }
        else {
          bytes = await useStorage('data').getItemRaw<Uint8Array>(asset.localStorageKey || '') || new Uint8Array()
        }
        if (!bytes.length || bytes.length > maxBytes)
          throw new Error('Invalid asset size')
        const form = new FormData()
        const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' } as Record<string, string>)[asset.contentType]
        if (!ext)
          throw new Error('Unsupported media type')
        form.set('image', new Blob([Buffer.from(bytes)], { type: asset.contentType }), `${asset.id}.${ext}`)
        form.set('subfolder', `huezumi/${row.ownerId}/${id}`)
        form.set('type', 'input')
        form.set('overwrite', 'true')
        const uploaded = await (await client.request('/upload/image', { method: 'POST', body: form })).json() as { name: string, subfolder: string }
        const split = binding.indexOf('.')
        graph[binding.slice(0, split)]!.inputs[binding.slice(split + 1)] = `${uploaded.subfolder}/${uploaded.name}`
      }
      for (const node of Object.values(graph)) {
        for (const [name, key] of Object.entries(workflowNodeRule(catalog[node.class_type], policy.nodes[node.class_type], node.inputs).secretInputs)) {
          if (!secrets[key])
            throw new Error('Missing server credential')
          node.inputs[name] = secrets[key]!
        }
      }
      dispatched = true
      const promptId = await client.submit(graph, id)
      await db.transaction(async (tx) => {
        await tx.update(runs).set({ stage: 'submitted', promptId, workflow: { promptId }, updatedAt: new Date() }).where(eq(runs.id, id))
        await tx.insert(outboxEvents).values({ topic: 'run.workflow', aggregateId: id, payload: {}, availableAt: new Date(Date.now() + 3000) })
      })
    }
    catch (error) {
      if (!dispatched || (error instanceof ComfyRequestError && error.definite))
        await completeWorkflow(id, [], true)
      else
        await failWorkflowJob(id)
    }
    return
  }
  if (row.stage === 'submitted' && row.workflow?.promptId) {
    const promptId = row.workflow.promptId
    const history = await (await client.request(`/history/${encodeURIComponent(promptId)}`)).json() as Record<string, { outputs?: Record<string, unknown>, status?: { completed?: boolean, status_str?: string } }>
    const record = history[promptId]
    if (record?.status?.status_str === 'error') {
      await completeWorkflow(id, [], true)
      return
    }
    if (!record?.status?.completed) {
      if (Date.now() - row.createdAt.getTime() > 6 * 3600000) {
        await failWorkflowJob(id)
        return
      }
      await db.insert(outboxEvents).values({ topic: 'run.workflow', aggregateId: id, payload: {}, availableAt: new Date(Date.now() + 5000) })
      return
    }
    await completeWorkflow(id, comfyOutputs(record.outputs || {}))
  }
  const outputs = await db.select().from(works).where(eq(works.runId, id))
  let incomplete = false
  for (const work of outputs) {
    if (work.kind === 'text' || work.assetId || !work.sourceFile)
      continue
    try {
      const response = await client.request(`/view?${new URLSearchParams({ filename: work.sourceFile.filename, subfolder: work.sourceFile.subfolder || '', type: 'output' })}`)
      const archived = await archiveComfyResponse(work.id, row.ownerId, work.sourceFile.filename, response)
      await db.transaction(async (tx) => {
        await tx.execute(sql`select id from users where id=${row.ownerId} for update`)
        const [locked] = await tx.select().from(works).where(eq(works.id, work.id)).for('update')
        if (locked?.assetId)
          return
        const space = await tx.execute<{ available: string }>(sql`select (storage_limit_bytes - coalesce((select sum(size) from assets where owner_id=${row.ownerId} and deleted_at is null),0) - coalesce((select sum(size) from asset_reservations where owner_id=${row.ownerId} and expires_at>now()),0))::text as available from users where id=${row.ownerId}`)
        if (Number(space.rows[0]?.available || 0) < archived.size)
          throw new Error('Insufficient private storage')
        const [asset] = await tx.insert(assets).values({ ownerId: row.ownerId, name: work.sourceFile!.filename, objectKey: archived.objectKey, size: archived.size, contentType: archived.contentType }).returning()
        await tx.update(works).set({ assetId: asset!.id, availability: 'available' }).where(eq(works.id, work.id))
      })
    }
    catch {
      incomplete = true
      await db.update(works).set({ availability: 'unavailable' }).where(and(eq(works.id, work.id), sql`${works.assetId} is null`))
    }
  }
  await db.update(runs).set({ stage: incomplete ? 'archiving' : 'complete', error: incomplete ? '生成已完成，保存失败。重试保存不会重新生成。' : null, updatedAt: new Date() }).where(and(eq(runs.id, id), eq(runs.status, 'SUCCEEDED')))
  if (incomplete)
    throw new Error('Workflow archive incomplete')
}

/** Unknown external outcomes require explicit synchronization, never a second submission. */
export async function failWorkflowJob(id: string) {
  await useDatabase().update(runs).set({ status: 'UNKNOWN', stage: 'review', error: '执行结果暂不明确，请同步已知任务或由管理员核查服务记录。', updatedAt: new Date() }).where(and(eq(runs.id, id), eq(runs.kind, 'workflow'), sql`${runs.status} in ('PENDING', 'RUNNING', 'UNKNOWN')`))
}
