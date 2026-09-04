import type { GenerationErrorCode } from '#shared/types/generation'
import type { OssUploader } from '../utils/oss'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
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
    outputPrefix: String(config.ossOutputPrefix || 'forkvdo/outputs').replace(/^\/+|\/+$/g, ''),
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
  format: VideoFormat,
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

export async function archiveRemoteOutput(generationId: string, source: string) {
  const config = getOutputArchiveConfig()
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

  const directory = await mkdtemp(join(tmpdir(), 'forkvdo-output-'))
  const path = join(directory, 'video')
  try {
    let response: Response
    try {
      response = await fetch(sourceUrl, { redirect: 'follow', signal: AbortSignal.timeout(config.transferTimeoutMs) })
    }
    catch {
      throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
    }
    if (!response.ok)
      throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
    const declared = Number(response.headers.get('content-length') || 0)
    if (!Number.isFinite(declared) || declared < 0 || declared > config.maxBytes)
      throw new OutputArchiveError('OUTPUT_TRANSFER_FAILED')
    const format = videoFormat(response.headers.get('content-type'), sourceUrl)
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
