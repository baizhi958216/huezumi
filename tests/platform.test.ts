import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { envAssignment } from '../scripts/env-file'
import { comfyChildEnvironment } from '../server/services/comfyui/environment'
import { decryptSecrets, encryptSecrets } from '../server/services/platform/crypto'
import { connectionSchema, runRequestSchema } from '../server/services/platform/schemas'

describe('platform boundaries', () => {
  it('preserves private workflow JSON when compacting dotenv', () => {
    const value = JSON.stringify({ writer: { baseUrl: 'https://fixture.invalid', apiKey: 'fixture-secret', defaultModel: 'writer' } })
    expect(parseEnv(envAssignment('NUXT_COMFYUI_LLM_CONNECTIONS_JSON', value)).NUXT_COMFYUI_LLM_CONNECTIONS_JSON).toBe(value)
  })
  it('isolates the local ComfyUI child from platform secrets', () => {
    const env = comfyChildEnvironment({ PATH: '/fixture/bin', NUXT_CONNECTION_ENCRYPTION_KEY: 'private-master', NUXT_DATABASE_URL: 'private-db', NUXT_OSS_ACCESS_KEY_SECRET: 'private-oss', NUXT_DASHSCOPE_API_KEY: 'workflow-key' })
    expect(JSON.stringify(env)).not.toContain('private-')
    expect(env.PATH).toBe('/fixture/bin')
    expect(env.FORKVDO_DASHSCOPE_API_KEY).toBe('workflow-key')
  })
  it('encrypts independently and rejects wrong keys, modified ciphertext and relocated revisions', () => {
    const key = randomBytes(32).toString('base64')
    const secret = { apiKey: 'fixture-private-key' }
    const a = encryptSecrets(secret, key, 'revision-a')
    const b = encryptSecrets(secret, key, 'revision-a')
    expect(a).not.toEqual(b)
    expect(a).not.toContain(secret.apiKey)
    expect(decryptSecrets(a, key, 'revision-a')).toEqual(secret)
    expect(() => decryptSecrets(a, key, 'revision-b')).toThrow()
    expect(() => decryptSecrets(a, randomBytes(32).toString('base64'), 'revision-a')).toThrow()
    const parts = a.split('.')
    parts[3] = `${parts[3]!.slice(0, -5)}AAAAA`
    expect(() => decryptSecrets(parts.join('.'), key, 'revision-a')).toThrow()
  })
  it('rejects credentials embedded in URLs and defaults outside model selection', () => {
    const input = { name: 'fixture', kind: 'text', provider: 'openai-compatible', settings: { baseUrl: 'https://user:password@example.invalid/v1', defaultModel: 'writer', models: ['writer'] } }
    expect(connectionSchema.safeParse(input).success).toBe(false)
    input.settings.baseUrl = 'https://example.invalid/v1'
    input.settings.defaultModel = 'unknown'
    expect(connectionSchema.safeParse(input).success).toBe(false)
  })
  it('keeps text and video input schemas distinct', () => {
    expect(runRequestSchema.safeParse({ kind: 'text', connectionId: '00000000-0000-4000-8000-000000000001', model: 'writer', input: { provider: 'dashscope', prompt: 'not text' } }).success).toBe(false)
  })
})
