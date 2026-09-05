import process from 'node:process'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const databaseUrl = process.env.NUXT_DATABASE_URL
if (!databaseUrl)
  throw new Error('NUXT_DATABASE_URL is required')
const pool = new Pool({ connectionString: databaseUrl })
try {
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  console.log('Database migrations applied')
}
finally {
  await pool.end()
}
