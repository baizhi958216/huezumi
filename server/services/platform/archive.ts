import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createOssUploader } from '../../utils/oss'

/** Only receives a stream from the configured, authenticated ComfyUI service. */
export async function archiveManagedOutput(body: ReadableStream<Uint8Array>, objectKey: string, contentType: string) {
  const uploader = createOssUploader()
  if (!uploader)
    throw new Error('Storage not configured')
  const maxBytes = Number(useRuntimeConfig().ossMaxOutputBytes || 1073741824)
  const timeout = Number(useRuntimeConfig().ossTransferTimeoutMs || 300000)
  const directory = await mkdtemp(join(tmpdir(), 'huezumi-workflow-'))
  const path = join(directory, 'output')
  const reader = body.getReader()
  const abort = new AbortController()
  const timer = setTimeout(() => {
    abort.abort()
    void reader.cancel().catch(() => {})
  }, timeout)
  let size = 0
  try {
    await pipeline(async function* () {
      while (true) {
        const next = await reader.read()
        if (next.done)
          break
        size += next.value.byteLength
        if (size > maxBytes)
          throw new Error('Output too large')
        yield next.value
      }
    }, createWriteStream(path, { flags: 'wx' }), { signal: abort.signal })
    if (!size)
      throw new Error('Empty output')
    await uploader.uploadFile(objectKey, path, contentType, timeout)
    return size
  }
  finally {
    clearTimeout(timer)
    await reader.cancel().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
}
