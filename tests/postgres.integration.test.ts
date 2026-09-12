import type { GenerationJob } from '../server/database/task-queue'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useDatabasePool } from '../server/database/client'
import { incrementRateLimit, pruneRateLimits } from '../server/database/rate-limit'
import { DEAD_LETTER_QUEUE, QUEUE_NAME, sendGenerationJob, withPostgresGenerationLock } from '../server/database/task-queue'
import { closeGenerationQueue, generationQueue, publishOutbox } from '../server/services/generation-queue'
import { handleFailedGeneration, runGenerationJob } from '../server/services/generation-worker'

const provider = vi.hoisted(() => ({ submit: vi.fn(), getTask: vi.fn() }))
const archive = vi.hoisted(() => vi.fn())
const settle = vi.hoisted(() => vi.fn())
vi.mock('../server/services/providers', () => ({ getVideoProvider: () => provider }))
vi.mock('../server/services/assets', () => ({ resolveProviderMediaUrls: (_owner: string, request: unknown) => Promise.resolve(request) }))
vi.mock('../server/services/billing', () => ({ releaseGenerationCredits: vi.fn(), settleGenerationCredits: settle }))
vi.mock('../server/services/output-archive', () => ({ archiveRemoteOutput: archive, OutputArchiveError: class extends Error {} }))

const testUrl = process.env.FORKVDO_TEST_DATABASE_URL
// 本套测试会清空自己的测试表；显式拒绝业务库，默认 harness 不连接数据库。
if (testUrl && !new URL(testUrl).pathname.endsWith('_test'))
  throw new Error('FORKVDO_TEST_DATABASE_URL must reference a dedicated database ending in _test')

