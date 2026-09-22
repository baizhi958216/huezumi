import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEAD_LETTER_QUEUE, openTaskQueue, QUEUE_NAME } from '../server/database/task-queue'

const databaseUrl = process.env.HUEZUMI_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)('fresh database initialization', () => {
  let pool: Pool
  beforeAll(() => {
    if (!/^\/huezumi_test_[0-9a-f]+$/.test(new URL(databaseUrl!).pathname))
      throw new Error('Use pnpm test:postgres to create an isolated database')
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 })
  })
  afterAll(async () => {
    await pool?.end()
  })

  it('creates the current business schema and queue, and preserves data on repeat initialization', async () => {
    const { rows: tables } = await pool.query('select tablename from pg_tables where schemaname = \'public\'')
    expect(tables.map(row => row.tablename)).toEqual(expect.arrayContaining(['users', 'wallets', 'ledger_entries', 'runs', 'works', 'connection_versions', 'creative_document_versions', 'invitation_codes']))
    const userId = randomUUID()
    await pool.query('insert into users (id,email,display_name,password_hash) values ($1,$2,\'Fixture\',\'not-a-real-password\')', [userId, `${userId}@example.test`])
    await pool.query('insert into wallets (user_id,balance_credits,reserved_credits) values ($1,100,6)', [userId])
    await pool.query('insert into ledger_entries (user_id,type,amount_credits,idempotency_key) values ($1,\'reserve\',-6,$2)', [userId, `fixture:${userId}`])
    await pool.query('insert into invitation_codes (code_hash,code,note) values ($1,\'fixture-code\',\'fixture-note\')', [userId])
    const queue = await openTaskQueue(databaseUrl!)
    let jobId: string | null
    try {
      expect(await queue.getQueue(DEAD_LETTER_QUEUE)).toBeTruthy()
      jobId = await queue.send(QUEUE_NAME, { kind: 'image', generationId: randomUUID() })
      expect(jobId).toBeTruthy()
    }
    finally {
      await queue.stop()
    }

    const result = spawnSync('pnpm', ['db:init'], {
      env: { ...process.env, NUXT_DATABASE_URL: databaseUrl! },
      encoding: 'utf8',
      timeout: 60000,
    })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect((await pool.query('select balance_credits,reserved_credits from wallets where user_id=$1', [userId])).rows).toEqual([{ balance_credits: 100, reserved_credits: 6 }])
    expect((await pool.query('select * from ledger_entries where user_id=$1', [userId])).rowCount).toBe(1)
    expect((await pool.query('select code,note from invitation_codes where code_hash=$1', [userId])).rows).toEqual([{ code: 'fixture-code', note: 'fixture-note' }])
    const resumed = await openTaskQueue(databaseUrl!)
    try {
      const jobs = await resumed.fetch(QUEUE_NAME)
      expect(jobs.map(job => job.id)).toContain(jobId!)
      await resumed.complete(QUEUE_NAME, jobId!)
    }
    finally {
      await resumed.stop()
    }
  }, 90000)
})
