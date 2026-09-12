import { execFile as execFileCallback } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { promisify } from 'node:util'
import OSS from 'ali-oss'
import { Pool } from 'pg'

const execFile = promisify(execFileCallback)
const args = process.argv.slice(2)
const option = (name: string) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const ownerEmail = (option('owner-email') || '').trim().toLowerCase()
const dryRun = args.includes('--dry-run')

interface EnvValues {
  [key: string]: string | undefined
}

interface ProbeStream {
  codec_type?: string
  width?: number
  height?: number
}

interface ProbeResult {
  streams?: ProbeStream[]
  format?: { duration?: string }
}

interface ArchiveObject {
  name: string
  size: number
  lastModified?: string
}

function readFirstEnvValues(text: string): EnvValues {
  const values: EnvValues = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match && !(match[1] in values))
      values[match[1]] = match[2]
  }
  return values
}

async function loadEnvFile() {
  try {
    return readFirstEnvValues(await readFile('.env', 'utf8'))
  }
  catch {
    return {}
  }
}

function configValue(values: EnvValues, name: string) {
  return process.env[`FORKVDO_LEGACY_${name}`] || values[`NUXT_OSS_${name}`] || ''
}

function requiredConfig(values: EnvValues, name: string) {
  const value = configValue(values, name).trim()
  if (!value)
    throw new Error(`缺少旧 OSS 配置：FORKVDO_LEGACY_${name} 或 NUXT_OSS_${name}`)
  return value
}

function parseArgs() {
  const databaseUrl = process.env.NUXT_DATABASE_URL
  if (!databaseUrl || !ownerEmail) {
    throw new Error('Usage: NUXT_DATABASE_URL=... pnpm data:restore-oss -- --owner-email=owner@example.com [--dry-run]')
  }
  return databaseUrl
}

function normalizeRegion(value: string) {
  return value.startsWith('oss-') ? value : `oss-${value}`
}

function objectUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${key.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
}

function ratioFor(width: number, height: number) {
  const ratio = width / height
  const candidates: Array<[number, string]> = [
    [9 / 16, '9:16'],
    [3 / 4, '3:4'],
    [1, '1:1'],
    [4 / 3, '4:3'],
    [16 / 9, '16:9'],
    [21 / 9, '21:9'],
  ]
  const closest = candidates.reduce((best, candidate) => Math.abs(candidate[0] - ratio) < Math.abs(best[0] - ratio) ? candidate : best)
  return Math.abs(closest[0] - ratio) < 0.03 ? closest[1] : 'adaptive'
}

function resolutionFor(width: number, height: number): '480P' | '768P' | '720P' | '1080P' | '2K' | '4K' {
  const shortSide = Math.min(width, height)
  if (shortSide >= 3840)
    return '4K'
  if (shortSide >= 2048)
    return '2K'
  if (shortSide >= 1080)
    return '1080P'
  if (shortSide >= 768)
    return '768P'
  if (shortSide >= 720)
    return '720P'
  return '480P'
}

async function probeVideo(url: string): Promise<ProbeResult | undefined> {
  try {
    const { stdout } = await execFile('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,width,height',
      '-of',
      'json',
      url,
    ], { maxBuffer: 100_000, timeout: 60_000 })
    const parsed = JSON.parse(stdout) as ProbeResult
    return parsed
  }
  catch {
    return undefined
  }
}

function requestFor(object: ArchiveObject, probe?: ProbeResult) {
  const video = probe?.streams?.find(stream => stream.codec_type === 'video')
  const audio = Boolean(probe?.streams?.some(stream => stream.codec_type === 'audio'))
  const width = Number(video?.width || 0)
  const height = Number(video?.height || 0)
  const actualDuration = Number(probe?.format?.duration || 0)
  const ratio = width > 0 && height > 0 ? ratioFor(width, height) : 'adaptive'
  const duration = actualDuration > 0 ? Math.max(2, Math.round(actualDuration)) : -1

  return {
    provider: 'legacy-oss',
    model: '历史阿里云归档',
    mode: 'text' as const,
    prompt: '历史阿里云归档视频（原始提示词未恢复）',
    media: [],
    resolution: width > 0 && height > 0 ? resolutionFor(width, height) : '1080P' as const,
    ratio: ratio as 'adaptive' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9',
    duration,
    audio,
    promptExtend: false,
    watermark: false,
    ...(actualDuration > 0 || ratio !== 'adaptive'
      ? { usage: { ...(actualDuration > 0 ? { duration: actualDuration, outputVideoDuration: actualDuration } : {}), ratio } }
      : {}),
  }
}

