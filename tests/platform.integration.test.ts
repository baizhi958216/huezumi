import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { useDatabasePool } from '../server/database/client'
import { fetchHistoryEntry, submitPrompt, viewFile } from '../server/services/comfyui/client'
import { archiveManagedOutput } from '../server/services/platform/archive'
import { listConnections, readConnectionVersion, revokeConnectionVersion, saveConnection, writeSettings } from '../server/services/platform/connections'
import { documentsPage, saveVersion } from '../server/services/platform/documents'
import { quoteRun } from '../server/services/platform/quotes'
import { getRun, reconcileTextRun, submitRun } from '../server/services/platform/runs'
import { runTextJob } from '../server/services/platform/text-worker'
import { submitWorkflow } from '../server/services/platform/workflows'
import { listWorks, syncVideoWork, syncWorkflowRun } from '../server/services/platform/works'

vi.mock('../server/services/generation-queue', () => ({ publishOutbox: async () => {
}, enqueueGeneration: async () => {
} }))
vi.mock('../server/services/platform/archive', () => ({ archiveManagedOutput: vi.fn() }))
vi.mock('../server/services/comfyui/client', () => ({ submitPrompt: vi.fn(), fetchHistoryEntry: vi.fn(), fetchQueue: vi.fn(async () => ({ queueRunning: [], queuePending: [] })), viewFile: vi.fn() }))
const testUrl = process.env.FORKVDO_TEST_DATABASE_URL
if (testUrl && !new URL(testUrl).pathname.endsWith('_test'))
  throw new Error('Test database required')
