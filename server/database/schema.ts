import type { ComfyWorkflowJSON } from '#shared/types/comfyui'
import type { GenerationRequest, GenerationStatus } from '#shared/types/generation'
import type { TextCreationContent, TextCreationKind, TextCreationRequest } from '#shared/types/text-creation'
import type { PriceFormula } from '#shared/utils/pricing'
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export type { PriceFormula } from '#shared/utils/pricing'

export const userRole = pgEnum('user_role', ['user', 'admin'])
export const userStatus = pgEnum('user_status', ['pending', 'active', 'disabled'])
export const dispatchStatus = pgEnum('dispatch_status', ['queued', 'submitting', 'submitted', 'reconciling', 'complete', 'failed'])
export const settlementStatus = pgEnum('settlement_status', ['reserved', 'settled', 'released', 'review'])
export const modelAssetSource = pgEnum('model_asset_source', ['upload', 'civitai', 'training', 'platform'])
export const modelAssetKind = pgEnum('model_asset_kind', ['checkpoint', 'lora', 'vae', 'clip', 'unet', 'controlnet', 'embedding', 'upscale', 'other'])
export const modelAssetStatus = pgEnum('model_asset_status', ['pending', 'ready', 'failed', 'quarantined'])
export const modelAssetVisibility = pgEnum('model_asset_visibility', ['private', 'shared', 'platform'])
export const creativeProjectStatus = pgEnum('creative_project_status', ['draft', 'active', 'completed', 'archived'])

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

/** 创作项目是文章、人物、图片与镜头后续汇合的稳定所有权边界。 */
export const creativeProjects = pgTable('creative_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  schemaVersion: integer('schema_version').notNull().default(1),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: creativeProjectStatus('status').notNull().default('active'),
  lastActiveStage: text('last_active_stage').notNull().default('article'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('creative_projects_owner_idx').on(table.ownerId, table.updatedAt)])

/** 文档保存稳定身份；currentVersionId 仅作快速指针，版本表保留不可变正文。 */
export const creativeDocuments = pgTable('creative_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  schemaVersion: integer('schema_version').notNull().default(1),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => creativeProjects.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<TextCreationKind>().notNull(),
  title: text('title').notNull(),
  currentVersionId: uuid('current_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('creative_documents_owner_idx').on(table.ownerId, table.updatedAt), index('creative_documents_project_idx').on(table.projectId, table.updatedAt)])

export const creativeDocumentVersions = pgTable('creative_document_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => creativeDocuments.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  source: text('source').$type<'ai' | 'manual'>().notNull(),
  provider: text('provider'),
  model: text('model'),
  promptSnapshot: jsonb('prompt_snapshot').$type<TextCreationRequest>(),
  content: jsonb('content').$type<TextCreationContent>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('creative_document_version_unique').on(table.documentId, table.version), index('creative_document_versions_document_idx').on(table.documentId, table.createdAt)])

/**
 * 用户模型资产的元数据。模型原文件和部署状态后续由 model_asset_files / agent 管理，
 * 这里先把所有权、来源和用户可见信息独立出来，避免把模型当作普通图片素材处理。
 */
export const modelAssets = pgTable('model_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  schemaVersion: integer('schema_version').notNull().default(1),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: modelAssetKind('kind').notNull().default('other'),
  source: modelAssetSource('source').notNull(),
  sourceRef: text('source_ref'),
  baseModel: text('base_model'),
  description: text('description'),
  triggerWords: jsonb('trigger_words').$type<string[]>().notNull().default([]),
  visibility: modelAssetVisibility('visibility').notNull().default('private'),
  status: modelAssetStatus('status').notNull().default('pending'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
  sha256: text('sha256'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [index('model_assets_owner_idx').on(table.ownerId, table.createdAt), index('model_assets_status_idx').on(table.status, table.updatedAt)])

/**
 * 一个模型资产可以由多个文件组成，兼容视频模型的 diffusion model、VAE、文本编码器等组合。
 * 当前只读管理页使用汇总字段，真实上传/部署任务后续再填充对象存储 key。
 */
export const modelAssetFiles = pgTable('model_asset_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelAssetId: uuid('model_asset_id').notNull().references(() => modelAssets.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contentType: text('content_type').notNull().default('application/octet-stream'),
  targetDirectory: text('target_directory').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
  sha256: text('sha256'),
  objectKey: text('object_key'),
  localStorageKey: text('local_storage_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('model_asset_files_asset_idx').on(table.modelAssetId)])

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
  visibility: text('visibility').notNull().default('private'),
  graph: jsonb('graph').$type<ComfyWorkflowJSON>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('workflows_owner_idx').on(table.ownerId, table.updatedAt), index('workflows_visibility_idx').on(table.visibility, table.updatedAt)])

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

export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, table => [index('rate_limit_expiry_idx').on(table.expiresAt)])
