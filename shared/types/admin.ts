export interface AdminTask {
  id: string
  source: 'run' | 'video'
  kind: 'text' | 'image' | 'video'
  owner: string
  status: string
  settlement: string
  credits: number
  chargedCredits: number | null
  detail: string
  createdAt: string
  providerTaskId: string | null
  stage: string
}
