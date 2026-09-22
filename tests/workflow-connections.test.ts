import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ settings: vi.fn(), connection: vi.fn() }))
vi.mock('../server/services/platform/connections', () => ({ readSettings: mocks.settings, currentConnection: mocks.connection }))
const { workflowRuntimeConnections } = await import('../server/services/platform/workflow-connections')
const prompt = (class_type: string) => ({ 1: { class_type, inputs: {} } })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('createError', (value: object) => Object.assign(new Error('fixture'), value))
})

describe('workflow purpose assignments', () => {
  it('does not load API secrets for a local model workflow', async () => {
    expect(await workflowRuntimeConnections(prompt('KSampler'))).toBeUndefined()
    expect(mocks.settings).not.toHaveBeenCalled()
  })
  it('requires an explicit image assignment rather than environment fallback', async () => {
    mocks.settings.mockResolvedValue({})
    await expect(workflowRuntimeConnections(prompt('HuezumiApiImage'))).rejects.toMatchObject({ statusCode: 422 })
    expect(mocks.connection).not.toHaveBeenCalled()
  })
  it('reads the current revision per submission without mutating earlier snapshots', async () => {
    mocks.settings.mockResolvedValue({ defaultImageConnectionId: 'image', workflowAgentConnectionId: 'unused' })
    const version = (revision: string) => ({ connection: { kind: 'image', provider: 'openai-compatible' }, version: { id: revision, settings: { baseUrl: 'https://provider.test/v1', defaultModel: 'image-model' } }, secrets: { apiKey: revision } })
    mocks.connection.mockResolvedValueOnce(version('first')).mockResolvedValueOnce(version('second'))
    const first = await workflowRuntimeConnections(prompt('HuezumiApiImage'))
    const second = await workflowRuntimeConnections(prompt('HuezumiApiImage'))
    expect(first?.image?.apiKey).toBe('first')
    expect(second?.image?.apiKey).toBe('second')
    expect(mocks.connection.mock.calls).toEqual([['image'], ['image']])
  })
  it('rejects a mismatched or revoked assignment', async () => {
    mocks.settings.mockResolvedValue({ workflowVideoConnectionId: 'video' })
    mocks.connection.mockResolvedValueOnce({ connection: { kind: 'video', provider: 'runway' } })
    await expect(workflowRuntimeConnections(prompt('HuezumiBailianWan3Video'))).rejects.toMatchObject({ statusCode: 422 })
    mocks.connection.mockRejectedValueOnce({ statusCode: 409 })
    await expect(workflowRuntimeConnections(prompt('HuezumiBailianWan3Video'))).rejects.toMatchObject({ statusCode: 409 })
  })
  it('provides an empty managed context for optional offline Agent use', async () => {
    mocks.settings.mockResolvedValue({})
    expect(await workflowRuntimeConnections(prompt('HuezumiQwenImage21Agent'))).toEqual({})
  })
})
