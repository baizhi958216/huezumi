import { expect, it } from 'vitest'
import { connectionSchema, connectionValidationMessage } from '../server/services/platform/config-schemas'

const connection = { name: '视频服务', kind: 'video', provider: 'dashscope', settings: { models: ['wan3.0-video'], defaultModel: 'wan3.0' } }
it('explains an obsolete default model instead of a generic parameter error', () => {
  const parsed = connectionSchema.safeParse(connection)
  expect(parsed.success).toBe(false)
  if (!parsed.success) {
    expect(parsed.error.issues[0]?.path).toEqual(['settings', 'defaultModel'])
    expect(connectionValidationMessage(parsed.error)).toBe('默认模型必须属于模型列表，请重新选择默认模型')
  }
})
it('accepts a default chosen from the connection model list', () => {
  expect(connectionSchema.safeParse({ ...connection, settings: { ...connection.settings, defaultModel: 'wan3.0-video' } }).success).toBe(true)
})
it('identifies an invalid address without disclosing the rejected value', () => {
  const parsed = connectionSchema.safeParse({ ...connection, settings: { ...connection.settings, defaultModel: 'wan3.0-video', baseUrl: 'private-invalid-address' } })
  expect(parsed.success).toBe(false)
  if (!parsed.success)
    expect(connectionValidationMessage(parsed.error)).toBe('连接基地址无效，请检查输入')
})
