import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { textCreationInternals } from '../server/services/text-creation'

describe('text creation contracts', () => {
  it('exposes only valid server-side connections', () => {
    const result = textCreationInternals.parseConnections(JSON.stringify({
      cloud: { label: 'Cloud', baseUrl: 'https://example.invalid/v1', apiKey: 'secret', defaultModel: 'writer-1' },
      local: { baseUrl: 'http://127.0.0.1:1234/v1', auth: 'none', defaultModel: 'local-writer' },
      missingKey: { baseUrl: 'https://example.invalid/v1', defaultModel: 'writer-2' },
      malformed: 'not-an-object',
    }))

    assert.deepEqual(Object.keys(result), ['cloud', 'local'])
    assert.equal(result.cloud?.apiKey, 'secret')
  })

  it('accepts fenced structured output and preserves downstream scene data', () => {
    const content = textCreationInternals.parseGeneratedContent(`\`\`\`json
      {
        "title": "雨夜来客",
        "summary": "一次送餐改变了两个人。",
        "content": "第一幕……",
        "characters": [{"name": "林禾", "profile": "二十七岁，黄色雨衣，谨慎而善良。"}],
        "scenes": [{"title": "雨巷", "visual": "霓虹倒映在积水中", "action": "林禾停车", "dialogue": "到了。"}],
        "keywords": ["悬疑", "雨夜"]
      }
    \`\`\``)

    assert.equal(content.characters[0]?.name, '林禾')
    assert.equal(content.scenes[0]?.visual, '霓虹倒映在积水中')
  })

  it('rejects incomplete model output instead of saving a partial document', () => {
    assert.throws(() => textCreationInternals.parseGeneratedContent('{"title":"缺字段"}'))
  })
})
