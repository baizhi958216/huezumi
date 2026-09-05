import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { Queue } from 'bullmq'
import { and, asc, eq, isNull, lte } from 'drizzle-orm'
import IORedis from 'ioredis'
import { useDatabase } from '../database/client'
import { outboxEvents } from '../database/schema'

export interface GenerationJob { kind: 'submit' | 'poll', generationId: string }
const QUEUE_NAME = 'forkvdo-generations'

interface QueueRuntime {
  redis?: IORedis
  queue?: Queue<GenerationJob>
}

const runtime = globalThis as typeof globalThis & { __forkvdoQueue?: QueueRuntime }
const inlineLocks = new Set<string>()

function queueMode() {
  const configured = String(useRuntimeConfig().queueMode || '').trim()
  return configured || (process.env.NODE_ENV === 'production' ? 'redis' : 'inline')
}

export function redisConnection() {
  const redisUrl = String(useRuntimeConfig().redisUrl || '').trim()
  if (!redisUrl)
    throw createError({ statusCode: 503, statusMessage: 'Redis 队列尚未配置' })
  runtime.__forkvdoQueue ||= {}
  runtime.__forkvdoQueue.redis ||= new IORedis(redisUrl, { maxRetriesPerRequest: null })
  return runtime.__forkvdoQueue.redis
}

export function generationQueue() {
  runtime.__forkvdoQueue ||= {}
  runtime.__forkvdoQueue.queue ||= new Queue<GenerationJob>(QUEUE_NAME, { connection: redisConnection() })
  return runtime.__forkvdoQueue.queue
}

export async function enqueueGeneration(job: GenerationJob, options: { delay?: number, jobId?: string } = {}) {
  if (queueMode() === 'inline') {
    const timer = setTimeout(async () => {
      const { runGenerationJob } = await import('./generation-worker')
      await runGenerationJob(job).catch(error => console.error('Inline generation worker failed', error))
    }, options.delay ?? 0)
    timer.unref?.()
    return
  }
  await generationQueue().add(job.kind, job, {
    jobId: options.jobId,
    delay: options.delay,
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  })
}

export async function publishOutbox() {
  const db = useDatabase()
  const pending = await db.select().from(outboxEvents).where(and(
    isNull(outboxEvents.publishedAt),
    lte(outboxEvents.availableAt, new Date()),
  )).orderBy(asc(outboxEvents.createdAt)).limit(50)
  for (const event of pending) {
    if (event.topic !== 'generation.submit')
      continue
    await enqueueGeneration({ kind: 'submit', generationId: event.aggregateId }, { jobId: event.id })
    await db.update(outboxEvents).set({ publishedAt: new Date() }).where(and(eq(outboxEvents.id, event.id), isNull(outboxEvents.publishedAt)))
  }
}

export async function withGenerationLock<T>(generationId: string, task: () => Promise<T>): Promise<T | undefined> {
  const key = `forkvdo:generation-lock:${generationId}`
  if (queueMode() === 'inline') {
    if (inlineLocks.has(key))
      return undefined
    inlineLocks.add(key)
    try {
      return await task()
    }
    finally {
      inlineLocks.delete(key)
    }
  }

  const redis = redisConnection()
  const token = randomUUID()
  const acquired = await redis.set(key, token, 'PX', 10 * 60 * 1000, 'NX')
  if (acquired !== 'OK')
    return undefined
  try {
    return await task()
  }
  finally {
    await redis.eval('if redis.call(\'get\', KEYS[1]) == ARGV[1] then return redis.call(\'del\', KEYS[1]) else return 0 end', 1, key, token)
  }
}

export { QUEUE_NAME }
