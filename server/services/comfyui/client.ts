import type { ConnectionSecrets, ConnectionSettings } from '#shared/types/platform'
import type { ComfyCatalog, WorkflowGraph } from '#shared/types/workflow'

export class ComfyRequestError extends Error {
  constructor(readonly definite: boolean) {
    super('ComfyUI 请求失败')
  }
}
export function comfyClient(settings: ConnectionSettings, secrets: ConnectionSecrets = {}) {
  if (!settings.baseUrl)
    throw new Error('ComfyUI 地址未配置')
  const base = settings.baseUrl.replace(/\/+$/, '')
  async function request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    if (settings.auth !== 'none' && secrets.apiKey)
      headers.set('Authorization', `Bearer ${secrets.apiKey}`)
    let response: Response
    try {
      response = await fetch(`${base}${path}`, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout((settings.timeoutSeconds || 30) * 1000) })
    }
    catch {
      throw new ComfyRequestError(false)
    }
    if (!response.ok)
      throw new ComfyRequestError([400, 401, 403, 404, 422].includes(response.status))
    return response
  }
  return {
    request,
    catalog: async () => await (await request('/object_info')).json() as ComfyCatalog,
    submit: async (graph: WorkflowGraph, runId: string) => {
      const result = await (await request('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: runId, extra_data: { huezumi_run_id: runId } }) })).json() as { prompt_id?: string }
      if (!result.prompt_id)
        throw new ComfyRequestError(false)
      return result.prompt_id
    },
  }
}
