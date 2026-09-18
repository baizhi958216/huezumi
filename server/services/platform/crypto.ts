import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function keyFrom(value: string) {
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32 || key.toString('base64') !== value)
    throw new Error('NUXT_CONNECTION_ENCRYPTION_KEY must be a base64 encoded 32-byte key')
  return key
}
export function encryptSecrets(value: unknown, masterKey: string, context: string) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(masterKey), nonce)
  cipher.setAAD(Buffer.from(context))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', nonce.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
}
export function decryptSecrets(value: string, masterKey: string, context: string): unknown {
  const [version, nonce, tag, payload] = value.split('.')
  if (version !== 'v1' || !nonce || !tag || !payload)
    throw new Error('Invalid encrypted connection')
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(masterKey), Buffer.from(nonce, 'base64'))
  decipher.setAAD(Buffer.from(context))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8')) as unknown
}
