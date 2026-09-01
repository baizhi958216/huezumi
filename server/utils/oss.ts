import { Buffer } from 'node:buffer'
import OSS from 'ali-oss'

interface OssUploadResult {
  key: string
  url: string
}

interface OssUploader {
  upload: (key: string, data: Uint8Array, contentType: string) => Promise<OssUploadResult>
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '')
}

function normalizeRegion(value: string) {
  return value.startsWith('oss-') ? value : `oss-${value}`
}

function encodeObjectKey(key: string) {
  return key.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

/**
 * OSS 配置完整时启用服务端转存；完全没有配置时保留本地开发模式。
 * AccessKey 永远只在此服务端模块中读取，不进入 public runtime config。
 */
export function createOssUploader(): OssUploader | undefined {
  const config = useRuntimeConfig()
  const accessKeyId = String(config.ossAccessKeyId || '').trim()
  const accessKeySecret = String(config.ossAccessKeySecret || '').trim()
  const bucket = String(config.ossBucket || '').trim()
  const regionValue = String(config.ossRegion || '').trim()
  const required = [
    ['NUXT_OSS_ACCESS_KEY_ID', accessKeyId],
    ['NUXT_OSS_ACCESS_KEY_SECRET', accessKeySecret],
    ['NUXT_OSS_BUCKET', bucket],
    ['NUXT_OSS_REGION', regionValue],
  ] as const

  if (required.every(([, value]) => !value))
    return undefined

  const missing = required.filter(([, value]) => !value).map(([name]) => name)
  if (missing.length) {
    throw createError({
      statusCode: 503,
      statusMessage: `阿里云 OSS 配置不完整，请补齐：${missing.join('、')}`,
    })
  }

  const endpoint = String(config.ossEndpoint || '').trim()
  const publicBaseUrl = trimSlashes(String(config.ossPublicBaseUrl || '').trim())
  const region = normalizeRegion(regionValue)

  let client: OSS
  try {
    client = new OSS({
      region,
      accessKeyId,
      accessKeySecret,
      bucket,
      ...(endpoint ? { endpoint } : {}),
      secure: true,
      authorizationV4: true,
    })
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: '阿里云 OSS 配置无效，请检查 Bucket、地域和 Endpoint',
    })
  }

  return {
    async upload(key, data, contentType) {
      const result = await client.put(key, Buffer.from(data), {
        mime: contentType,
        headers: {
          'Content-Type': contentType,
          'x-oss-object-acl': 'public-read',
        },
      })
      const url = publicBaseUrl
        ? `${publicBaseUrl}/${encodeObjectKey(key)}`
        : result.url
      return { key, url }
    },
  }
}

export function buildOssObjectKey(prefix: string, id: string, fileName?: string) {
  const extension = fileName?.match(/\.[a-z0-9]{1,10}$/i)?.[0].toLowerCase() || ''
  return [prefix, `${id}${extension}`].filter(Boolean).join('/')
}
