/** Classify failures without returning upstream URLs, SQL parameters or credentials. */
export function assetSaveError(error: unknown, stage: 'storage' | 'database') {
  if (stage === 'database')
    return { code: 'ASSET_DATABASE_FAILED', message: '素材登记失败，请稍后重试；若持续失败，请联系管理员检查数据库' }
  const failure = error as { name?: string, code?: string, status?: number, $metadata?: { httpStatusCode?: number } } | null
  const code = failure?.code || failure?.name || ''
  if (/timeout/i.test(code))
    return { code: 'ASSET_STORAGE_TIMEOUT', message: '连接素材存储超时，请稍后重试；若持续失败，请联系管理员检查存储网络' }
  if (['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'AccessDeniedError', 'InvalidAccessKeyIdError', 'SignatureDoesNotMatchError'].includes(code) || failure?.status === 403 || failure?.$metadata?.httpStatusCode === 403)
    return { code: 'ASSET_STORAGE_DENIED', message: '素材存储拒绝访问，请联系管理员检查存储凭据和写入权限' }
  if (['NoSuchBucket', 'NoSuchBucketError'].includes(code))
    return { code: 'ASSET_STORAGE_BUCKET_MISSING', message: '素材存储空间不存在，请联系管理员检查 Bucket 配置' }
  if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN'].includes(code))
    return { code: 'ASSET_STORAGE_UNREACHABLE', message: '无法连接素材存储，请联系管理员检查存储地址和网络' }
  return { code: 'ASSET_STORAGE_FAILED', message: '素材存储写入失败，请稍后重试或联系管理员检查存储服务' }
}

/** Safe diagnostic fields only: raw messages may contain signed URLs or SQL. */
export function assetSaveDiagnostic(error: unknown) {
  const failure = error as { name?: unknown, code?: unknown, status?: unknown, cause?: unknown } | null
  const token = (value: unknown) => typeof value === 'string' && /^[\w.-]{1,80}$/.test(value) ? value : undefined
  return {
    name: token(failure?.name),
    upstreamCode: token(failure?.code),
    upstreamStatus: typeof failure?.status === 'number' ? failure.status : undefined,
    causeName: token((failure?.cause as { name?: unknown } | undefined)?.name),
    causeCode: token((failure?.cause as { code?: unknown } | undefined)?.code),
  }
}
