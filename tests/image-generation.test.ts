import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStudioNavigation } from '../app/utils/app-navigation'
import { generateDashscopeImages, imageEndpoint, imagePayload } from '../server/services/providers/dashscope-image'
import { imageGenerationSchema } from '../server/utils/image-generation-schema'
import { imageCredits } from '../shared/utils/image-pricing'

const input = imageGenerationSchema.parse({ mode: 'text', prompt: '测试画面', images: [], count: 2, size: '1024*1024', seed: 0 })
const settings = { defaultModel: 'qwen-image-2.0', models: ['qwen-image-2.0'] }
afterEach(() => vi.unstubAllGlobals())
describe('image provider contract', () => {
  it('uses native DashScope endpoints for legacy, workspace and international connections', () => {
    expect(imageEndpoint(settings)).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation')
    expect(imageEndpoint({ ...settings, workspaceId: 'workspace', region: 'ap-southeast-1' })).toContain('workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/services/')
    expect(imageEndpoint({ ...settings, region: 'ap-southeast-1' })).toContain('dashscope-intl.aliyuncs.com')
    expect(imageEndpoint({ ...settings, baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/' })).toBe(imageEndpoint(settings))
  })
  it('preserves reference ordering, one text instruction and seed zero', () => {
    const payload = imagePayload('qwen-image-2.0-pro', { ...input, mode: 'edit' }, ['https://image.test/a', 'https://image.test/b'])
    expect(payload.input.messages).toEqual([{ role: 'user', content: [{ image: 'https://image.test/a' }, { image: 'https://image.test/b' }, { text: '测试画面' }] }])
    expect(payload.parameters).toMatchObject({ size: '1024*1024', n: 2, seed: 0, prompt_extend: true, watermark: false })
  })
  it('parses multiple image outputs with exactly one authenticated POST', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image: 'https://output.test/a.png' }, { image: 'https://output.test/b.png' }] } }] } })))
    vi.stubGlobal('fetch', fetch)
    expect(await generateDashscopeImages(settings, 'fixture', 'qwen-image-2.0', input, [])).toHaveLength(2)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer fixture' } })
    expect(fetch.mock.calls[0]![1].headers).not.toHaveProperty('X-DashScope-Async')
  })
  it.each([400, 401, 429])('treats HTTP %i as a definite rejection', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))
    await expect(generateDashscopeImages(settings, 'fixture', 'qwen-image-2.0', input, [])).rejects.toMatchObject({ definite: true })
  })
  it.each([408, 500, 502])('keeps HTTP %i ambiguous without retrying', async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status }))
    vi.stubGlobal('fetch', fetch)
    await expect(generateDashscopeImages(settings, 'fixture', 'qwen-image-2.0', input, [])).rejects.toMatchObject({ definite: false })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not retry timeouts or leak upstream credentials', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('secret-provider-diagnostic'))
    vi.stubGlobal('fetch', fetch)
    await expect(generateDashscopeImages(settings, 'fixture', 'qwen-image-2.0', input, [])).rejects.toMatchObject({ definite: false, message: '图片生成结果不明' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('distinguishes explicit API errors from malformed success payloads', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"code":"InvalidParameter"}')).mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    await expect(generateDashscopeImages(settings, 'fixture', 'qwen-image-2.0', input, [])).rejects.toMatchObject({ definite: true })
    await expect(generateDashscopeImages(settings, 'fixture', 'qwen-image-2.0', input, [])).rejects.toMatchObject({ definite: false })
  })
})
describe('image request and pricing boundaries', () => {
  it('accepts both platform asset URLs emitted by upload and works', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000'
    expect(imageGenerationSchema.parse({ ...input, mode: 'edit', images: [`/api/files/${id}`, `/api/assets/${id}/content`] }).images).toHaveLength(2)
  })
  it.each([
    { prompt: ' ' },
    { count: 0 },
    { count: 7 },
    { count: 1.5 },
    { seed: -1 },
    { seed: 2147483648 },
    { size: '5000*5000' },
    { mode: 'edit', images: [] },
    { images: ['https://external.test/image.png'] },
  ])('rejects unsupported request parameters %j', (patch) => {
    expect(imageGenerationSchema.safeParse({ ...input, ...patch }).success).toBe(false)
  })
  it('charges by actual count and refuses accidental video pricing rules', () => {
    expect(imageCredits({ fixedCredits: 3 }, 6)).toBe(18)
    expect(imageCredits({ fixedCredits: 3 }, 2)).toBe(6)
    expect(() => imageCredits({ outputSecondCredits: 20 }, 1)).toThrow()
    expect(() => imageCredits({ fixedCredits: 2, outputSecondCredits: 20 }, 1)).toThrow()
    expect(() => imageCredits({ fixedCredits: Infinity }, 1)).toThrow()
  })
  it('exposes independent image creation to users and reserves advanced workflows for admins', () => {
    expect(getStudioNavigation('user').map(item => item.to)).toContain('/studio/image')
    expect(getStudioNavigation('user').map(item => item.to)).not.toContain('/studio/workflow')
    expect(getStudioNavigation('admin').find(item => item.to === '/studio/workflow')?.label).toBe('工作流 · 高级')
  })
})
