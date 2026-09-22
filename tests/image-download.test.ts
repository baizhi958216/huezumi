import { afterEach, expect, it, vi } from 'vitest'
import { createOssUploader } from '../server/utils/oss'

afterEach(() => vi.unstubAllGlobals())
it.each(['https://oss-cn-beijing.aliyuncs.com', 'http://127.0.0.1:9100'])('signs download disposition without changing preview URLs for %s', async (endpoint) => {
  vi.stubGlobal('useRuntimeConfig', () => ({ ossAccessKeyId: 'fixture-key', ossAccessKeySecret: 'fixture-secret', ossBucket: 'image-fixture', ossRegion: 'cn-beijing', ossEndpoint: endpoint }))
  const uploader = createOssUploader()!
  const preview = new URL(await uploader.sign('outputs/test.png', 900))
  const download = new URL(await uploader.sign('outputs/test.png', 900, '画面.png'))
  expect(preview.searchParams.has('response-content-disposition')).toBe(false)
  expect(download.searchParams.get('response-content-disposition')).toBe(`attachment; filename*=UTF-8''${encodeURIComponent('画面.png')}`)
})
