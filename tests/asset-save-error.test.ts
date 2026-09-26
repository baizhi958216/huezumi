import { expect, it } from 'vitest'
import { assetSaveError } from '../server/utils/asset-save-error'

it('distinguishes upload timeout from database failure without leaking details', () => {
  const error = { name: 'ResponseTimeoutError', message: 'private URL and credentials' }
  expect(assetSaveError(error, 'storage').code).toBe('ASSET_STORAGE_TIMEOUT')
  expect(assetSaveError(error, 'database').code).toBe('ASSET_DATABASE_FAILED')
  expect(JSON.stringify(assetSaveError(error, 'storage'))).not.toContain(error.message)
})
it.each([
  [{ code: 'AccessDenied' }, 'ASSET_STORAGE_DENIED'],
  [{ name: 'AccessDeniedError' }, 'ASSET_STORAGE_DENIED'],
  [{ $metadata: { httpStatusCode: 403 } }, 'ASSET_STORAGE_DENIED'],
  [{ code: 'NoSuchBucket' }, 'ASSET_STORAGE_BUCKET_MISSING'],
  [{ code: 'ECONNRESET' }, 'ASSET_STORAGE_UNREACHABLE'],
  [null, 'ASSET_STORAGE_FAILED'],
])('classifies safe storage failures %j', (error, code) => {
  expect(assetSaveError(error, 'storage').code).toBe(code)
})
