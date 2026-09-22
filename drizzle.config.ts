import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env.NUXT_DATABASE_URL
if (!databaseUrl)
  throw new Error('NUXT_DATABASE_URL is required')

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/database/schema.ts',
  schemaFilter: ['public'],
  dbCredentials: { url: databaseUrl },
})
