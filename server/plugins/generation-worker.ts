import type { GenerationJob } from '../database/task-queue'
import { DEAD_LETTER_QUEUE, QUEUE_NAME } from '../database/task-queue'
import { closeGenerationQueue, generationQueue, publishOutbox } from '../services/generation-queue'
import { handleFailedGeneration, runGenerationJob } from '../services/generation-worker'

export default defineNitroPlugin(async (nitro) => {
  let publishTimer: ReturnType<typeof setInterval> | undefined
  let publishing: Promise<void> | undefined
  nitro.hooks.hook('close', async () => {
    clearInterval(publishTimer)
    await publishing
    await closeGenerationQueue()
  })
  const config = useRuntimeConfig()
  if (!config.workerEnabled)
    return
  const boss = await generationQueue()
  const concurrency = Math.max(1, Math.min(32, Math.floor(Number(config.workerConcurrency) || 4)))
  await boss.work<GenerationJob>(QUEUE_NAME, { localConcurrency: concurrency, pollingIntervalSeconds: 1 }, async ([job]) => {
    if (job)
      await runGenerationJob(job.data)
  })
  await boss.work<GenerationJob>(DEAD_LETTER_QUEUE, { pollingIntervalSeconds: 1 }, async ([job]) => {
    if (!job)
      return
    await handleFailedGeneration(job.data)
  })
  const publish = () => {
    publishing ||= publishOutbox()
      .catch(error => console.error('Outbox publish failed', error instanceof Error ? error.name : 'unknown'))
      .finally(() => { publishing = undefined })
  }
  publishTimer = setInterval(publish, 3000)
  publishTimer.unref()
  publish()
})
