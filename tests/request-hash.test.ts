import assert from 'node:assert/strict'
import { it } from 'vitest'
import { requestHash } from '../server/utils/request-hash'

it('request hashes are stable across object key order', () => {
  const left = { provider: 'runway', prompt: 'hello', nested: { b: 2, a: 1 } }
  const right = { nested: { a: 1, b: 2 }, prompt: 'hello', provider: 'runway' }
  assert.equal(requestHash(left), requestHash(right))
})

it('request hashes change when a billable field changes', () => {
  assert.notEqual(requestHash({ duration: 6 }), requestHash({ duration: 10 }))
})
