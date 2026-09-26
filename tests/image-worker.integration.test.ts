import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ db: undefined as any, generate: vi.fn(), archive: vi.fn(), connection: vi.fn(), settings: vi.fn() }))
vi.mock('../server/database/client', () => ({ useDatabase: () => state.db }))
vi.mock('../server/services/platform/connections', () => ({ readConnectionVersion: state.connection, currentConnection: state.connection, readSettings: state.settings }))
vi.mock('../server/services/platform/image-input', () => ({ resolveImageInputs: async () => [] }))
vi.mock('../server/services/output-archive', () => ({ archiveRemoteOutput: state.archive }))
vi.mock('../server/services/providers/dashscope-image', async original => ({ ...await original<typeof import('../server/services/providers/dashscope-image')>(), generateDashscopeImages: state.generate }))
vi.mock('../server/services/generation-queue', () => ({ publishOutbox: async () => {}, enqueueGeneration: vi.fn() }))
const { quoteRun } = await import('../server/services/platform/quotes')
const { submitRun } = await import('../server/services/platform/runs')
const { runImageJob } = await import('../server/services/platform/image-worker')
const { ImageProviderError } = await import('../server/services/providers/dashscope-image')
const enabled = process.env.HUEZUMI_IMAGE_DB_TEST === '1'