describe.skipIf(!testUrl)('postgreSQL queue and limiter integration', () => {
  let pool: Pool
  let boss: Awaited<ReturnType<typeof generationQueue>>
  let ownerId: string
  let quoteId: string
  const request = { provider: 'fixture', mode: 'text', prompt: 'fixture', media: [], resolution: '720P', ratio: '16:9', duration: 5, audio: false, promptExtend: false, watermark: false }

  beforeAll(async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ databaseUrl: testUrl }))
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/db-migrate.ts'], { env: { ...process.env, NUXT_DATABASE_URL: testUrl }, stdio: 'pipe' })
    pool = new Pool({ connectionString: testUrl, max: 6 })
    await pool.query('truncate generations, quotes, users, outbox_events, rate_limit_buckets cascade')
    await pool.query(`insert into pricing_rules (provider, model, formula) values ('fixture', '*', '{"fixedCredits":1}')`)
    boss = await generationQueue()
    await boss.deleteAllJobs()
    ownerId = (await pool.query<{ id: string }>('insert into users (email, display_name, password_hash) values (\'queue@test.local\', \'Fixture\', \'not-a-login\') returning id')).rows[0]!.id
    quoteId = (await pool.query<{ id: string }>(`
      insert into quotes (user_id, request_hash, request, rule_id, price_version, estimated_credits, expires_at)
      select $1, 'fixture', $2, id, 1, 1, now() + interval '1 hour' from pricing_rules limit 1 returning id
    `, [ownerId, request])).rows[0]!.id
  }, 20_000)

  afterEach(async () => {
    await boss.offWork(QUEUE_NAME)
    await boss.offWork(DEAD_LETTER_QUEUE)
    await boss.deleteAllJobs()
    await pool.query('delete from outbox_events')
    await pool.query('delete from generations')
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await closeGenerationQueue()
    await pool?.end()
    await useDatabasePool().end()
    vi.unstubAllGlobals()
  })

  async function generation(status = 'PENDING', dispatch = 'queued', archived = false) {
    const id = randomUUID()
    await pool.query(`
      insert into generations (id, owner_id, request, request_hash, idempotency_key, quote_id, reserved_credits,
        status, dispatch_status, provider_task_id, video_url, video_archived)
      values ($1::uuid, $2, $3, 'fixture', $1::uuid::text, $4, 1, $5, $6, 'upstream-fixture', 'https://fixture.invalid/output.mp4', $7)
    `, [id, ownerId, request, quoteId, status, dispatch, archived])
    return id
  }

  it('counts concurrent requests atomically, resets expiry and prunes expired keys', async () => {
    const key = randomUUID()
    const counts = await Promise.all(Array.from({ length: 30 }, () => incrementRateLimit(pool, key, 60)))
    assert.deepEqual(counts.sort((a, b) => a - b), Array.from({ length: 30 }, (_, i) => i + 1))
    assert.equal(counts.filter(count => count <= 10).length, 10)
    await pool.query('update rate_limit_buckets set expires_at = now() - interval \'1 second\' where key = $1', [key])
    assert.equal(await incrementRateLimit(pool, key, 60), 1)
    await pool.query('update rate_limit_buckets set expires_at = now() - interval \'1 second\' where key = $1', [key])
    await pruneRateLimits(pool)
    assert.equal((await pool.query('select * from rate_limit_buckets where key = $1', [key])).rowCount, 0)
  })

  it('rejects concurrent generation processing and releases locks after failure', async () => {
    const id = randomUUID()
    let release: () => void = () => {}
    let entered: () => void = () => {}
    const active = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = withPostgresGenerationLock(pool, id, async () => {
      entered()
      await gate
    })
    await active
    await assert.rejects(withPostgresGenerationLock(pool, id, async () => {}), /already being processed/)
    release()
    await first
    await assert.rejects(withPostgresGenerationLock(pool, id, async () => {
      throw new Error('fixture')
    }), /fixture/)
    assert.equal(await withPostgresGenerationLock(pool, id, async () => 'released'), 'released')
  })

  it('deduplicates outbox IDs and persists delayed jobs across queue restart', async () => {
    const job = { kind: 'poll' as const, generationId: randomUUID() }
    const options = { jobId: randomUUID(), delay: 1200 }
    await Promise.all([sendGenerationJob(boss, job, options), sendGenerationJob(boss, job, options)])
    assert.equal((await boss.fetch(QUEUE_NAME)).length, 0)
    await closeGenerationQueue()
    boss = await generationQueue()
    await delay(1250)
    const jobs = await boss.fetch<GenerationJob>(QUEUE_NAME)
    assert.equal(jobs.length, 1)
    assert.deepEqual(jobs[0]!.data, job)
    await boss.complete(QUEUE_NAME, jobs[0]!.id)
    assert.equal((await boss.fetch(QUEUE_NAME)).length, 0)
  })

  it('runs only one job per generation while allowing queued successors', async () => {
    const job = { kind: 'poll' as const, generationId: randomUUID() }
    await sendGenerationJob(boss, job)
    await sendGenerationJob(boss, job)
    const first = await boss.fetch(QUEUE_NAME)
    assert.equal(first.length, 1)
    assert.equal((await boss.fetch(QUEUE_NAME)).length, 0)
    await boss.complete(QUEUE_NAME, first[0]!.id)
    const second = await boss.fetch(QUEUE_NAME)
    assert.equal(second.length, 1)
    await boss.complete(QUEUE_NAME, second[0]!.id)
  })

  it('publishes repeated outbox scans safely and submits upstream only once', async () => {
    const id = await generation()
    await pool.query('insert into outbox_events (topic, aggregate_id, payload) values (\'generation.submit\', $1, \'{}\')', [id])
    provider.submit.mockResolvedValue({ taskId: 'accepted', status: 'RUNNING' })
    await Promise.all([publishOutbox(), publishOutbox()])
    const jobs = await boss.fetch<GenerationJob>(QUEUE_NAME)
    assert.equal(jobs.length, 1)
    await runGenerationJob(jobs[0]!.data)
    await runGenerationJob(jobs[0]!.data)
    assert.equal(provider.submit.mock.calls.length, 1)
    assert.equal((await pool.query('select dispatch_status from generations where id = $1', [id])).rows[0].dispatch_status, 'submitted')
    await boss.complete(QUEUE_NAME, jobs[0]!.id)
  })

  it('sends interrupted submissions to review without repeating upstream submission', async () => {
    const id = await generation('PENDING', 'submitting')
    await runGenerationJob({ kind: 'submit', generationId: id })
    const row = (await pool.query('select status, settlement_status from generations where id = $1', [id])).rows[0]
    assert.equal(row.status, 'UNKNOWN')
    assert.equal(row.settlement_status, 'review')
    assert.equal(provider.submit.mock.calls.length, 0)
  })

  it('keeps immediate submit success nonterminal until its output is fetched', async () => {
    const id = await generation()
    provider.submit.mockResolvedValue({ taskId: 'instant', status: 'SUCCEEDED' })
    await runGenerationJob({ kind: 'submit', generationId: id })
    assert.equal((await pool.query('select status from generations where id = $1', [id])).rows[0].status, 'RUNNING')
    provider.getTask.mockResolvedValue({ status: 'SUCCEEDED', videoUrl: 'https://fixture.invalid/instant.mp4' })
    archive.mockResolvedValue({ objectKey: 'fixture/instant.mp4' })
    settle.mockResolvedValue(true)
    await runGenerationJob({ kind: 'poll', generationId: id })
    await runGenerationJob({ kind: 'poll', generationId: id })
    assert.equal(provider.getTask.mock.calls.length, 1)
    assert.equal((await pool.query('select status from generations where id = $1', [id])).rows[0].status, 'SUCCEEDED')
  })

  it('never polls archived success or failure and archives cached success without upstream calls', async () => {
    for (const [status, dispatch] of [['FAILED', 'failed'], ['SUCCEEDED', 'complete']]) {
      const id = await generation(status, dispatch, true)
      await runGenerationJob({ kind: 'poll', generationId: id })
      await handleFailedGeneration({ kind: 'poll', generationId: id })
      assert.equal((await pool.query('select status from generations where id = $1', [id])).rows[0].status, status)
    }
    const id = await generation('SUCCEEDED', 'complete')
    archive.mockResolvedValue({ objectKey: 'fixture/output.mp4' })
    settle.mockResolvedValue(true)
    await runGenerationJob({ kind: 'poll', generationId: id })
    await runGenerationJob({ kind: 'poll', generationId: id })
    assert.equal(provider.getTask.mock.calls.length, 0)
    assert.equal(archive.mock.calls.length, 1)
    assert.equal(settle.mock.calls.length, 1)
    assert.equal(archive.mock.calls[0]![1], 'https://fixture.invalid/output.mp4')
  })

  it('retries failed polls, then processes dead letters into review', async () => {
    const id = await generation('RUNNING', 'submitted')
    provider.getTask.mockRejectedValue(new Error('fixture upstream failure'))
    await boss.work<GenerationJob>(QUEUE_NAME, { pollingIntervalSeconds: 0.5 }, async ([job]) => {
      if (job)
        await runGenerationJob(job.data)
    })
    await boss.work<GenerationJob>(DEAD_LETTER_QUEUE, { pollingIntervalSeconds: 0.5 }, async ([job]) => {
      if (job)
        await handleFailedGeneration(job.data)
    })
    await boss.send(QUEUE_NAME, { kind: 'poll', generationId: id }, { singletonKey: id, retryLimit: 1, retryDelay: 0, retryBackoff: false })
    await vi.waitFor(async () => {
      expect((await pool.query('select settlement_status from generations where id = $1', [id])).rows[0].settlement_status).toBe('review')
    }, { timeout: 7000, interval: 100 })
    assert.equal(provider.getTask.mock.calls.length, 2)
    await runGenerationJob({ kind: 'poll', generationId: id })
    assert.equal(provider.getTask.mock.calls.length, 2)
  }, 10_000)

  it('recovers old queued/polling jobs and flags unknown submissions, with a read-only preview', async () => {
    await generation()
    await generation('RUNNING', 'submitted')
    const unknown = await generation('PENDING', 'submitting')
    const run = (flag: string) => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/recover-generation-queue.ts', flag], { env: { ...process.env, NUXT_DATABASE_URL: testUrl }, encoding: 'utf8' })
    const preview = JSON.parse(run('--dry-run'))
    assert.deepEqual(preview, { mode: 'dry-run', submit: 1, poll: 1, review: 1 })
    assert.equal((await boss.fetch(QUEUE_NAME)).length, 0)
    const result = JSON.parse(run('--apply'))
    assert.equal(result.mode, 'applied')
    assert.equal((await pool.query('select settlement_status from generations where id = $1', [unknown])).rows[0].settlement_status, 'review')
    const jobs = await boss.fetch<GenerationJob>(QUEUE_NAME, { batchSize: 10 })
    assert.equal(jobs.length, 2)
    await boss.complete(QUEUE_NAME, jobs.map(job => job.id))
  })
})
