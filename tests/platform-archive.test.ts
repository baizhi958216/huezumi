import { readFile, stat } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { archiveManagedOutput } from '../server/services/platform/archive'

const upload = vi.hoisted(() => vi.fn(async (_key: string, _path: string, _type: string, _timeout: number) => {}))
vi.mock('../server/utils/oss', () => ({ createOssUploader: () => ({ uploadFile: upload }) }))
afterEach(() => {
  vi.unstubAllGlobals()
  upload.mockReset()
})
describe('managed workflow archival', () => {
  it('streams to a temporary file and cleans it up after durable upload', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ossMaxOutputBytes: 10, ossTransferTimeoutMs: 1000 }))
    let temporary = ''
    upload.mockImplementationOnce(async (_key, path) => {
      temporary = path
      expect([...await readFile(path)]).toEqual([1, 2, 3])
    })
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    } })
    expect(await archiveManagedOutput(body, 'fixture/output', 'image/png')).toBe(3)
    await expect(stat(temporary)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects oversized output without uploading partial content', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ossMaxOutputBytes: 2, ossTransferTimeoutMs: 1000 }))
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    } })
    await expect(archiveManagedOutput(body, 'fixture/output', 'image/png')).rejects.toThrow('Output too large')
    expect(upload).not.toHaveBeenCalled()
  })
  it('cancels stalled reads within the configured transfer deadline', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ossMaxOutputBytes: 10, ossTransferTimeoutMs: 10 }))
    const cancelled = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled })
    await expect(archiveManagedOutput(body, 'fixture/output', 'image/png')).rejects.toThrow()
    expect(cancelled).toHaveBeenCalledTimes(1)
    expect(upload).not.toHaveBeenCalled()
  })
})
