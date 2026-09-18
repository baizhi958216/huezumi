import type { GenerationJob } from '../database/task-queue'
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { databaseUrl, useDatabase } from '../database/client'
import { outboxEvents } from '../database/schema'
import { openTaskQueue, sendGenerationJob, withPostgresGenerationLock } from '../database/task-queue'

export type { GenerationJob } from '../database/task-queue'
interface QueueRuntime {
  queue?: ReturnType<typeof openTaskQueue>
  locks?: Pool
}
const runtime = globalThis as typeof globalThis & {
  __forkvdoPostgresQueue?: QueueRuntime
}
export function generationQueue() {
  const state = runtime.__forkvdoPostgresQueue ||= {}
  state.queue ||= openTaskQueue(databaseUrl()).catch((error) => {
    state.queue = undefined
    throw error
  })
  return state.queue
}
export async function enqueueGeneration(job: GenerationJob, options: {
  delay?: number
  jobId?: string
} = {}) {
  await sendGenerationJob(await generationQueue(), job, options)
}
export async function publishOutbox() {
  const db = useDatabase()
  const pending = await db.select().from(outboxEvents).where(and(isNull(outboxEvents.publishedAt), lte(outboxEvents.availableAt, sql`now()`))).orderBy(asc(outboxEvents.createdAt)).limit(50)
  for (const event of pending) {
    if (!['generation.submit', 'run.text', 'run.workflow'].includes(event.topic))
      continue
    await enqueueGeneration({ kind: event.topic === 'run.text' ? 'text' : event.topic === 'run.workflow' ? 'workflow' : 'submit', generationId: event.aggregateId }, { jobId: event.id })
    await db.update(outboxEvents).set({ publishedAt: new Date() }).where(and(eq(outboxEvents.id, event.id), isNull(outboxEvents.publishedAt)))
  }
}
export async function withGenerationLock<T>(generationId: string, task: () => Promise<T>): Promise<T> {
  const state = runtime.__forkvdoPostgresQueue ||= {}
  // 锁连接与业务查询分池，避免所有连接持锁后无法执行任务内的查询。
  const concurrency = Math.max(1, Math.min(32, Math.floor(Number(useRuntimeConfig().workerConcurrency) || 4)))
  state.locks ||= new Pool({ connectionString: databaseUrl(), max: concurrency + 1, connectionTimeoutMillis: 5000 })
  return await withPostgresGenerationLock(state.locks, generationId, task)
}
export async function closeGenerationQueue() {
  const state = runtime.__forkvdoPostgresQueue
  if (!state)
    return
  try {
    if (state.queue)
      await (await state.queue).stop({ graceful: true, timeout: 30000 })
  }
  finally {
    await state.locks?.end()
    if (runtime.__forkvdoPostgresQueue === state)
      runtime.__forkvdoPostgresQueue = undefined
  }
}
