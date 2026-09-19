import type { ComfyUIStatus } from '../shared/types/comfyui'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getComfyStatus: vi.fn(), startComfy: vi.fn(), appendRuntimeLog: vi.fn() }))
vi.mock('../server/services/comfyui/process', () => mocks)
vi.mock('../server/services/comfyui/state', () => mocks)

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubGlobal('defineNitroPlugin', (plugin: () => void) => plugin)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function boot(status: Pick<ComfyUIStatus, 'mode' | 'state' | 'installed'>) {
  mocks.getComfyStatus.mockResolvedValue(status)
  const plugin = (await import('../server/plugins/comfyui')).default
  expect(plugin()).toBeUndefined()
  await vi.waitFor(() => expect(mocks.appendRuntimeLog.mock.calls.length + vi.mocked(console.warn).mock.calls.length).toBeGreaterThan(0))
}

it.each(['local', 'remote'] as const)('reuses a running %s service', async (mode) => {
  await boot({ mode, state: 'running', installed: true })
  expect(mocks.startComfy).not.toHaveBeenCalled()
})

it('starts an installed local service and reports readiness', async () => {
  mocks.startComfy.mockResolvedValue({ state: 'running' })
  await boot({ mode: 'local', state: 'stopped', installed: true })
  expect(mocks.startComfy).toHaveBeenCalledOnce()
  expect(mocks.appendRuntimeLog).toHaveBeenCalledWith(expect.stringContaining('服务已就绪'))
})

it.each([
  { mode: 'remote', state: 'stopped', installed: true },
  { mode: 'local', state: 'not_installed', installed: false },
  { mode: 'local', state: 'starting', installed: true },
] as const)('does not spawn for $mode / $state', async (status) => {
  await boot(status)
  expect(mocks.startComfy).not.toHaveBeenCalled()
})

it.each(['reject', 'not-ready'])('handles startup failure without leaking errors: %s', async (failure) => {
  if (failure === 'reject')
    mocks.startComfy.mockRejectedValue(new Error('private upstream detail'))
  else
    mocks.startComfy.mockResolvedValue({ state: 'error' })
  await boot({ mode: 'local', state: 'stopped', installed: true })
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('自动启动失败'))
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('private upstream detail')
})

it('handles configuration/probe failures without blocking plugin initialization', async () => {
  mocks.getComfyStatus.mockRejectedValue(new Error('private config'))
  const plugin = (await import('../server/plugins/comfyui')).default
  expect(plugin()).toBeUndefined()
  await vi.waitFor(() => expect(console.warn).toHaveBeenCalledOnce())
  expect(mocks.startComfy).not.toHaveBeenCalled()
})
