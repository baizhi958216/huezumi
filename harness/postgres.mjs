import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import process from 'node:process'
import { Pool } from 'pg'

async function main() {
  if (!process.env.NUXT_DATABASE_URL)
    throw new Error('NUXT_DATABASE_URL is required for PostgreSQL integration checks')
  const admin = new Pool({ connectionString: process.env.NUXT_DATABASE_URL, max: 1 })
  const name = `forkvdo_queue_${randomBytes(6).toString('hex')}_test`
  const testUrl = new URL(process.env.NUXT_DATABASE_URL)
  testUrl.pathname = `/${name}`
  let created = false
  try {
    await admin.query(`create database "${name}"`)
    created = true
    const result = spawnSync('pnpm', ['exec', 'vitest', 'run', 'tests/postgres.integration.test.ts'], {
      env: { ...process.env, FORKVDO_TEST_DATABASE_URL: testUrl.toString() },
      stdio: 'inherit',
    })
    if (result.error)
      throw result.error
    process.exitCode = result.status ?? 1
  }
  finally {
    if (created)
      await admin.query(`drop database "${name}" with (force)`)
    await admin.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
