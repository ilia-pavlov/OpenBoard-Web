import { describe, expect, it } from 'vitest'
import { stateCodeIn } from './states'

describe('stateCodeIn', () => {
  it('reads the state from a place', () => {
    expect(stateCodeIn('Glen Rock, New Jersey')).toBe('NJ')
    expect(stateCodeIn('Princeton, NJ')).toBe('NJ')
    expect(stateCodeIn('Washington, District of Columbia')).toBe('DC')
    expect(stateCodeIn('08540')).toBeUndefined()
    expect(stateCodeIn('')).toBeUndefined()
  })
})