async function main() {
  const databaseUrl = parseArgs()
  const envValues = await loadEnvFile()
  const accessKeyId = requiredConfig(envValues, 'ACCESS_KEY_ID')
  const accessKeySecret = requiredConfig(envValues, 'ACCESS_KEY_SECRET')
  const bucket = requiredConfig(envValues, 'BUCKET')
  const regionValue = requiredConfig(envValues, 'REGION')
  const endpoint = configValue(envValues, 'ENDPOINT').trim()
  const configuredPublicBaseUrl = configValue(envValues, 'PUBLIC_BASE_URL').trim()
  const prefix = (configValue(envValues, 'OUTPUT_PREFIX') || 'forkvdo/outputs').replace(/^\/+|\/+$/g, '')
  const publicBaseUrl = configuredPublicBaseUrl || `https://${bucket}.${endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`

  const client = new OSS({
    region: normalizeRegion(regionValue),
    accessKeyId,
    accessKeySecret,
    bucket,
    ...(endpoint ? { endpoint } : {}),
    secure: true,
    authorizationV4: true,
  })
  const result = await client.list({ 'prefix': `${prefix}/`, 'max-keys': 1000 })
  const objects: ArchiveObject[] = (result.objects || [])
    .map(item => ({ name: item.name, size: Number(item.size || 0), lastModified: item.lastModified }))
    .filter(item => /^[0-9a-f-]{36}\.mp4$/i.test(item.name.slice(`${prefix}/`.length)))
    .sort((a, b) => (a.lastModified || '').localeCompare(b.lastModified || ''))

  if (!objects.length) {
    console.log(`没有找到 ${prefix}/ 下可恢复的 MP4`)
    return
  }

  const pool = new Pool({ connectionString: databaseUrl })
  const db = await pool.connect()
  try {
    const owner = await db.query<{ id: string }>('select id from users where email = $1', [ownerEmail])
    if (!owner.rows[0])
      throw new Error(`Owner account not found: ${ownerEmail}`)

    const ownerId = owner.rows[0].id
    const priceRuleId = '00000000-0000-4000-8000-000000000099'
    await db.query('begin')
    await db.query(`
      insert into pricing_rules (id, provider, model, resolution, formula, source_label, version, active)
      values ($1, 'legacy-oss', '*', '*', $2, '历史阿里云归档导入（不可用于新生成）', 1, false)
      on conflict (id) do nothing
    `, [priceRuleId, JSON.stringify({ fixedCredits: 0 })])

    const rows: Array<{ id: string, size: number, createdAt: string, width?: number, height?: number, duration?: number, audio: boolean, action: 'insert' | 'skip' }> = []
    for (const object of objects) {
      const id = object.name.slice(`${prefix}/`.length, -'.mp4'.length)
      const url = objectUrl(publicBaseUrl, object.name)
      const probe = await probeVideo(url)
      const request = requestFor(object, probe)
      const video = probe?.streams?.find(stream => stream.codec_type === 'video')
      const actualDuration = Number(probe?.format?.duration || 0)
      const createdAt = object.lastModified && !Number.isNaN(Date.parse(object.lastModified)) ? new Date(object.lastModified) : new Date()
      const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex')
      const existing = await db.query('select id from generations where id = $1', [id])
      if (existing.rows[0]) {
        rows.push({ id, size: object.size, createdAt: createdAt.toISOString(), width: video?.width, height: video?.height, duration: actualDuration || undefined, audio: request.audio, action: 'skip' })
        continue
      }

      rows.push({ id, size: object.size, createdAt: createdAt.toISOString(), width: video?.width, height: video?.height, duration: actualDuration || undefined, audio: request.audio, action: 'insert' })
      if (dryRun)
        continue

      const quoteId = randomUUID()
      await db.query(`
        insert into quotes (id, user_id, request_hash, request, rule_id, price_version, estimated_credits, expires_at, created_at)
        values ($1, $2, $3, $4, $5, 1, 0, $6, $7)
      `, [quoteId, ownerId, requestHash, JSON.stringify(request), priceRuleId, new Date(0), createdAt])
      await db.query(`
        insert into generations (id, schema_version, owner_id, request, request_hash, idempotency_key, quote_id, provider_task_id, status, dispatch_status, settlement_status, reserved_credits, charged_credits, video_url, video_archived, output_archive, usage, created_at, updated_at)
        values ($1, 1, $2, $3, $4, $5, $6, $7, 'SUCCEEDED', 'complete', 'released', 0, 0, $8, true, $9, $10, $11, $11)
      `, [
        id,
        ownerId,
        JSON.stringify(request),
        requestHash,
        `legacy:oss:${id}`,
        quoteId,
        `legacy-oss:${id}`,
        url,
        JSON.stringify({ status: 'archived', attemptedAt: createdAt.toISOString(), completedAt: createdAt.toISOString(), objectKey: object.name }),
        request.usage ? JSON.stringify(request.usage) : null,
        createdAt,
      ])
    }

    if (dryRun)
      await db.query('rollback')
    else
      await db.query('commit')

    const inserted = rows.filter(row => row.action === 'insert').length
    console.log(JSON.stringify({ dryRun, ownerEmail, bucket, prefix, found: rows.length, inserted, skipped: rows.length - inserted, rows }, null, 2))
  }
  catch (error) {
    await db.query('rollback').catch(() => {})
    throw error
  }
  finally {
    db.release()
    await pool.end()
  }
}

await main()
