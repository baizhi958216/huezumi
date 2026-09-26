import { describe, expect, it } from 'vitest'
import { mergeSettingsPatch, settingsSchema } from '../server/services/platform/config-schemas'

const connectionId = '11111111-1111-4111-8111-111111111111'
describe('platform settings field updates', () => {
  it('preserves operating policy when assigning a service', () => {
    const current = settingsSchema.parse({ registrationMode: 'disabled', signupCredits: 42, platformDailyCreditBudget: 800 })
    expect(mergeSettingsPatch(current, { defaultTextConnectionId: connectionId })).toEqual({ ...current, defaultTextConnectionId: connectionId })
  })
  it('removes only the explicitly cleared assignment', () => {
    const current = settingsSchema.parse({ defaultTextConnectionId: connectionId, defaultImageConnectionId: connectionId })
    const next = mergeSettingsPatch(current, { defaultTextConnectionId: null })
    expect(next.defaultTextConnectionId).toBeUndefined()
    expect(next.defaultImageConnectionId).toBe(connectionId)
  })
  it('preserves service assignments and custom values when changing one policy', () => {
    const current = settingsSchema.parse({ defaultTextConnectionId: connectionId, signupCredits: 75, userMaxActiveGenerations: 8 })
    expect(mergeSettingsPatch(current, { registrationMode: 'open' })).toEqual({ ...current, registrationMode: 'open' })
  })
  it('rejects unknown fields, null policy and invalid references', () => {
    const current = settingsSchema.parse({})
    for (const patch of [{ secret: 'value' }, { signupCredits: null }, { defaultTextConnectionId: '' }, { userMaxActiveGenerations: 0 }])
      expect(() => mergeSettingsPatch(current, patch)).toThrow()
  })
})
