import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ db: undefined as any, request: vi.fn(), submit: vi.fn(), catalog: vi.fn(), archive: vi.fn(), connection: vi.fn(), settings: vi.fn() }))
vi.mock('../server/database/client', () => ({ useDatabase: () => state.db }))
vi.mock('../server/services/platform/connections', () => ({ readConnectionVersion: state.connection, currentConnection: state.connection, readSettings: state.settings }))
vi.mock('../server/services/output-archive', () => ({ archiveComfyResponse: state.archive }))
vi.mock('../server/services/comfyui/client', async original => ({ ...await original<typeof import('../server/services/comfyui/client')>(), comfyClient: () => ({ request: state.request, submit: state.submit, catalog: state.catalog }) }))
vi.mock('../server/services/generation-queue', () => ({ publishOutbox: async () => {}, enqueueGeneration: vi.fn() }))
const { quoteRun } = await import('../server/services/platform/quotes')
const { getRun, commandRun } = await import('../server/services/platform/runs')
const { submitWorkflow } = await import('../server/services/comfyui/runs')
const { runWorkflowJob } = await import('../server/services/comfyui/worker')
const { ComfyRequestError } = await import('../server/services/comfyui/client')
const { listWorkflows, saveWorkflow } = await import('../server/services/comfyui/workflows')
const enabled = Boolean(process.env.HUEZUMI_TEST_DATABASE_URL)

