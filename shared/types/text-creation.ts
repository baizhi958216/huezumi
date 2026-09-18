export type TextCreationKind = 'story' | 'script' | 'copy'
export type TextCreationLength = 'short' | 'medium' | 'long'

export interface TextCharacter {
  name: string
  profile: string
}

export interface TextScene {
  title: string
  visual: string
  action: string
  dialogue: string
}

export interface TextCreationContent {
  title: string
  summary: string
  content: string
  characters: TextCharacter[]
  scenes: TextScene[]
  keywords: string[]
}

export interface TextCreationRequest {
  kind: TextCreationKind
  brief: string
  tone?: string
  audience?: string
  length: TextCreationLength
  connectionId?: string
  projectId?: string
  documentId?: string
}

export interface TextProviderOption {
  id: string
  label: string
  model: string
}

export interface TextDocumentSummary {
  id: string
  projectId: string
  title: string
  kind: TextCreationKind
  currentVersion: number
  summary: string
  updatedAt: string
}

export interface TextDocumentVersionRecord {
  kind?: TextCreationKind
  id: string
  documentId: string
  projectId: string
  version: number
  source: 'ai' | 'manual'
  provider?: string
  model?: string
  content: TextCreationContent
  createdAt: string
}
