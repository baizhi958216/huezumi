import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { Pool } from 'pg'
import { openTaskQueue, sendGenerationJob, withPostgresGenerationLock } from '../server/database/task-queue'

const databaseUrl = process.env.NUXT_DATABASE_URL
if (!databaseUrl)
  throw new Error('NUXT_DATABASE_URL is required')
const args = process.argv.slice(2)
if (args.some(arg => !['--apply', '--dry-run'].includes(arg)) || (args.includes('--apply') && args.includes('--dry-run')))
  throw new Error('Usage: recover-generation-queue.ts [--dry-run | --apply] (stop all workers before --apply)')
const apply = args.includes('--apply')
const pool = new Pool({ connectionString: databaseUrl, max: 3 })
const boss = apply ? await openTaskQueue(databaseUrl) : undefined
const runId = randomUUID()
const counts = { submit: 0, poll: 0, review: 0 }
let cursor = '00000000-0000-0000-0000-000000000000'
try {
  while (true) {
    const { rows } = await pool.query<{ id: string, action: 'submit' | 'poll' | 'review' }>(`
      select id, case
        when dispatch_status = 'queued' then 'submit'
        when dispatch_status = 'submitting' then 'review'
        else 'poll' end as action
      from generations
      where id > $1 and settlement_status != 'review' and (
        (status in ('PENDING', 'RUNNING') and dispatch_status in ('queued', 'submitting', 'submitted'))
        or (status = 'SUCCEEDED' and video_archived = false and video_url is not null)
      ) order by id limit 100
    `, [cursor])
    if (!rows.length)
      break
    for (const row of rows) {
      counts[row.action]++
      if (!boss)
        continue
      await withPostgresGenerationLock(pool, row.id, async () => {
        if (row.action === 'review') {
          await pool.query(`
            update generations set status = 'UNKNOWN', dispatch_status = 'reconciling', settlement_status = 'review',
              error = '旧队列提交结果未确认，请人工核对。', updated_at = now()
            where id = $1 and dispatch_status = 'submitting'
          `, [row.id])
        }
        else {
          await sendGenerationJob(boss, { kind: row.action, generationId: row.id }, { jobId: `recovery:${runId}:${row.id}` })
        }
      })
    }
    cursor = rows.at(-1)!.id
  }
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', ...counts }))
}
finally {
  await boss?.stop()
  await pool.end()
}