describe.skipIf(!enabled)('workflow lifecycle in isolated PostgreSQL', () => {
  const schema = `workflow_test_${randomUUID().replaceAll('-', '')}`
  let admin: Pool
  let pool: Pool
  let owner: string
  let connectionId: string
  let request: any
  beforeAll(async () => {
    if (!/^\/huezumi_test_[0-9a-f]+$/.test(new URL(process.env.HUEZUMI_TEST_DATABASE_URL!).pathname))
      throw new Error('Use pnpm test:postgres')
    admin = new Pool({ connectionString: process.env.HUEZUMI_TEST_DATABASE_URL })
    await admin.query(`create schema ${schema}`)
    for (const table of ['users', 'runs', 'works', 'assets', 'asset_reservations', 'quotes', 'wallets', 'ledger_entries', 'creative_projects', 'generations', 'creative_documents', 'creative_document_versions', 'outbox_events', 'workflows', 'platform_connections', 'connection_versions'])
      await admin.query(`create table ${schema}.${table} (like public.${table} including all)`)
    pool = new Pool({ connectionString: process.env.HUEZUMI_TEST_DATABASE_URL, options: `-c search_path=${schema}` })
    state.db = drizzle(pool)
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal('createError', (value: object) => Object.assign(new Error('fixture'), value))
    await pool.query('truncate users, runs, works, assets, asset_reservations, quotes, wallets, ledger_entries, creative_projects, generations, creative_documents, creative_document_versions, outbox_events, workflows, platform_connections, connection_versions')
    owner = randomUUID()
    connectionId = randomUUID()
    await pool.query('insert into users (id,email,display_name,password_hash) values ($1,$2,\'fixture\',\'fixture\')', [owner, `${owner}@example.test`])
    await pool.query('insert into wallets (user_id,balance_credits,reserved_credits) values ($1,100,0)', [owner])
    request = { kind: 'workflow', connectionId, model: 'workflow', input: { prompt: '测试工作流', graph: { 1: { class_type: 'Output', inputs: { text: 'hello' } } }, assets: {} } }
    state.connection.mockResolvedValue({ connection: { id: connectionId, kind: 'workflow', provider: 'comfyui' }, version: { id: randomUUID(), version: 1, settings: { baseUrl: 'http://127.0.0.1:8188', defaultModel: 'workflow', models: ['workflow'], workflowPolicy: { maxNodes: 20, nodes: { Output: { credits: 7, fixedInputs: {}, secretInputs: {}, assetInputs: [] } } } } }, secrets: {} })
    state.settings.mockResolvedValue({ defaultWorkflowConnectionId: connectionId, userMaxActiveGenerations: 3, platformDailyCreditBudget: 1000 })
    state.catalog.mockResolvedValue({ Output: { input: { required: { text: ['STRING'] } }, output: [], output_node: true } })
    state.submit.mockResolvedValue('upstream-prompt')
    state.request.mockResolvedValue(Response.json({ 'upstream-prompt': { status: { completed: true, status_str: 'success' }, outputs: { 1: { text: ['generated text'], images: [{ filename: 'one.png', type: 'output' }], videos: [{ filename: 'two.mp4', type: 'output' }] } } } }))
    state.archive.mockResolvedValue({ objectKey: 'private/output', size: 100, contentType: 'image/png' })
  })
  afterAll(async () => {
    await pool?.end()
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`)
      await admin.end()
    }
  })
  async function admit() {
    const payload = { input: request.input, idempotencyKey: randomUUID() }
    return { run: await submitWorkflow(owner, payload), payload }
  }
  async function result(id: string) {
    return { run: (await pool.query('select * from runs where id=$1', [id])).rows[0], wallet: (await pool.query('select * from wallets where user_id=$1', [owner])).rows[0], ledger: (await pool.query('select * from ledger_entries where run_id=$1 and type<>\'reserve\'', [id])).rows, works: (await pool.query('select * from works where run_id=$1', [id])).rows }
  }
  it('binds graph and connection version, admits once, and includes workflow concurrency', async () => {
    const { run, payload } = await admit()
    expect((await submitWorkflow(owner, payload)).id).toBe(run.id)
    expect((await result(run.id)).wallet.reserved_credits).toBe(0)
    expect((await pool.query('select * from outbox_events')).rows).toHaveLength(1)
    await expect(submitWorkflow(owner, { ...payload, input: { ...payload.input, prompt: 'changed' } })).rejects.toMatchObject({ statusCode: 409 })
    state.settings.mockResolvedValue({ defaultWorkflowConnectionId: connectionId, userMaxActiveGenerations: 1, platformDailyCreditBudget: 1000 })
    await expect(submitWorkflow(owner, { ...payload, idempotencyKey: randomUUID() })).rejects.toMatchObject({ statusCode: 429 })
  })
  it('admits and executes a newly installed plugin without adding it to configuration', async () => {
    const connection = await state.connection()
    connection.version.settings.workflowPolicy.nodes = {}
    const { run } = await admit()
    await runWorkflowJob(run.id)
    expect((await result(run.id)).run.stage).toBe('submitted')
    expect(state.submit).toHaveBeenCalledWith({ 1: { class_type: 'Output', inputs: { text: 'hello' } } }, run.id)
  })
  it('runs without a wallet and never creates quotes or ledger entries', async () => {
    await pool.query('delete from wallets where user_id=$1', [owner])
    const { run } = await admit()
    await runWorkflowJob(run.id)
    await runWorkflowJob(run.id)
    expect((await result(run.id)).run.status).toBe('SUCCEEDED')
    expect((await pool.query('select * from quotes')).rows).toHaveLength(0)
    expect((await pool.query('select * from ledger_entries')).rows).toHaveLength(0)
    await expect(quoteRun(owner, request)).rejects.toMatchObject({ statusCode: 422 })
  })
  it('submits once, saves text and mixed media once across redeliveries', async () => {
    const { run } = await admit()
    await runWorkflowJob(run.id)
    expect((await result(run.id)).run.stage).toBe('submitted')
    await runWorkflowJob(run.id)
    await runWorkflowJob(run.id)
    const data = await result(run.id)
    expect(data.run).toMatchObject({ status: 'SUCCEEDED', stage: 'complete', settlement_status: 'not_required' })
    expect(data.wallet).toMatchObject({ balance_credits: 100, reserved_credits: 0 })
    expect(data.works).toHaveLength(3)
    expect(data.works.every(work => work.availability === 'available')).toBe(true)
    expect(data.ledger).toHaveLength(0)
    expect(state.submit).toHaveBeenCalledTimes(1)
    expect((await pool.query('select * from creative_document_versions')).rows).toHaveLength(1)
  })
  it('never resubmits an ambiguous request or a crashed submitting run', async () => {
    const { run } = await admit()
    state.submit.mockRejectedValue(new ComfyRequestError(false))
    await runWorkflowJob(run.id)
    await runWorkflowJob(run.id)
    expect((await result(run.id)).run).toMatchObject({ status: 'UNKNOWN', settlement_status: 'not_required' })
    expect(state.submit).toHaveBeenCalledTimes(1)
    expect((await result(run.id)).wallet.reserved_credits).toBe(0)
    await pool.query('update runs set stage=\'submitting\', status=\'RUNNING\', settlement_status=\'not_required\' where id=$1', [run.id])
    await runWorkflowJob(run.id)
    expect(state.submit).toHaveBeenCalledTimes(1)
  })
  it('records definite rejection and execution failure without financial settlement', async () => {
    const { run } = await admit()
    state.submit.mockRejectedValue(new ComfyRequestError(true))
    await runWorkflowJob(run.id)
    expect((await result(run.id)).wallet.reserved_credits).toBe(0)
    expect((await result(run.id)).run.status).toBe('FAILED')
    state.submit.mockResolvedValue('upstream-prompt')
    const next = await admit()
    await runWorkflowJob(next.run.id)
    state.request.mockResolvedValue(Response.json({ 'upstream-prompt': { status: { completed: false, status_str: 'error' } } }))
    await runWorkflowJob(next.run.id)
    expect((await result(next.run.id)).run.status).toBe('FAILED')
  })
  it('only retries missing archives, without generating again', async () => {
    const { run } = await admit()
    await runWorkflowJob(run.id)
    state.archive.mockRejectedValueOnce(new Error('offline'))
    await expect(runWorkflowJob(run.id)).rejects.toThrow('archive incomplete')
    expect((await result(run.id)).run.stage).toBe('archiving')
    await runWorkflowJob(run.id)
    expect((await result(run.id)).run.stage).toBe('complete')
    expect(state.submit).toHaveBeenCalledTimes(1)
    expect(state.archive).toHaveBeenCalledTimes(3)
    expect((await result(run.id)).ledger).toHaveLength(0)
  })
  it('does not enqueue when the pinned backend is stopped', async () => {
    state.request.mockRejectedValue(new ComfyRequestError(false))
    await expect(submitWorkflow(owner, { input: request.input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ statusCode: 503 })
    expect((await pool.query('select reserved_credits from wallets where user_id=$1', [owner])).rows[0].reserved_credits).toBe(0)
    expect((await pool.query('select * from outbox_events')).rows).toHaveLength(0)
  })
  it('enforces owner access to tasks and assets', async () => {
    const { run } = await admit()
    await expect(getRun(randomUUID(), run.id)).rejects.toMatchObject({ statusCode: 404 })
    request.input.assets = { '1.text': randomUUID() }
    await expect(submitWorkflow(owner, { input: request.input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ statusCode: 422 })
  })
  it('explicitly synchronizes known prompts via an outbox without regenerating', async () => {
    const { run } = await admit()
    await runWorkflowJob(run.id)
    await pool.query('update runs set status=\'UNKNOWN\', stage=\'review\', settlement_status=\'not_required\' where id=$1', [run.id])
    expect((await getRun(owner, run.id)).allowedActions).toContain('sync')
    await commandRun(owner, run.id, 'sync')
    await runWorkflowJob(run.id)
    expect((await result(run.id)).run.status).toBe('SUCCEEDED')
    expect(state.submit).toHaveBeenCalledTimes(1)
  })
  it('protects private workflows, template publishing and optimistic revisions', async () => {
    const input = { name: 'private', graph: request.input.graph, layout: { positions: {} } }
    const own = await saveWorkflow(owner, false, input)
    expect(await listWorkflows(randomUUID())).toEqual([])
    await expect(saveWorkflow(owner, false, { ...input, isTemplate: true })).rejects.toMatchObject({ statusCode: 403 })
    await saveWorkflow(owner, false, { ...input, revision: own.revision }, own.id)
    await expect(saveWorkflow(owner, false, { ...input, revision: own.revision }, own.id)).rejects.toMatchObject({ statusCode: 409 })
    await expect(saveWorkflow(randomUUID(), false, { ...input, revision: 2 }, own.id)).rejects.toMatchObject({ statusCode: 409 })
  })
})
