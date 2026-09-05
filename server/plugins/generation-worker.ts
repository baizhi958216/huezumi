import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { useDatabase } from '../database/client'
import { generations } from '../database/schema'
import { publishOutbox, QUEUE_NAME, redisConnection } from '../services/generation-queue'
import { runGenerationJob } from '../services/generation-worker'

export default defineNitroPlugin((nitro) => {
  const config = useRuntimeConfig()
  if (!config.workerEnabled || !config.redisUrl)
    return
  const worker = new Worker(QUEUE_NAME, async job => runGenerationJob(job.data), {
    connection: redisConnection(),
    concurrency: Number(config.workerConcurrency || 4),
  })
  const publishTimer = setInterval(() => publishOutbox().catch(error => console.error('Outbox publish failed', error)), 3000)
  publishTimer.unref?.()
  publishOutbox().catch(error => console.error('Initial outbox publish failed', error))
  worker.on('failed', async (job, error) => {
    console.error(`Generation job failed (${job?.id || 'unknown'})`, error)
    if (job && job.attemptsMade >= Number(job.opts.attempts || 1) && job.data.kind === 'poll') {
      await useDatabase().update(generations).set({
        status: 'UNKNOWN',
        dispatchStatus: 'reconciling',
        settlementStatus: 'review',
        error: '多次查询供应商失败，任务已转入人工核对。',
        updatedAt: new Date(),
      }).where(eq(generations.id, job.data.generationId))
    }
  })
  nitro.hooks.hook('close', async () => {
    clearInterval(publishTimer)
    await worker.close()
  })
})
