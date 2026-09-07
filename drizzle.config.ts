import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.NUXT_DATABASE_URL || 'postgresql://forkvdo:forkvdo@localhost:5432/forkvdo' },
})
