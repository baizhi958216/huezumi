import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { parseEnv } from 'node:util'

const env = { ...parseEnv(await readFile('.env', 'utf8').catch(() => '')), ...process.env }
const required = ['NUXT_DATABASE_URL', 'NUXT_CONNECTION_ENCRYPTION_KEY']
let failed = false
for (const key of required) {
  const present = Boolean(env[key])
  console.log(`${key}: ${present ? 'configured' : 'missing'}`)
  failed ||= !present
}
if (env.NUXT_CONNECTION_ENCRYPTION_KEY && Buffer.from(env.NUXT_CONNECTION_ENCRYPTION_KEY, 'base64').length !== 32) {
  console.log('Encryption key: invalid length')
  failed = true
}
if (process.argv.includes('--production')) {
  for (const key of ['NUXT_OSS_ACCESS_KEY_ID', 'NUXT_OSS_ACCESS_KEY_SECRET', 'NUXT_OSS_BUCKET', 'NUXT_COMFYUI_REMOTE_BASE_URL']) {
    if (!env[key]) {
      console.log(`${key}: missing`)
      failed = true
    }
  }
  if (env.NUXT_COMFYUI_MODE !== 'remote') {
    console.log('ComfyUI mode: production requires remote')
    failed = true
  }
}
for (const key of ['NUXT_QUEUE_MODE', 'NUXT_REDIS_URL', 'REDIS_HOST_PORT', 'WORKER_CONCURRENCY', 'NUXT_TEXT_LLM_CONNECTIONS_JSON', 'NUXT_REGISTRATION_MODE', 'NUXT_SIGNUP_CREDITS']) {
  if (env[key])
    console.log(`${key}: legacy configuration; import/remove as documented`)
}
console.log('Business configuration source: PostgreSQL; ComfyUI configuration source: execution environment')
process.exitCode = failed ? 1 : 0
