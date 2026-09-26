import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ settings: vi.fn(), connection: vi.fn() }))
vi.mock('../server/services/platform/connections', () => ({ readSettings: state.settings, currentConnection: state.connection }))
const { quoteRun } = await import('../server/services/platform/quotes')
const assignedId = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('createError', (value: object) => Object.assign(new Error('assignment'), value))
})

describe('studio quotes enforce administrator assignments', () => {
  const requests = [
    { kind: 'text', field: 'defaultTextConnectionId', input: { kind: 'copy', brief: '测试生成一份文案', length: 'short' } },
    { kind: 'image', field: 'defaultImageConnectionId', input: { mode: 'text', prompt: '测试图片', size: '1024*1024', count: 1 } },
    { kind: 'video', field: 'defaultVideoConnectionId', input: { provider: 'dashscope', model: 'wan2.6-t2v', mode: 'text', prompt: '测试视频', resolution: '1080P', ratio: '16:9', duration: 5, media: [] } },
  ]
  for (const { kind, field, input } of requests) {
    it(`${kind}: refuses unassigned service without selecting a fallback`, async () => {
      state.settings.mockResolvedValue({})
      await expect(quoteRun('owner', { kind, connectionId: assignedId, model: 'model-a', input })).rejects.toMatchObject({ statusCode: 422 })
      expect(state.connection).not.toHaveBeenCalled()
    })
    it(`${kind}: refuses a client-selected connection`, async () => {
      state.settings.mockResolvedValue({ [field]: assignedId })
      await expect(quoteRun('owner', { kind, connectionId: otherId, model: 'model-a', input })).rejects.toMatchObject({ statusCode: 422 })
      expect(state.connection).not.toHaveBeenCalled()
    })
    it(`${kind}: refuses a non-default model on the assigned connection`, async () => {
      state.settings.mockResolvedValue({ [field]: assignedId })
      state.connection.mockResolvedValue({ connection: { kind }, version: { settings: { defaultModel: 'model-b', models: ['model-a', 'model-b'] } } })
      await expect(quoteRun('owner', { kind, connectionId: assignedId, model: 'model-a', input })).rejects.toMatchObject({ statusCode: 422 })
      expect(state.connection).toHaveBeenCalledWith(assignedId)
    })
  }
})