describe.skipIf(!enabled)('image worker with isolated PostgreSQL tables', () => {
  const schema = `image_test_${randomUUID().replaceAll('-', '')}`
  let admin: Pool
  let pool: Pool
  let id: string
  let owner: string
  beforeAll(async () => {
    admin = new Pool({ connectionString: process.env.NUXT_DATABASE_URL })
    await admin.query(`create schema ${schema}`)
    // Copy structure only, never user data; no writes target the public schema.
    for (const table of ['runs', 'works', 'assets', 'quotes', 'pricing_rules', 'wallets', 'ledger_entries', 'creative_projects', 'generations', 'creative_documents', 'creative_document_versions', 'outbox_events'])
      await admin.query(`create table ${schema}.${table} (like public.${table} including all)`)
    pool = new Pool({ connectionString: process.env.NUXT_DATABASE_URL, options: `-c search_path=${schema}` })
    state.db = drizzle(pool)
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal('createError', (value: object) => Object.assign(new Error('fixture'), value))
    await pool.query('truncate runs, works, assets, quotes, pricing_rules, wallets, ledger_entries, creative_projects, generations, creative_documents, creative_document_versions, outbox_events')
    id = randomUUID()
    owner = randomUUID()
    const quote = randomUUID()
    const rule = randomUUID()
    const request = { kind: 'image', connectionId: randomUUID(), model: 'qwen-image-2.0', input: { mode: 'text', prompt: '隔离测试画面', images: [], size: '1024*1024', count: 2, promptExtend: true, watermark: false } }
    await pool.query('insert into pricing_rules (id,provider,model,formula) values ($1,$2,$3,$4)', [rule, 'dashscope', request.model, { fixedCredits: 3 }])
    await pool.query('insert into quotes (id,user_id,request_hash,request,rule_id,price_version,estimated_credits,expires_at) values ($1,$2,$3,$4,$5,1,6,now())', [quote, owner, id, request.input, rule])
    await pool.query('insert into wallets (user_id,balance_credits,reserved_credits) values ($1,100,6)', [owner])
    await pool.query('insert into runs (id,owner_id,kind,request,connection_version_id,quote_id,idempotency_key,request_hash,reserved_credits) values ($1,$2,$3,$4,$5,$6,$7,$7,6)', [id, owner, 'image', request, randomUUID(), quote, id])
    state.connection.mockResolvedValue({ connection: { id: request.connectionId, kind: 'image', provider: 'dashscope' }, version: { id: randomUUID(), settings: { models: [request.model], defaultModel: request.model } }, secrets: { apiKey: 'fixture' } })
    state.settings.mockResolvedValue({ defaultImageConnectionId: request.connectionId, userMaxActiveGenerations: 3, platformDailyCreditBudget: 1000 })
    state.generate.mockResolvedValue(['https://output.test/a.png', 'https://output.test/b.png'])
    state.archive.mockResolvedValue({ objectKey: 'fixture/output.png', size: 200, contentType: 'image/png' })
  })
  afterAll(async () => {
    await pool?.end()
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`)
      await admin.end()
    }
  })
  async function result() {
    return {
      run: (await pool.query('select * from runs where id=$1', [id])).rows[0],
      wallet: (await pool.query('select * from wallets where user_id=$1', [owner])).rows[0],
      works: (await pool.query('select * from works where run_id=$1', [id])).rows,
      ledger: (await pool.query('select * from ledger_entries where run_id=$1', [id])).rows,
    }
  }
  it('quotes and admits an image task exactly once for a repeated idempotency key', async () => {
    const prior = (await result()).run.request
    const quote = await quoteRun(owner, prior)
    expect(quote.estimatedCredits).toBe(6)
    const payload = { request: quote.request, quoteId: quote.id, idempotencyKey: randomUUID() }
    const first = await submitRun(owner, payload)
    const repeated = await submitRun(owner, payload)
    expect(first.id).toBe(repeated.id)
    expect(first.kind).toBe('image')
    expect(first.imageRequest?.model).toBe('qwen-image-2.0')
    expect((await result()).wallet).toMatchObject({ balance_credits: 100, reserved_credits: 12 })
    expect((await pool.query('select * from outbox_events where topic=\'run.image\'')).rows).toHaveLength(1)
    await expect(submitRun(owner, { ...payload, request: { ...quote.request, input: { ...quote.request.input, prompt: 'changed prompt' } } })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('includes existing image tasks in concurrent admission limits', async () => {
    const quote = await quoteRun(owner, (await result()).run.request)
    state.settings.mockResolvedValue({ userMaxActiveGenerations: 1, platformDailyCreditBudget: 1000 })
    await expect(submitRun(owner, { request: quote.request, quoteId: quote.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ statusCode: 429 })
    expect((await result()).wallet.reserved_credits).toBe(6)
  })
  it('includes image reservations in the platform daily budget', async () => {
    const quote = await quoteRun(owner, (await result()).run.request)
    state.settings.mockResolvedValue({ userMaxActiveGenerations: 3, platformDailyCreditBudget: 10 })
    await expect(submitRun(owner, { request: quote.request, quoteId: quote.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ statusCode: 503 })
    expect((await result()).wallet.reserved_credits).toBe(6)
  })
  it('archives outputs, settles once, and does not regenerate on queue redelivery', async () => {
    await runImageJob(id)
    await runImageJob(id)
    const data = await result()
    expect(data.run).toMatchObject({ status: 'SUCCEEDED', stage: 'complete', charged_credits: 6, settlement_status: 'settled' })
    expect(data.wallet).toMatchObject({ balance_credits: 94, reserved_credits: 0 })
    expect(data.works).toHaveLength(2)
    expect(data.works.every(work => work.asset_id && work.availability === 'available')).toBe(true)
    expect(data.ledger).toHaveLength(1)
    expect(state.generate).toHaveBeenCalledTimes(1)
  })
  it('charges only for actual images when upstream partially succeeds', async () => {
    state.generate.mockResolvedValue(['https://output.test/a.png'])
    await runImageJob(id)
    const data = await result()
    expect(data.run.charged_credits).toBe(3)
    expect(data.wallet).toMatchObject({ balance_credits: 97, reserved_credits: 0 })
  })
  it('releases reservations after a definite rejection', async () => {
    state.generate.mockRejectedValue(new ImageProviderError(true))
    await runImageJob(id)
    const data = await result()
    expect(data.run).toMatchObject({ status: 'FAILED', settlement_status: 'released' })
    expect(data.wallet).toMatchObject({ balance_credits: 100, reserved_credits: 0 })
    expect(data.works).toHaveLength(0)
    expect(state.archive).not.toHaveBeenCalled()
  })
  it('retains ambiguous submissions for review without retrying or releasing credits', async () => {
    state.generate.mockRejectedValue(new ImageProviderError(false))
    await runImageJob(id)
    await runImageJob(id)
    const data = await result()
    expect(data.run).toMatchObject({ status: 'UNKNOWN', settlement_status: 'review' })
    expect(data.wallet).toMatchObject({ balance_credits: 100, reserved_credits: 6 })
    expect(state.generate).toHaveBeenCalledTimes(1)
    expect(data.ledger).toHaveLength(0)
  })
  it('does not resend after a worker crashed during submission', async () => {
    await pool.query('update runs set stage=\'submitting\', status=\'RUNNING\' where id=$1', [id])
    await runImageJob(id)
    expect((await result()).run.status).toBe('UNKNOWN')
    expect(state.generate).not.toHaveBeenCalled()
  })
  it('retries only missing archives and never charges twice', async () => {
    state.archive.mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(runImageJob(id)).rejects.toThrow('Image output archive incomplete')
    const failed = await result()
    expect(failed.run).toMatchObject({ status: 'SUCCEEDED', stage: 'archiving', charged_credits: 6 })
    expect(failed.works.filter(work => work.asset_id)).toHaveLength(1)
    await runImageJob(id)
    const recovered = await result()
    expect(recovered.run.stage).toBe('complete')
    expect(recovered.works.every(work => work.asset_id)).toBe(true)
    expect(recovered.ledger).toHaveLength(1)
    expect(state.generate).toHaveBeenCalledTimes(1)
    expect(state.archive).toHaveBeenCalledTimes(3)
  })
})
