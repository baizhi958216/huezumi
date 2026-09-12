import type { Pool } from 'pg'
import type { PgBoss as TaskQueue } from 'pg-boss'
import { createHash } from 'node:crypto'
import { PgBoss } from 'pg-boss'

export interface GenerationJob { kind: 'submit' | 'poll', generationId: string }
export const QUEUE_NAME = 'forkvdo-generations'
export const DEAD_LETTER_QUEUE = 'forkvdo-generation-failures'

export async function openTaskQueue(connectionString: string, options: { migrate?: boolean, schema?: string } = {}) {
  const boss = new PgBoss({
    connectionString,
    schema: options.schema || 'pgboss',
    migrate: options.migrate ?? false,
    createSchema: options.migrate ?? false,
    schedule: false,
    supervise: !options.migrate,
  })
  boss.on('error', error => console.error('PostgreSQL task queue error', error.name))
  try {
    await boss.start()
    if (options.migrate) {
      await boss.createQueue(DEAD_LETTER_QUEUE, { retryLimit: 10, retryDelay: 30, retryBackoff: true })
      await boss.createQueue(QUEUE_NAME, {
        policy: 'singleton',
        retryLimit: 4,
        retryDelay: 3,
        retryBackoff: true,
        heartbeatSeconds: 60,
        expireInSeconds: 900,
        deleteAfterSeconds: 7 * 86400,
        deadLetter: DEAD_LETTER_QUEUE,
      })
    }
    return boss
  }
  catch (error) {
    await boss.stop({ graceful: false })
    throw error
  }
}

/** pg-boss 的 id 必须是 UUID；稳定摘要让 outbox 重投复用同一任务。 */
export function taskId(value: string) {
  const hex = createHash('sha256').update(value).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export async function sendGenerationJob(boss: TaskQueue, job: GenerationJob, options: { delay?: number, jobId?: string } = {}) {
  return await boss.send(QUEUE_NAME, job, {
    ...(options.jobId ? { id: taskId(options.jobId) } : {}),
    singletonKey: job.generationId,
    startAfter: new Date(Date.now() + (options.delay ?? 0)),
  })
}

export async function withPostgresGenerationLock<T>(pool: Pool, generationId: string, task: () => Promise<T>): Promise<T> {
  const client = await pool.connect()
  let acquired = false
  let broken = false
  const onError = () => {
    broken = true
  }
  client.on('error', onError)
  try {
    const { rows } = await client.query<{ acquired: boolean }>(
      'select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired',
      [`forkvdo:generation:${generationId}`],
    )
    acquired = rows[0]?.acquired === true
    if (!acquired)
      throw new Error('Generation is already being processed; retry later')
    return await task()
  }
  finally {
    try {
      if (acquired && !broken)
        await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [`forkvdo:generation:${generationId}`])
    }
    catch {
      // 销毁连接可释放会话锁，不能把未知锁状态的连接放回池中。
      broken = true
    }
    client.off('error', onError)
    client.release(broken)
  }
}
