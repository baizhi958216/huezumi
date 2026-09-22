import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { Pool } from 'pg'

const args = process.argv.slice(2)
const option = (name: string) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const ownerEmail = (option('owner-email') || args.find(value => !value.startsWith('--')))?.trim().toLowerCase()
const dataDir = option('data-dir') || process.env.HUEZUMI_LEGACY_DATA_DIR || '.data'
const databaseUrl = process.env.NUXT_DATABASE_URL
if (!databaseUrl || !ownerEmail)
  throw new Error('Usage: NUXT_DATABASE_URL=... pnpm data:migrate -- --owner-email=owner@example.com [--data-dir=.data]')

const pool = new Pool({ connectionString: databaseUrl })
try {
  const owner = await pool.query<{ id: string }>('select id from users where email = $1', [ownerEmail])
  if (!owner.rows[0])
    throw new Error(`Owner account not found: ${ownerEmail}`)
  const ownerId = owner.rows[0].id
  let generationCount = 0
  let assetCount = 0

  for (const name of await readdir(join(dataDir, 'uploads')).catch(() => [])) {
    const metaPath = join(dataDir, 'uploads', name, 'meta')
    const dataPath = join(dataDir, 'uploads', name, 'data')
    const [metaText, fileStat] = await Promise.all([readFile(metaPath, 'utf8').catch(() => ''), stat(dataPath).catch(() => undefined)])
    if (!metaText || !fileStat)
      continue
    const meta = JSON.parse(metaText) as { id?: string, name?: string, type?: string, size?: number, createdAt?: string }
    await pool.query(`
      insert into assets (id, owner_id, name, content_type, size, local_storage_key, created_at)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (id) do nothing
    `, [meta.id || name, ownerId, meta.name || 'legacy-asset', meta.type || 'application/octet-stream', meta.size || fileStat.size, `uploads:${name}:data`, meta.createdAt || new Date()])
    assetCount++
  }

  for (const name of await readdir(join(dataDir, 'generations')).catch(() => [])) {
    const record = JSON.parse(await readFile(join(dataDir, 'generations', name), 'utf8')) as Record<string, unknown>
    const request = Object.fromEntries(['provider', 'model', 'mode', 'prompt', 'negativePrompt', 'media', 'resolution', 'ratio', 'duration', 'audio', 'promptExtend', 'watermark', 'seed'].map(key => [key, record[key]]).filter(([, value]) => value !== undefined))
    const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex')
    const rule = await pool.query<{ id: string, version: number }>('select id, version from pricing_rules where provider = $1 and active = true order by version desc limit 1', [request.provider])
    if (!rule.rows[0])
      continue
    const quoteId = randomUUID()
    await pool.query(`
      insert into quotes (id, user_id, request_hash, request, rule_id, price_version, estimated_credits, expires_at, created_at)
      values ($1, $2, $3, $4, $5, $6, 0, $7, $8)
      on conflict (id) do nothing
    `, [quoteId, ownerId, hash, JSON.stringify(request), rule.rows[0].id, rule.rows[0].version, new Date(0), record.createdAt || new Date()])
    await pool.query(`
      insert into generations (id, owner_id, request, request_hash, idempotency_key, quote_id, provider_task_id, status, dispatch_status, settlement_status, reserved_credits, charged_credits, video_url, video_archived, output_archive, usage, error_code, error, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,'complete','released',0,0,$9,$10,$11,$12,$13,$14,$15,$16)
      on conflict (id) do nothing
    `, [record.id || name, ownerId, JSON.stringify(request), hash, `legacy:${record.id || name}`, quoteId, record.providerTaskId || null, record.status || 'UNKNOWN', record.videoUrl || null, Boolean(record.videoArchived), JSON.stringify(record.outputArchive || { status: 'not_started' }), record.usage ? JSON.stringify(record.usage) : null, record.errorCode || null, record.error || null, record.createdAt || new Date(), record.updatedAt || new Date()])
    generationCount++
  }
  console.log(`Legacy import complete: ${generationCount} generations, ${assetCount} assets assigned to ${ownerEmail}`)
}
finally {
  await pool.end()
}
