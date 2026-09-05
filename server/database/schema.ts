import type { ComfyWorkflowJSON } from '#shared/types/comfyui'
import type { GenerationRequest, GenerationStatus } from '#shared/types/generation'
import type { PriceFormula } from '#shared/utils/pricing'
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export type { PriceFormula } from '#shared/utils/pricing'

export const userRole = pgEnum('user_role', ['user', 'admin'])
export const userStatus = pgEnum('user_status', ['pending', 'active', 'disabled'])
export const dispatchStatus = pgEnum('dispatch_status', ['queued', 'submitting', 'submitted', 'reconciling', 'complete', 'failed'])
export const settlementStatus = pgEnum('settlement_status', ['reserved', 'settled', 'released', 'review'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('user'),
  status: userStatus('status').notNull().default('active'),
  storageLimitBytes: bigint('storage_limit_bytes', { mode: 'number' }).notNull().default(10 * 1024 * 1024 * 1024),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('users_email_unique').on(table.email)])

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('sessions_token_hash_unique').on(table.tokenHash), index('sessions_user_idx').on(table.userId)])

export const invitationCodes = pgTable('invitation_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  codeHash: text('code_hash').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  usedBy: uuid('used_by').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp('used_at', { withTimezone: true }),
}, table => [uniqueIndex('invitation_codes_hash_unique').on(table.codeHash)])

export const wallets = pgTable('wallets', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  balanceCredits: integer('balance_credits').notNull().default(0),
  reservedCredits: integer('reserved_credits').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  generationId: uuid('generation_id'),
  type: text('type').notNull(),
  amountCredits: integer('amount_credits').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  reason: text('reason'),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('ledger_idempotency_unique').on(table.idempotencyKey), index('ledger_user_idx').on(table.userId, table.createdAt)])

export const pricingRules = pgTable('pricing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  resolution: text('resolution').notNull().default('*'),
  formula: jsonb('formula').$type<PriceFormula>().notNull(),
  sourceUrl: text('source_url'),
  sourceLabel: text('source_label').notNull().default('平台内部额度规则'),
  version: integer('version').notNull().default(1),
  active: boolean('active').notNull().default(true),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('pricing_lookup_idx').on(table.provider, table.model, table.resolution, table.active),
  uniqueIndex('pricing_version_unique').on(table.provider, table.model, table.resolution, table.version),
])

export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  requestHash: text('request_hash').notNull(),
  request: jsonb('request').$type<GenerationRequest>().notNull(),
  ruleId: uuid('rule_id').notNull().references(() => pricingRules.id),
  priceVersion: integer('price_version').notNull(),
  estimatedCredits: integer('estimated_credits').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('quotes_user_idx').on(table.userId, table.createdAt)])

export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  schemaVersion: integer('schema_version').notNull().default(1),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  request: jsonb('request').$type<GenerationRequest>().notNull(),
  requestHash: text('request_hash').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  quoteId: uuid('quote_id').notNull().references(() => quotes.id),
  providerTaskId: text('provider_task_id'),
  status: text('status').$type<GenerationStatus>().notNull().default('PENDING'),
  dispatchStatus: dispatchStatus('dispatch_status').notNull().default('queued'),
  settlementStatus: settlementStatus('settlement_status').notNull().default('reserved'),
  reservedCredits: integer('reserved_credits').notNull(),
  chargedCredits: integer('charged_credits'),
  videoUrl: text('video_url'),
  videoArchived: boolean('video_archived').notNull().default(false),
  outputArchive: jsonb('output_archive').$type<Record<string, unknown>>().notNull().default({ status: 'not_started' }),
  usage: jsonb('usage').$type<Record<string, number | string>>(),
  errorCode: text('error_code'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('generation_owner_idempotency_unique').on(table.ownerId, table.idempotencyKey), index('generation_owner_created_idx').on(table.ownerId, table.createdAt), index('generation_dispatch_idx').on(table.dispatchStatus, table.updatedAt)])

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  schemaVersion: integer('schema_version').notNull().default(1),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  contentType: text('content_type').notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  objectKey: text('object_key'),
  localStorageKey: text('local_storage_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [index('assets_owner_idx').on(table.ownerId, table.createdAt)])

export const assetReservations = pgTable('asset_reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  size: bigint('size', { mode: 'number' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('asset_reservation_owner_idx').on(table.ownerId, table.expiresAt)])

export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  schemaVersion: integer('schema_version').notNull().default(1),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  graph: jsonb('graph').$type<ComfyWorkflowJSON>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('workflows_owner_idx').on(table.ownerId, table.updatedAt)])

export const comfyExecutions = pgTable('comfy_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  promptId: text('prompt_id').notNull(),
  status: text('status').notNull().default('submitted'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('comfy_prompt_unique').on(table.promptId), index('comfy_owner_idx').on(table.ownerId, table.createdAt)])

export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  topic: text('topic').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  attempts: integer('attempts').notNull().default(0),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('outbox_pending_idx').on(table.publishedAt, table.availableAt)])

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('audit_created_idx').on(table.createdAt)])
