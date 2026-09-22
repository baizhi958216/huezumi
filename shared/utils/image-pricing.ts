import type { PriceFormula } from './pricing'

export function isImagePrice(formula: PriceFormula) {
  return Number.isFinite(formula.fixedCredits) && formula.fixedCredits! > 0
    && !formula.outputSecondCredits && !formula.inputVideoSecondCredits
    && !formula.referenceImageCredits && !Object.keys(formula.durationTiers || {}).length
}
export function imageCredits(formula: PriceFormula, count: number) {
  if (!isImagePrice(formula) || !Number.isInteger(count) || count < 1 || count > 6)
    throw new Error('Invalid image price')
  const credits = Math.max(Math.ceil(formula.fixedCredits! * count), formula.minimumCredits || 1)
  if (!Number.isSafeInteger(credits) || credits > 2000000000)
    throw new Error('Image price exceeds limit')
  return credits
}
