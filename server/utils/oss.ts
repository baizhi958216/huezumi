import { Buffer } from 'node:buffer'
import { createReadStream } from 'node:fs'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import OSS from 'ali-oss'

interface OssUploadResult {
  key: string
  url: string
}

export interface OssUploader {
  upload: (key: string, data: Uint8Array, contentType: string) => Promise<OssUploadResult>
  uploadFile: (key: string, path: string, contentType: string, timeoutMs: number) => Promise<OssUploadResult>
  sign: (key: string, expiresSeconds: number) => Promise<string>
  delete: (key: string) => Promise<void>
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '')
}

function normalizeRegion(value: string, endpoint: string) {
  // ali-oss 默认按阿里云地域拼接 oss-；S3 兼容服务（例如 SeaweedFS）使用原始地域名。
  const isAlibabaEndpoint = !endpoint || /aliyuncs\.com|aliyun\.com/i.test(endpoint)
  if (!isAlibabaEndpoint)
    return value || 'us-east-1'
  return value.startsWith('oss-') ? value : `oss-${value}`
}

function encodeObjectKey(key: string) {
  return key.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function buildS3ObjectUrl(endpoint: string, bucket: string, key: string) {
  return `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}/${encodeObjectKey(key)}`
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
      statusMessage: `对象存储配置不完整，请补齐：${missing.join('、')}`,
    })
  }

  const endpoint = String(config.ossEndpoint || '').trim()
  const publicBaseUrl = trimSlashes(String(config.ossPublicBaseUrl || '').trim())
  const region = normalizeRegion(regionValue, endpoint)
  const secureValue = String(config.ossSecure || '').trim().toLowerCase()
  const secure = secureValue
    ? secureValue !== 'false'
    : !endpoint || endpoint.startsWith('https://')
  const isAlibabaEndpoint = !endpoint || /aliyuncs\.com|aliyun\.com/i.test(endpoint)
  const useS3Compatible = Boolean(endpoint) && !isAlibabaEndpoint

  let client: OSS | undefined
  let s3Client: S3Client | undefined
  try {
    if (useS3Compatible) {
      s3Client = new S3Client({
        endpoint,
        forcePathStyle: true,
        region,
        credentials: {
          accessKeyId,
          secretAccessKey: accessKeySecret,
        },
      })
    }
    else {
      client = new OSS({
        region,
        accessKeyId,
        accessKeySecret,
        bucket,
        ...(endpoint ? { endpoint } : {}),
        secure,
        authorizationV4: true,
      })
    }
  }
  catch {
    throw createError({
      statusCode: 503,
      statusMessage: '对象存储配置无效，请检查 Bucket、地域和 Endpoint',
    })
  }

  return {
    async delete(key) {
      if (s3Client) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        return
      }
      await client!.delete(key)
    },
    async sign(key, expiresSeconds) {
      if (s3Client) {
        return await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresSeconds })
      }
      return client!.signatureUrl(key, { expires: expiresSeconds })
    },
    async upload(key, data, contentType) {
      if (s3Client) {
        await s3Client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from(data),
          ContentType: contentType,
          ACL: 'private',
        }))
        return { key, url: publicBaseUrl ? `${publicBaseUrl}/${encodeObjectKey(key)}` : buildS3ObjectUrl(endpoint, bucket, key) }
      }
      const result = await client!.put(key, Buffer.from(data), {
        mime: contentType,
        headers: {
          'Content-Type': contentType,
          'x-oss-object-acl': 'private',
        },
      })
      const url = publicBaseUrl
        ? `${publicBaseUrl}/${encodeObjectKey(key)}`
        : result.url
      return { key, url }
    },
    async uploadFile(key, path, contentType, timeoutMs) {
      if (s3Client) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), timeoutMs)
        try {
          await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: createReadStream(path),
            ContentType: contentType,
            CacheControl: 'private, no-store',
            ACL: 'private',
          }), { abortSignal: controller.signal })
        }
        finally {
          clearTimeout(timeout)
        }
        return { key, url: publicBaseUrl ? `${publicBaseUrl}/${encodeObjectKey(key)}` : buildS3ObjectUrl(endpoint, bucket, key) }
      }
      const result = await client!.put(key, path, {
        timeout: timeoutMs,
        mime: contentType,
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Type': contentType,
          'x-oss-object-acl': 'private',
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

export function buildOssOutputObjectKey(prefix: string, generationId: string, extension: string) {
  const safeExtension = ['mp4', 'webm', 'mov'].includes(extension) ? extension : 'mp4'
  return [prefix, `${generationId}.${safeExtension}`].filter(Boolean).join('/')
}
