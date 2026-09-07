import assert from 'node:assert/strict'
import { it } from 'vitest'
import { hashPassword, hashToken, normalizeEmail, verifyPassword } from '../server/utils/auth'

it('normalizes email addresses correctly', () => {
  assert.equal(normalizeEmail('  User@Example.COM  '), 'user@example.com')
})

it('generates deterministic sha256 token hashes', () => {
  const hash1 = hashToken('session-secret-token')
  const hash2 = hashToken('session-secret-token')
  assert.equal(hash1, hash2)
  assert.equal(hash1.length, 64)
})

it('hashes and verifies passwords using scrypt with salt', async () => {
  const password = 'CorrectHorseBatteryStaple123!'
  const hashed = await hashPassword(password)
  assert.match(hashed, /^scrypt:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)

  const verified = await verifyPassword(password, hashed)
  assert.equal(verified, true)

  const wrongPassword = await verifyPassword('WrongPassword123!', hashed)
  assert.equal(wrongPassword, false)
})

it('rejects malformed password hashes gracefully', async () => {
  assert.equal(await verifyPassword('test', 'plain:password'), false)
  assert.equal(await verifyPassword('test', 'not-even-formatted'), false)
  assert.equal(await verifyPassword('test', ''), false)
})
