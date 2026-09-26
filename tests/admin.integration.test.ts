import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ db: undefined as any, query: {} as Record<string, unknown>, requireAdmin: vi.fn(async () => ({ id: 'fixture' })) }))
vi.mock('../server/database/client', () => ({ useDatabase: () => state.db }))
vi.mock('../server/utils/auth', () => ({ requireAdmin: state.requireAdmin }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', () => state.query)
const { default: listTasks } = await import('../server/api/admin/tasks.get')
const { patchSettings, readSettings } = await import('../server/services/platform/connections')
const databaseUrl = process.env.HUEZUMI_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)('admin console with isolated PostgreSQL tables', () => {
  const namespace = `admin_test_${randomUUID().replaceAll('-', '')}`
  let admin: Pool
  let pool: Pool
  const owner = randomUUID()
  const video = randomUUID()
  const image = randomUUID()
  beforeAll(async () => {
    if (!/^\/huezumi_test_[0-9a-f]+$/.test(new URL(databaseUrl!).pathname))
      throw new Error('Use pnpm test:postgres to create an isolated database')
    admin = new Pool({ connectionString: databaseUrl })
    await admin.query(`create schema ${namespace}`)
    for (const table of ['users', 'runs', 'generations', 'platform_settings', 'audit_logs'])
      await admin.query(`create table ${namespace}.${table} (like public.${table} including all)`)
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${namespace},public` })
    state.db = drizzle(pool)
    await pool.query('insert into users (id,email,display_name,password_hash) values ($1,\'fixture@example.test\',\'Fixture\',\'unused\')', [owner])
    await pool.query('insert into generations (id,owner_id,request,request_hash,idempotency_key,quote_id,reserved_credits,settlement_status) values ($1::uuid,$2,$3,$1::text,$1::text,$4,7,\'review\')', [video, owner, { prompt: 'Video needle' }, randomUUID()])
    for (const [id, kind, settlement] of [[randomUUID(), 'video', 'review'], [image, 'image', 'review'], [randomUUID(), 'text', 'settled'], [randomUUID(), 'workflow', 'exempt']])
      await pool.query('insert into runs (id,owner_id,kind,request,idempotency_key,request_hash,settlement_status) values ($1::uuid,$2,$3,$4,$1::text,$1::text,$5)', [id, owner, kind, { input: { prompt: 'Image needle' } }, settlement])
  })
  afterAll(async () => {
    await pool?.end()
    if (admin) {
      await admin.query(`drop schema if exists ${namespace} cascade`)
      await admin.end()
    }
  })
  it('combines all task kinds without counting video mirror records twice', async () => {
    state.query = { scope: 'all' }
    const result = await listTasks({} as any)
    expect(result.items).toHaveLength(4)
    expect(result.items.map(task => task.kind).sort()).toEqual(['image', 'text', 'video', 'workflow'])
  })
  it('filters review tasks, kind and search before pagination', async () => {
    state.query = {}
    expect((await listTasks({} as any)).items.map(task => task.id).sort()).toEqual([image, video].sort())
    state.query = { scope: 'all', kind: 'image', q: 'needle' }
    expect((await listTasks({} as any)).items.map(task => task.id)).toEqual([image])
    state.query = { scope: 'all', page: 2 }
    expect((await listTasks({} as any)).items).toEqual([])
  })
  it('preserves concurrent updates to different settings and allows assignment removal', async () => {
    await Promise.all([patchSettings(owner, { signupCredits: 48 }), patchSettings(owner, { registrationMode: 'disabled' })])
    expect(await readSettings()).toMatchObject({ signupCredits: 48, registrationMode: 'disabled' })
    await pool.query('update platform_settings set value = value || $1::jsonb', [JSON.stringify({ defaultTextConnectionId: randomUUID() })])
    await patchSettings(owner, { platformDailyCreditBudget: 700 })
    expect((await readSettings()).defaultTextConnectionId).toBeTruthy()
    await patchSettings(owner, { defaultTextConnectionId: null })
    expect(await readSettings()).toMatchObject({ signupCredits: 48, registrationMode: 'disabled', platformDailyCreditBudget: 700 })
    expect((await readSettings()).defaultTextConnectionId).toBeUndefined()
  })
  it('requires admin authorization before reading tasks', async () => {
    state.requireAdmin.mockRejectedValueOnce(new Error('forbidden'))
    await expect(listTasks({} as any)).rejects.toThrow('forbidden')
  })
})
