import { createHash } from 'node:crypto'
import { useDatabasePool } from '../database/client'
import { incrementRateLimit, pruneRateLimits } from '../database/rate-limit'

let nextCleanupAt = 0

export async function enforceRateLimit(event: Parameters<typeof getRequestIP>[0], bucket: string, limit: number, windowSeconds: number) {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const key = createHash('sha256').update(`${bucket}:${ip}`).digest('hex')
  let count: number
  try {
    const pool = useDatabasePool()
    count = await incrementRateLimit(pool, key, windowSeconds)
    if (Date.now() >= nextCleanupAt) {
      nextCleanupAt = Date.now() + 60_000
      void pruneRateLimits(pool).catch(() => console.error('Rate limit cleanup failed'))
    }
  }
  catch {
    throw createError({ statusCode: 503, statusMessage: '限流服务暂不可用，请稍后重试' })
  }
  if (count > limit)
    throw createError({ statusCode: 429, statusMessage: '请求过于频繁，请稍后再试' })
}
