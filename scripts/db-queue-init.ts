import process from 'node:process'
import { openTaskQueue } from '../server/database/task-queue'

const databaseUrl = process.env.NUXT_DATABASE_URL
if (!databaseUrl)
  throw new Error('NUXT_DATABASE_URL is required')
const queue = await openTaskQueue(databaseUrl, { migrate: true })
await queue.stop()
console.log('PostgreSQL task queue initialized')
