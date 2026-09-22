import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('../server/services/platform/workflow-connections', () => ({ workflowRuntimeConnections: async () => ({ agent: { apiKey: 'private-fixture' } }) }))
vi.mock('../server/services/comfyui/config', () => ({ getComfyConfig: () => ({}), getComfyBaseUrl: () => 'http://executor.test' }))
const { submitPrompt } = await import('../server/services/comfyui/client')
const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

it('refuses to send credentials when the executor lacks the private-data contract', async () => {
  fetchMock.mockResolvedValue(new Response('{}'))
  await expect(submitPrompt({ prompt: {} })).rejects.toMatchObject({ statusCode: 422 })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined()
})

it('sends secrets only in the executor private slot, never in the graph or response', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{"privateConnections":1}'))
    .mockResolvedValueOnce(new Response('{"prompt_id":"id","number":1}'))
  const input = { prompt: { 1: { class_type: 'HuezumiQwenImage21Agent', inputs: {} } }, workflow: { nodes: [] } }
  const result = await submitPrompt(input)
  const sent = JSON.parse(fetchMock.mock.calls[1]![1].body)
  expect(sent.extra_data.huezumi_connections.agent.apiKey).toBe('private-fixture')
  expect(JSON.stringify(sent.prompt)).not.toContain('private-fixture')
  expect(JSON.stringify(sent.extra_data.extra_pnginfo)).not.toContain('private-fixture')
  expect(JSON.stringify([input, result])).not.toContain('private-fixture')
})
