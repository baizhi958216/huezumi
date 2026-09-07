import type { GenerationRequest } from '../shared/types/generation'
import assert from 'node:assert/strict'
import { it } from 'vitest'
import { calculateGenerationCredits } from '../shared/utils/pricing'

function request(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    provider: 'runway',
    model: 'test-model',
    prompt: 'test',
    resolution: '720P',
    aspectRatio: '16:9',
    duration: 6,
    media: [],
    ...overrides,
  }
}

it('combines output, input-video and image charges with upward rounding', () => {
  const result = calculateGenerationCredits({
    fixedCredits: 2,
    outputSecondCredits: 1.25,
    inputVideoSecondCredits: 0.5,
    referenceImageCredits: 3,
  }, request({
    media: [
      { type: 'reference_video', url: 'https://example.com/input.mp4', duration: 7 },
      { type: 'first_frame', url: 'https://example.com/a.png' },
      { type: 'reference_image', url: 'https://example.com/b.png' },
    ],
  }))
  assert.equal(result, 19)
})

it('uses exact duration tiers before linear fields', () => {
  assert.equal(calculateGenerationCredits({ durationTiers: { 6: 9 }, outputSecondCredits: 100 }, request()), 9)
})

it('uses the configured automatic-duration ceiling and minimum charge', () => {
  assert.equal(calculateGenerationCredits({ outputSecondCredits: 0.1, minimumCredits: 5 }, request({ duration: 0 })), 5)
})
