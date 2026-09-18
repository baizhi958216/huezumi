import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import { hashToken } from '../server/utils/auth'

describe('invitations logic', () => {
  it('hashes invitation codes consistently with auth register validation', () => {
    const code = 'VDO-TESTCODE123'
    const hash = hashToken(code)
    assert.equal(hash.length, 64)
    assert.equal(hash, hashToken('VDO-TESTCODE123'))
    assert.notEqual(hash, hashToken('vdo-testcode123'))
  })

  it('validates custom invitation code regex format', () => {
    const regex = /^[\w-]+$/
    expect(regex.test('VIP2026')).toBe(true)
    expect(regex.test('VIP-2026')).toBe(true)
    expect(regex.test('VIP_2026')).toBe(true)
    expect(regex.test('VIP 2026')).toBe(false)
    expect(regex.test('VIP@2026')).toBe(false)
    expect(regex.test('VIP!2026')).toBe(false)
  })

  it('correctly determines invitation status', () => {
    const now = new Date()
    const past = new Date(now.getTime() - 86400000)
    const future = new Date(now.getTime() + 86400000)

    function computeStatus(item: { usedAt: Date | null, expiresAt: Date | null }) {
      if (item.usedAt) {
        return 'used'
      }
      if (item.expiresAt && item.expiresAt < now) {
        return 'expired'
      }
      return 'active'
    }

    expect(computeStatus({ usedAt: past, expiresAt: future })).toBe('used')
    expect(computeStatus({ usedAt: null, expiresAt: past })).toBe('expired')
    expect(computeStatus({ usedAt: null, expiresAt: future })).toBe('active')
    expect(computeStatus({ usedAt: null, expiresAt: null })).toBe('active')
  })
})
