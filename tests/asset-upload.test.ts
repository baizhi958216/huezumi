import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { assets } from '../server/database/schema'

const state = vi.hoisted(() => ({ createUploader: vi.fn(), upload: vi.fn(), remove: vi.fn(), insertAsset: vi.fn(), release: vi.fn() }))
vi.mock('../server/utils/auth', () => ({ requireUser: async () => ({ id: 'owner', storageLimitBytes: 10000 }) }))
vi.mock('../server/utils/oss', () => ({ createOssUploader: state.createUploader, buildOssObjectKey: () => 'private-fixture-key' }))
vi.mock('../server/database/client', () => ({ useDatabase: () => ({
  transaction: async (callback: (tx: any) => Promise<void>) => callback({
    execute: async () => ({ rows: [{ used: 0 }] }),
    insert: (table: any) => ({ values: table === assets ? state.insertAsset : async () => {} }),
    delete: () => ({ where: state.release }),
  }),
  delete: () => ({ where: state.release }),
}) }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
const { default: uploadAsset } = await import('../server/api/assets/index.post')
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('createError', (value: object) => Object.assign(new Error('fixture'), value))
  vi.stubGlobal('readMultipartFormData', async () => [{ name: 'file', filename: 'fixture.png', type: 'image/png', data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=', 'base64') }])
  vi.stubGlobal('useRuntimeConfig', () => ({}))
  state.release.mockResolvedValue(undefined)
  state.upload.mockResolvedValue(undefined)
  state.remove.mockResolvedValue(undefined)
  state.insertAsset.mockResolvedValue(undefined)
  state.createUploader.mockReturnValue({ upload: state.upload, delete: state.remove })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
it('releases reserved storage if uploader configuration fails', async () => {
  state.createUploader.mockImplementation(() => {
    throw Object.assign(new Error('配置不完整'), { statusCode: 503 })
  })
  await expect(uploadAsset({ context: {} } as any)).rejects.toMatchObject({ statusCode: 503 })
  expect(state.release).toHaveBeenCalledOnce()
})
it('reports storage timeout and cleans up its reservation', async () => {
  state.upload.mockRejectedValue(Object.assign(new Error('private upstream response'), { name: 'ResponseTimeoutError' }))
  await expect(uploadAsset({ context: {} } as any)).rejects.toMatchObject({ data: { code: 'ASSET_STORAGE_TIMEOUT' } })
  expect(state.release).toHaveBeenCalledOnce()
  expect(state.insertAsset).not.toHaveBeenCalled()
})
it('distinguishes database registration failure and removes the uploaded object', async () => {
  state.insertAsset.mockRejectedValue(new Error('private SQL parameters'))
  await expect(uploadAsset({ context: {} } as any)).rejects.toMatchObject({ data: { code: 'ASSET_DATABASE_FAILED' } })
  expect(state.remove).toHaveBeenCalledWith('private-fixture-key')
  expect(state.release).toHaveBeenCalledOnce()
})
