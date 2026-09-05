import type { Buffer } from 'node:buffer'
import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import process from 'node:process'
import { promisify } from 'node:util'
import { Pool } from 'pg'

const args = process.argv.slice(2)
const option = (name: string) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const positional = args.filter(value => !value.startsWith('--'))
const emailValue = option('email') || positional[0]
const password = option('password') || positional[1]
const displayName = option('name') || positional[2] || 'Administrator'
const databaseUrl = process.env.NUXT_DATABASE_URL
if (!databaseUrl || !emailValue || !password)
  throw new Error('Usage: NUXT_DATABASE_URL=... pnpm admin:create -- --email=admin@example.com --password=... [--name=Administrator]')
if (password.length < 10)
  throw new Error('Password must contain at least 10 characters')
const salt = randomBytes(16)
const derived = await promisify(scryptCallback)(password, salt, 64) as Buffer
const passwordHash = `scrypt:${salt.toString('base64')}:${derived.toString('base64')}`
const pool = new Pool({ connectionString: databaseUrl })
try {
  const result = await pool.query<{ id: string }>(`
    insert into users (email, display_name, password_hash, role, status)
    values ($1, $2, $3, 'admin', 'active')
    on conflict (email) do update set role = 'admin', status = 'active', password_hash = excluded.password_hash, updated_at = now()
    returning id
  `, [emailValue.trim().toLowerCase(), displayName, passwordHash])
  await pool.query('insert into wallets (user_id) values ($1) on conflict (user_id) do nothing', [result.rows[0]!.id])
  console.log(`Administrator ready: ${emailValue.trim().toLowerCase()}`)
}
finally {
  await pool.end()
}
