import type { ModelOption, Page, ProjectSummary, RunRequest, RunSummary } from '#shared/types/platform'

export interface PlatformQuote {
  id: string
  request: RunRequest
  estimatedCredits: number
  priceVersion: number
  expiresAt: string
}
export function apiError(error: unknown) {
  const value = error as {
    data?: {
      data?: {
        message?: string
      }
      statusMessage?: string
    }
    message?: string
  }
  return value.data?.data?.message || value.data?.statusMessage || '请求未完成，请稍后重试'
}
export function usePlatformApi() {
  return {
    models: () => $fetch<ModelOption[]>('/api/catalog/models'),
    projects: () => $fetch<Page<ProjectSummary>>('/api/projects'),
    quote: (request: RunRequest) => $fetch<PlatformQuote>('/api/billing/quotes', { method: 'POST', body: request }),
    submit: (quote: PlatformQuote, idempotencyKey: string) => $fetch<RunSummary>('/api/runs', { method: 'POST', body: { request: quote.request, quoteId: quote.id, idempotencyKey } }),
    run: (id: string) => $fetch<RunSummary>(`/api/runs/${id}`),
    command: (id: string, action: 'sync' | 'archive') => $fetch(`/api/runs/${id}/${action}`, { method: 'POST' }),
  }
}