const content = { title: '测试故事', summary: '摘要', content: '正文内容', characters: [], scenes: [], keywords: [] }
describe.skipIf(!testUrl)('platform transaction integration', () => {
  let pool: Pool
  let owner: string
  let other: string
  let connection: string
  let firstRevision: string
  const master = randomBytes(32).toString('base64')
  beforeAll(async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ databaseUrl: testUrl, connectionEncryptionKey: master }))
    vi.stubGlobal('createError', (value: Record<string, unknown>) => Object.assign(new Error(String(value.statusMessage)), value))
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/db-migrate.ts'], { env: { ...process.env, NUXT_DATABASE_URL: testUrl }, stdio: 'pipe' })
    pool = new Pool({ connectionString: testUrl })
    await pool.query('truncate users, quotes, generations, platform_connections, outbox_events, pricing_rules cascade')
    owner = (await pool.query('insert into users(email,display_name,password_hash,role)values(\'owner@fixture.invalid\',\'Owner\',\'fixture\',\'admin\')returning id')).rows[0].id
    other = (await pool.query('insert into users(email,display_name,password_hash)values(\'other@fixture.invalid\',\'Other\',\'fixture\')returning id')).rows[0].id
    await pool.query('insert into wallets(user_id,balance_credits)values($1,1000),($2,1000)', [owner, other])
    const c = await saveConnection(owner, { name: 'Writer', kind: 'text', provider: 'openai-compatible', settings: { baseUrl: 'https://fixture.invalid/v1', defaultModel: 'writer', models: ['writer'] }, secrets: { apiKey: 'fixture-key' } })
    connection = c.id
    firstRevision = c.revisionId
    await pool.query('insert into text_prices(connection_id,model,length,credits,version)values($1,\'writer\',\'short\',10,1)', [connection])
    await writeSettings(owner, { registrationMode: 'invite', signupCredits: 0, userMaxActiveGenerations: 10, platformDailyCreditBudget: 10000 })
  })
  afterAll(async () => {
    await pool?.end()
    await useDatabasePool().end()
    vi.unstubAllGlobals()
  })
  function request() {
    return { kind: 'text' as const, connectionId: connection, model: 'writer', input: { kind: 'story' as const, brief: '足够长的创作需求', length: 'short' as const } }
  }
  function mockResponse() {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    return fetch
  }
  it('hides secrets and pins immutable versions', async () => {
    const quote = await quoteRun(owner, request())
    const c = await saveConnection(owner, { name: 'Writer 2', kind: 'text', provider: 'openai-compatible', settings: { baseUrl: 'https://fixture.invalid/v1', defaultModel: 'writer', models: ['writer'] }, secrets: { apiKey: 'new-fixture' } }, connection)
    expect(c.version).toBe(2)
    expect(JSON.stringify(await listConnections())).not.toContain('fixture-key')
    expect(JSON.stringify((await pool.query('select detail from audit_logs')).rows)).not.toContain('fixture-key')
    expect(JSON.stringify((await pool.query('select encrypted_secrets from connection_versions')).rows)).not.toContain('fixture-key')
    expect((await readConnectionVersion(firstRevision)).secrets.apiKey).toBe('fixture-key')
    expect((await pool.query('select connection_version_id from quotes where id=$1', [quote.id])).rows[0].connection_version_id).toBe(firstRevision)
  })
  it('admits duplicate submissions once, saves and charges atomically, and isolates owners', async () => {
    const q = await quoteRun(owner, request())
    const body = { request: q.request, quoteId: q.id, idempotencyKey: randomUUID() }
    const [a, b] = await Promise.all([submitRun(owner, body), submitRun(owner, body)])
    expect(a.id).toBe(b.id)
    await expect(getRun(other, a.id)).rejects.toMatchObject({ statusCode: 404 })
    const fetch = mockResponse()
    await runTextJob(a.id)
    await runTextJob(a.id)
    expect(fetch).toHaveBeenCalledTimes(1)
    const done = await getRun(owner, a.id)
    expect(done.status).toBe('SUCCEEDED')
    expect(done.billing.chargedCredits).toBe(10)
    const wallet = (await pool.query('select balance_credits,reserved_credits from wallets where user_id=$1', [owner])).rows[0]
    expect(wallet).toEqual({ balance_credits: 990, reserved_credits: 0 })
    expect((await documentsPage(owner, {})).items[0]).not.toHaveProperty('content')
    expect((await listWorks(other, {})).total).toBe(0)
    const version = done.documentVersion!
    const edit = { baseVersionId: version.id, content: { ...content, content: '手工修改' } }
    const saved = await Promise.allSettled([saveVersion(owner, version.documentId, edit), saveVersion(owner, version.documentId, edit)])
    expect(saved.filter(x => x.status === 'fulfilled')).toHaveLength(1)
    expect(saved.filter(x => x.status === 'rejected')).toHaveLength(1)
  })
  it('rejects inaccessible context before contacting upstream or reserving credits', async () => {
    const fetch = mockResponse()
    await expect(quoteRun(owner, { ...request(), projectId: randomUUID() })).rejects.toMatchObject({ statusCode: 404 })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('releases definite rejection, but never resubmits an uncertain request', async () => {
    let q = await quoteRun(owner, request())
    let run = await submitRun(owner, { request: q.request, quoteId: q.id, idempotencyKey: randomUUID() })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    await runTextJob(run.id)
    expect((await getRun(owner, run.id)).billing.settlementStatus).toBe('released')
    q = await quoteRun(owner, request())
    run = await submitRun(owner, { request: q.request, quoteId: q.id, idempotencyKey: randomUUID() })
    const fetch = vi.fn(async () => {
      throw new Error('network lost')
    })
    vi.stubGlobal('fetch', fetch)
    await runTextJob(run.id)
    await runTextJob(run.id)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((await getRun(owner, run.id)).billing.settlementStatus).toBe('review')
    await reconcileTextRun(owner, run.id, 'release', '供应商确认未受理')
    await expect(reconcileTextRun(owner, run.id, 'charge', '不应重复结算')).rejects.toMatchObject({ statusCode: 409 })
  })
  it('keeps concurrent manual edits current while preserving the paid AI version', async () => {
    const [doc] = (await documentsPage(owner, {})).items
    const current = (await pool.query('select current_version_id from creative_documents where id=$1', [doc!.id])).rows[0].current_version_id
    const q = await quoteRun(owner, { ...request(), projectId: doc!.projectId, baseVersionId: current, input: { ...request().input, documentId: doc!.id } })
    const run = await submitRun(owner, { request: q.request, quoteId: q.id, idempotencyKey: randomUUID() })
    const saved = await saveVersion(owner, doc!.id, { baseVersionId: current, content: { ...content, content: '生成过程中手工修改' } })
    mockResponse()
    await runTextJob(run.id)
    expect((await getRun(owner, run.id)).needsReview).toBe(true)
    expect((await pool.query('select current_version_id from creative_documents where id=$1', [doc!.id])).rows[0].current_version_id).toBe(saved.id)
  })
  it('rejects expired quotes, mismatched idempotency, balance, active limits and budget without reserves', async () => {
    const q = await quoteRun(owner, request())
    const body = { request: q.request, quoteId: q.id, idempotencyKey: randomUUID() }
    await pool.query('update quotes set expires_at=now()-interval \'1 minute\' where id=$1', [q.id])
    await expect(submitRun(owner, body)).rejects.toMatchObject({ statusCode: 409 })
    const live = await quoteRun(other, request())
    await pool.query('update wallets set balance_credits=0 where user_id=$1', [other])
    await expect(submitRun(other, { ...body, request: live.request, quoteId: live.id })).rejects.toMatchObject({ statusCode: 402 })
    await writeSettings(owner, { platformDailyCreditBudget: 0 })
    await expect(submitRun(owner, { ...body, quoteId: (await quoteRun(owner, request())).id })).rejects.toMatchObject({ statusCode: 503 })
    await writeSettings(owner, { userMaxActiveGenerations: 1, platformDailyCreditBudget: 10000 })
    const admittedQuote = await quoteRun(owner, request())
    const admitted = await submitRun(owner, { ...body, request: admittedQuote.request, quoteId: admittedQuote.id })
    await expect(submitRun(owner, { ...body, request: { ...admittedQuote.request, model: 'different' }, quoteId: admittedQuote.id })).rejects.toMatchObject({ statusCode: 409 })
    await expect(submitRun(owner, { ...body, idempotencyKey: randomUUID(), quoteId: admittedQuote.id })).rejects.toMatchObject({ statusCode: 429 })
    // A worker restart after dispatch must not issue another paid request.
    await pool.query('update runs set stage=\'submitting\',status=\'RUNNING\' where id=$1', [admitted.id])
    const fetch = mockResponse()
    await runTextJob(admitted.id)
    expect(fetch).not.toHaveBeenCalled()
    expect((await getRun(owner, admitted.id)).billing.settlementStatus).toBe('review')
    await reconcileTextRun(owner, admitted.id, 'release', 'fixture review')
    await writeSettings(owner, { userMaxActiveGenerations: 10, platformDailyCreditBudget: 10000 })
  })
  it('persists workflow intent before uncertain submission and never resends the same identity', async () => {
    const promptId = randomUUID()
    const body = { promptId, prompt: { 1: { class_type: 'Fixture', inputs: {} } } }
    vi.mocked(submitPrompt).mockImplementation(async () => {
      expect((await pool.query('select id from runs where prompt_id=$1', [promptId])).rows).toHaveLength(1)
      throw new Error('connection lost after acceptance')
    })
    await expect(submitWorkflow(owner, body)).rejects.toMatchObject({ statusCode: 502 })
    const existing = await submitWorkflow(owner, body)
    expect(vi.mocked(submitPrompt)).toHaveBeenCalledTimes(1)
    expect((await getRun(owner, existing.runId)).status).toBe('UNKNOWN')
    await expect(submitWorkflow(other, body)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('deduplicates workflow outputs, retries archive without history and reads saved works offline', async () => {
    const promptId = randomUUID()
    const id = (await pool.query('insert into runs(owner_id,kind,prompt_id,idempotency_key,request_hash,settlement_status)values($1,\'workflow\',$2,$2,\'fixture\',\'exempt\')returning id', [owner, promptId])).rows[0].id
    const file = { filename: 'result.png', subfolder: '', type: 'output' }
    vi.mocked(fetchHistoryEntry).mockResolvedValue({ status: { status_str: 'success', completed: true }, outputs: { a: { images: [file, file] } } })
    vi.mocked(viewFile).mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])))
    vi.mocked(archiveManagedOutput).mockRejectedValueOnce(new Error('storage offline'))
    await syncWorkflowRun(id)
    expect((await getRun(owner, id)).status).toBe('SUCCEEDED')
    expect((await pool.query('select * from works where run_id=$1', [id])).rows).toHaveLength(1)
    vi.mocked(fetchHistoryEntry).mockRejectedValue(new Error('engine offline'))
    vi.mocked(archiveManagedOutput).mockResolvedValue(3)
    await Promise.all([syncWorkflowRun(id), syncWorkflowRun(id)])
    const saved = (await pool.query('select * from works where run_id=$1', [id])).rows[0]
    expect(saved.availability).toBe('available')
    expect((await pool.query('select * from assets where id=$1', [saved.asset_id])).rows).toHaveLength(1)
    expect((await listWorks(owner, {})).items.find(w => w.id === saved.id)?.url).toContain('/api/assets/')
    expect((await getRun(owner, id)).billing.settlementStatus).toBe('exempt')
  })
  it('paginates records that differ only in database microseconds without omissions', async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()]
    for (const [index, id] of ids.entries())
      await pool.query('insert into works(id,owner_id,kind,title,source_key,created_at)values($1::uuid,$2,\'image\',\'cursor-fixture\',$1::text,$3)', [id, owner, `2026-09-18T10:00:00.00000${index + 1}Z`])
    const found: string[] = []
    let cursor: string | null = null
    do {
      const page = await listWorks(owner, { q: 'cursor-fixture', limit: 1, ...(cursor ? { cursor } : {}) })
      found.push(...page.items.map(w => w.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(found.sort()).toEqual(ids.sort())
  })
  it('preserves historical video identity, billing and media links behind the new run API', async () => {
    const input = { provider: 'dashscope', model: 'fixture-video', prompt: '历史视频', mode: 'text', media: [], resolution: '720P', ratio: '16:9', duration: 5 }
    const quote = (await pool.query('insert into quotes(user_id,request_hash,request,estimated_credits,price_version,expires_at)values($1,\'legacy-fixture\',$2,0,1,now())returning id', [owner, input])).rows[0].id
    const id = (await pool.query('insert into generations(owner_id,request,request_hash,idempotency_key,quote_id,status,settlement_status,reserved_credits,charged_credits,video_archived,output_archive)values($1,$2,\'legacy-fixture\',$3,$4,\'SUCCEEDED\',\'settled\',0,0,true,$5)returning id', [owner, input, randomUUID(), quote, { status: 'archived', objectKey: 'legacy/output.mp4' }])).rows[0].id
    await syncVideoWork(id)
    const run = await getRun(owner, id)
    expect(run.generation?.id).toBe(id)
    expect(run.generation?.videoUrl).toBe(`/api/generations/${id}/video`)
    expect(run.billing.settlementStatus).toBe('settled')
    expect(run.projectId).toBeUndefined()
    await expect(getRun(other, id)).rejects.toMatchObject({ statusCode: 404 })
    expect((await pool.query('select status,charged_credits from generations where id=$1', [id])).rows[0]).toEqual({ status: 'SUCCEEDED', charged_credits: 0 })
  })
  it('imports legacy configuration and backfills twice without changing versions, keys or billing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'forkvdo-import-test-'))
    const env = { PATH: process.env.PATH, NUXT_DATABASE_URL: testUrl, NUXT_CONNECTION_ENCRYPTION_KEY: master }
    const cli = (file: string, args: string[] = []) => execFileSync(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve(file), ...args], { cwd: directory, env, encoding: 'utf8' })
    try {
      await writeFile(join(directory, '.env'), `NUXT_DATABASE_URL=${testUrl}\nNUXT_CONNECTION_ENCRYPTION_KEY=${master}\nNUXT_TEXT_LLM_CONNECTIONS_JSON='{"fixture":{"baseUrl":"https://fixture.invalid/v1","defaultModel":"writer","apiKey":"private-import-fixture"}}'\nNUXT_SIGNUP_CREDITS=12\n`)
      const output = cli('scripts/config-import.ts')
      expect(output).not.toContain('private-import-fixture')
      const before = (await pool.query('select count(*)::int as count from connection_versions')).rows[0].count
      cli('scripts/config-import.ts', ['--compact-env'])
      expect((await pool.query('select count(*)::int as count from connection_versions')).rows[0].count).toBe(before)
      const values = parseEnv(await readFile(join(directory, '.env'), 'utf8'))
      expect(values.NUXT_TEXT_LLM_CONNECTIONS_JSON).toBeUndefined()
      expect(values.NUXT_CONNECTION_ENCRYPTION_KEY).toBe(master)
      for (const name of await readdir(directory))
        expect((await stat(join(directory, name))).mode & 0o777).toBe(0o600)
      cli('scripts/backfill-platform.ts')
      const counts = async () => (await pool.query('select (select count(*) from runs) as runs,(select count(*) from works) as works,(select count(*) from ledger_entries) as ledger')).rows[0]
      const first = await counts()
      cli('scripts/backfill-platform.ts')
      expect(await counts()).toEqual(first)
      expect(cli('scripts/config-check.ts')).not.toContain(master)
      await writeFile(join(directory, '.env'), 'NUXT_TEXT_LLM_CONNECTIONS_JSON=\'{\"private-invalid-fixture\"\'\n')
      try {
        cli('scripts/config-import.ts')
        throw new Error('Invalid JSON should fail')
      }
      catch (error) {
        const failure = error as { stderr?: string }
        expect(String(failure.stderr)).toContain('Configuration import failed')
        expect(String(failure.stderr)).not.toContain('private-invalid-fixture')
      }
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('uses stable cursors and refuses revoked versions', async () => {
    const first = await listWorks(owner, { limit: 1 })
    expect(first.items).toHaveLength(1)
    if (first.nextCursor) {
      const next = await listWorks(owner, { limit: 1, cursor: first.nextCursor })
      expect(next.items[0]?.id).not.toBe(first.items[0]?.id)
    }
    const current = (await listConnections()).find(c => c.id === connection)!
    const q = await quoteRun(owner, request())
    const accepted = await submitRun(owner, { request: q.request, quoteId: q.id, idempotencyKey: randomUUID() })
    await revokeConnectionVersion(owner, connection, current.revisionId)
    expect((await getRun(owner, accepted.id)).billing.settlementStatus).toBe('review')
    await reconcileTextRun(owner, accepted.id, 'release', '撤销测试')
    await expect(submitRun(owner, { request: q.request, quoteId: q.id, idempotencyKey: randomUUID() })).rejects.toMatchObject({ statusCode: 409 })
  })
})
