import assert from 'node:assert/strict'
import { it } from 'vitest'
import { mediaSignatureMatches } from '../server/utils/media-signature'

it('accepts matching PNG and MP4 signatures', () => {
  assert.equal(mediaSignatureMatches(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]), 'image/png'), true)
  assert.equal(mediaSignatureMatches(Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D]), 'video/mp4'), true)
})

it('rejects executable or mismatched declarations', () => {
  const executable = new TextEncoder().encode('#!/bin/sh\necho unsafe')
  assert.equal(mediaSignatureMatches(executable, 'video/mp4'), false)
  assert.equal(mediaSignatureMatches(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]), 'video/mp4'), false)
})
