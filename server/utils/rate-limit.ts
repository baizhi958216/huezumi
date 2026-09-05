import IORedis from 'ioredis'

interface Counter { count: number, expiresAt: number }
const localCounters = new Map<string, Counter>()

export async function enforceRateLimit(event: Parameters<typeof getRequestIP>[0], bucket: string, limit: number, windowSeconds: number) {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const key = `forkvdo:rate:${bucket}:${ip}`
  const redisUrl = String(useRuntimeConfig().redisUrl || '').trim()
  let count: number
  if (redisUrl) {
    const runtime = globalThis as typeof globalThis & { __forkvdoRateRedis?: IORedis }
    runtime.__forkvdoRateRedis ||= new IORedis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
    count = await runtime.__forkvdoRateRedis.incr(key)
    if (count === 1)
      await runtime.__forkvdoRateRedis.expire(key, windowSeconds)
  }
  else {
    const now = Date.now()
    const current = localCounters.get(key)
    const next = !current || current.expiresAt <= now ? { count: 1, expiresAt: now + windowSeconds * 1000 } : { ...current, count: current.count + 1 }
    localCounters.set(key, next)
    count = next.count
  }
  if (count > limit)
    throw createError({ statusCode: 429, statusMessage: '请求过于频繁，请稍后再试' })
}
