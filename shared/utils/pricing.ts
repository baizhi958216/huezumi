import type { GenerationRequest } from '../types/generation'

export interface PriceFormula {
  fixedCredits?: number
  outputSecondCredits?: number
  inputVideoSecondCredits?: number
  referenceImageCredits?: number
  minimumCredits?: number
  durationTiers?: Record<string, number>
}

export function calculateGenerationCredits(formula: PriceFormula, request: GenerationRequest) {
  const outputDuration = request.duration > 0 ? request.duration : 30
  const inputVideoDuration = request.media
    .filter(item => item.type === 'reference_video')
    .reduce((total, item) => total + (item.duration || 0), 0)
  const referenceImages = request.media.filter(item => ['first_frame', 'last_frame', 'reference_image'].includes(item.type)).length
  const tier = formula.durationTiers?.[String(outputDuration)]
  const calculated = tier ?? (
    (formula.fixedCredits || 0)
    + outputDuration * (formula.outputSecondCredits || 0)
    + inputVideoDuration * (formula.inputVideoSecondCredits || 0)
    + referenceImages * (formula.referenceImageCredits || 0)
  )
  return Math.max(Math.ceil(calculated), formula.minimumCredits || 0, 1)
}
