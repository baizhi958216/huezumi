import type { GenerationRecord, GenerationRequest, GenerationStatus, ProviderCapability } from './generation'
import type { ImageGenerationRequest } from './image-generation'
import type { TextCreationRequest, TextDocumentVersionRecord } from './text-creation'
import type { WorkflowExecution, WorkflowInput, WorkflowPolicy } from './workflow'

export type RunKind = 'video' | 'text' | 'image' | 'workflow'
export interface Page<T> {
  items: T[]
  nextCursor: string | null
}
export interface ConnectionSettings {
  workflowPolicy?: WorkflowPolicy
  baseUrl?: string
  defaultModel: string
  models: string[]
  workspaceId?: string
  region?: string
  groupId?: string
  auth?: 'bearer' | 'none'
  apiProtocol?: 'auto' | 'chat_completions' | 'responses'
  timeoutSeconds?: number
}
export interface ConnectionSecrets {
  apiKey?: string
  accessKey?: string
  secretKey?: string
}
export interface ConnectionSummary {
  id: string
  name: string
  kind: 'video' | 'text' | 'image' | 'workflow'
  provider: string
  enabled: boolean
  revisionId: string
  version: number
  settings: ConnectionSettings
  hasCredentials: boolean
  revoked: boolean
}
export interface PlatformSettings {
  registrationMode: 'open' | 'invite' | 'disabled'
  signupCredits: number
  userMaxActiveGenerations: number
  platformDailyCreditBudget: number
  defaultVideoConnectionId?: string
  defaultTextConnectionId?: string
  defaultImageConnectionId?: string
  defaultWorkflowConnectionId?: string
}
export interface ModelOption {
  id: string
  kind: 'video' | 'text' | 'image' | 'workflow'
  connectionId: string
  provider: string
  label: string
  model: string
  available: boolean
  reason?: string
  capability?: ProviderCapability
}
export interface RunRequest {
  kind: 'video' | 'text' | 'image' | 'workflow'
  connectionId: string
  model: string
  input: GenerationRequest | TextCreationRequest | ImageGenerationRequest | WorkflowInput
  projectId?: string
  sourceVersionId?: string
  sourceExcerpt?: string
  baseVersionId?: string
}
export interface RunSummary {
  id: string
  kind: RunKind
  projectId?: string
  status: GenerationStatus
  stage: string
  billing: {
    estimatedCredits: number
    chargedCredits?: number
    settlementStatus: string
    priceVersion?: number
  }
  allowedActions: Array<'sync' | 'archive'>
  outputs: Array<{
    id: string
    kind: string
    url?: string
  }>
  workflow?: WorkflowExecution
  generation?: GenerationRecord
  imageRequest?: { connectionId: string, model: string, input: ImageGenerationRequest }
  documentVersion?: TextDocumentVersionRecord
  needsReview?: boolean
  error?: string
  createdAt: string
  updatedAt: string
}
export interface WorkSummary {
  id: string
  kind: 'text' | 'image' | 'video'
  title: string
  summary: string
  projectId?: string
  runId?: string
  documentId?: string
  versionId?: string
  url?: string
  availability: 'available' | 'pending' | 'unavailable'
  createdAt: string
}
export interface ProjectSummary {
  id: string
  name: string
  status: string
  updatedAt: string
}
