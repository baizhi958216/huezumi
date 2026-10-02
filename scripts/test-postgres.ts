import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import process from 'node:process'
import { Pool } from 'pg'

async function main() {
  const databaseUrl = process.env.NUXT_DATABASE_URL
  if (!databaseUrl)
    throw new Error('NUXT_DATABASE_URL is required; the account must be able to create test databases')
  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 })
  const name = `huezumi_test_${randomBytes(8).toString('hex')}`
  const testUrl = new URL(databaseUrl)
  testUrl.pathname = `/${name}`
  const env = { ...process.env, NUXT_DATABASE_URL: testUrl.toString(), HUEZUMI_TEST_DATABASE_URL: testUrl.toString(), HUEZUMI_IMAGE_DB_TEST: '1' }
  let created = false
  try {
    await admin.query(`create database "${name}"`)
    created = true
    for (const args of [['db:init'], ['exec', 'vitest', 'run', 'tests/database.integration.test.ts', 'tests/image-worker.integration.test.ts', 'tests/admin.integration.test.ts', 'tests/workflow-worker.integration.test.ts']]) {
      const result = spawnSync('pnpm', args, { env, stdio: 'inherit' })
      if (result.error)
        throw result.error
      if (result.status !== 0) {
        process.exitCode = result.status ?? 1
        return
      }
    }
  }
  finally {
    try {
      if (created)
        await admin.query(`drop database "${name}" with (force)`)
    }
    finally {
      await admin.end()
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'PostgreSQL integration checks failed')
  process.exitCode = 1
})
