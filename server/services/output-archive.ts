import type { GenerationErrorCode } from '#shared/types/generation'
import type { OssUploader } from '../utils/oss'
import { lookup } from 'node:dns/promises'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { isIP } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { finished } from 'node:stream/promises'
import { buildOssOutputObjectKey, createOssUploader } from '../utils/oss'

type OutputArchiveErrorCode
  = Extract<GenerationErrorCode, 'OUTPUT_ARCHIVE_NOT_CONFIGURED' | 'OUTPUT_TRANSFER_FAILED' | 'OUTPUT_ARCHIVE_FAILED'>

interface OutputArchiveConfig {
  maxBytes: number
  outputPrefix: string
  transferTimeoutMs: number
}

interface VideoFormat {
  contentType: 'video/mp4' | 'video/webm' | 'video/quicktime'
  extension: 'mp4' | 'webm' | 'mov'
}

export class OutputArchiveError extends Error {
  constructor(readonly code: OutputArchiveErrorCode) {
    super(code)
    this.name = 'OutputArchiveError'
  }
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value || fallback)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function getOutputArchiveConfig(): OutputArchiveConfig {
  const config = useRuntimeConfig()
  return {
    maxBytes: positiveInteger(config.ossMaxOutputBytes, 1024 * 1024 * 1024),
    outputPrefix: String(config.ossOutputPrefix || 'huezumi/outputs').replace(/^\/+|\/+$/g, ''),
    transferTimeoutMs: positiveInteger(config.ossTransferTimeoutMs, 300_000),
  }
}

function requireUploader() {
  let uploader: OssUploader | undefined
  try {
    uploader = createOssUploader()
  }
  catch {
    throw new OutputArchiveError('OUTPUT_ARCHIVE_FAILED')
  }
  if (!uploader)
    throw new OutputArchiveError('OUTPUT_ARCHIVE_NOT_CONFIGURED')
  return uploader
}

function videoFormat(contentTypeValue: string | null, sourceUrl?: URL): VideoFormat {
  const contentType = contentTypeValue?.split(';')[0]?.trim().toLowerCase()
  if (contentType === 'video/webm')
    return { contentType, extension: 'webm' }
  if (contentType === 'video/quicktime')
    return { contentType, extension: 'mov' }
  if (contentType === 'video/mp4')
    return { contentType, extension: 'mp4' }

  if (!contentType || contentType === 'application/octet-stream') {
    const extension = sourceUrl?.pathname.match(/\.(mp4|webm|mov)$/i)?.[1]?.toLowerCase()
    if (extension === 'webm')
      return { contentType: 'video/webm', extension }
    if (extension === 'mov')
      return { contentType: 'video/quicktime', extension }
    return { contentType: 'video/mp4', extension: 'mp4' }
  }
  throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
}

function isPrivateAddress(address: string) {
  if (address === '::1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:'))
    return true
  if (isIP(address) !== 4)
    return false
  const [a, b] = address.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168)
}

async function assertPublicUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
  const addresses = await lookup(url.hostname, { all: true }).catch(() => [])
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address)))
    throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
}

async function fetchPublicUrl(initial: URL, timeoutMs: number) {
  let current = initial
  for (let redirect = 0; redirect <= 5; redirect++) {
    await assertPublicUrl(current)
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    if (![301, 302, 303, 307, 308].includes(response.status))
      return { response, url: current }
    const location = response.headers.get('location')
    if (!location)
      throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
    current = new URL(location, current)
  }
  throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
}

async function writeResponseBody(response: Response, path: string, maxBytes: number) {
  if (!response.body)
    throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
  const stream = createWriteStream(path, { flags: 'wx' })
  const reader = response.body.getReader()
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
      }
      if (!stream.write(value))
        await new Promise<void>(resolveDrain => stream.once('drain', resolveDrain))
    }
    if (!size)
      throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
    stream.end()
    await finished(stream)
    return size
  }
  catch (error) {
    stream.destroy()
    throw error
  }
}

async function uploadOutputFile(
  uploader: OssUploader,
  generationId: string,
  path: string,
  format: { contentType: string, extension: string },
  config: OutputArchiveConfig,
) {
  const file = await stat(path).catch(() => undefined)
  if (!file || !file.isFile() || file.size <= 0 || file.size > config.maxBytes)
    throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
  const objectKey = buildOssOutputObjectKey(config.outputPrefix, generationId, format.extension)
  try {
    const uploaded = await uploader.uploadFile(objectKey, path, format.contentType, config.transferTimeoutMs)
    return { url: uploaded.url, objectKey, size: file.size, contentType: format.contentType }
  }
  catch {
    throw new OutputArchiveError('OUTPUT_ARCHIVE_FAILED')
  }
}

export async function archiveRemoteOutput(generationId: string, source: string, ownerId?: string, kind: 'video' | 'image' = 'video') {
  const config = getOutputArchiveConfig()
  if (kind === 'image')
    config.maxBytes = Math.min(config.maxBytes, 50 * 1024 * 1024)
  if (ownerId)
    config.outputPrefix = `${config.outputPrefix}/${ownerId}`
  const uploader = requireUploader()
  let sourceUrl: URL
  try {
    sourceUrl = new URL(source)
    if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password)
      throw new Error('invalid')
  }
  catch {
    throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
  }

  const directory = await mkdtemp(join(tmpdir(), 'huezumi-output-'))
  const path = join(directory, 'video')
  try {
    let response: Response
    try {
      const fetched = await fetchPublicUrl(sourceUrl, config.transferTimeoutMs)
      response = fetched.response
      sourceUrl = fetched.url
    }
    catch {
      throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
    }
    if (!response.ok)
      throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
    const declared = Number(response.headers.get('content-length') || 0)
    if (!Number.isFinite(declared) || declared < 0 || declared > config.maxBytes)
      throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as Record<string, string>)[mime || '']
    if (kind === 'image' && !extension)
      throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
    const format = kind === 'image' ? { contentType: mime!, extension: extension! } : videoFormat(response.headers.get('content-type'), sourceUrl)
    await writeResponseBody(response, path, config.maxBytes)
    return await uploadOutputFile(uploader, generationId, path, format, config)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function archiveLocalOutput(generationId: string, path: string, contentType: string) {
  const config = getOutputArchiveConfig()
  const uploader = requireUploader()
  const format = videoFormat(contentType)
  return uploadOutputFile(uploader, generationId, path, format, config)
}

/** Only the ComfyUI client may supply this response, from the database-pinned connection. */
export async function archiveComfyResponse(workId: string, ownerId: string, filename: string, response: Response) {
  const formats: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' }
  const extension = filename.split('.').pop()?.toLowerCase() || ''
  const contentType = formats[extension]
  if (!contentType)
    throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
  const config = getOutputArchiveConfig()
  config.outputPrefix = `${config.outputPrefix}/${ownerId}`
  const uploader = requireUploader()
  const directory = await mkdtemp(join(tmpdir(), 'huezumi-comfy-'))
  const path = join(directory, 'output')
  try {
    await writeResponseBody(response, path, config.maxBytes)
    return await uploadOutputFile(uploader, workId, path, { contentType, extension }, config)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}
