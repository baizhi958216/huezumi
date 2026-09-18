import type { WorkSummary } from './platform'

export type ModelAssetKind = 'checkpoint' | 'lora' | 'vae' | 'clip' | 'unet' | 'controlnet' | 'embedding' | 'upscale' | 'other'
export type ModelAssetSource = 'upload' | 'civitai' | 'training' | 'platform'
export type ModelAssetStatus = 'pending' | 'ready' | 'failed' | 'quarantined'
export type ModelAssetVisibility = 'private' | 'shared' | 'platform'
export interface ModelAssetSummary {
  id: string
  name: string
  kind: ModelAssetKind
  source: ModelAssetSource
  sourceRef?: string
  baseModel?: string
  description?: string
  triggerWords: string[]
  visibility: ModelAssetVisibility
  status: ModelAssetStatus
  sizeBytes: number
  fileCount: number
  createdAt: string
  updatedAt: string
}
export interface AccountLedgerEntry {
  id: string
  type: string
  amountCredits: number
  reason?: string
  generationId?: string
  createdAt: string
}
export interface AccountOverview {
  credits: {
    balance: number
    reserved: number
    available: number
    totalSpent: number
    monthSpent: number
  }
  storage: {
    mediaUsedBytes: number
    modelUsedBytes: number
    totalUsedBytes: number
    limitBytes: number
  }
  counts: {
    works: number
    activeWorks: number
    successfulWorks: number
    models: number
  }
  recentLedger: AccountLedgerEntry[]
  recentWorks: WorkSummary[]
  recentModels: ModelAssetSummary[]
}
