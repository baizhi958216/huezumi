import type { GenerationRequest, ProviderSubmitResult, ProviderTaskResult } from '#shared/types/generation'

export interface VideoProvider {
  readonly id: string
  submit: (request: GenerationRequest) => Promise<ProviderSubmitResult>
  getTask: (taskId: string) => Promise<ProviderTaskResult>
}
