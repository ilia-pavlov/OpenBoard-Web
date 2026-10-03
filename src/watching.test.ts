import { beforeEach, describe, expect, it } from 'vitest'
import { prefs } from './ui'

// Node 25 ships its own (unconfigured) localStorage global, which shadows the
// test DOM's; give the tests a plain in-memory one.
const memory = new Map<string, string>()
const storage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
}
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })

const player = (memberID: string) => ({ memberID, name: `Player ${memberID}` })

describe('watched players', () => {
  beforeEach(() => localStorage.clear())

  it('makes the first player watched primary (My Card)', () => {
    expect(prefs.toggleWatch(player('1'))).toBe(true)
    prefs.toggleWatch(player('2'))
    expect(prefs.primary).toBe('1')
    expect(prefs.watched.map((r) => [r.memberID, r.isPrimary])).toEqual([['1', true], ['2', false]])
  })

  it('hands the crown to the next player when My Card is unfollowed', () => {
    prefs.toggleWatch(player('1'))
    prefs.toggleWatch(player('2'))
    expect(prefs.toggleWatch(player('1'))).toBe(false)
    expect(prefs.primary).toBe('2')
  })

  it('moves a new primary to the top', () => {
    ;['1', '2', '3'].forEach((id) => prefs.toggleWatch(player(id)))
    prefs.setPrimary('3')
    expect(prefs.watched.map((r) => r.memberID)).toEqual(['3', '1', '2'])
    expect(prefs.watched.filter((r) => r.isPrimary)).toHaveLength(1)
  })

  it('carries over a My Card player saved before Watching existed', () => {
    localStorage.setItem('primaryMemberID', JSON.stringify('12641216'))
    expect(prefs.primary).toBe('12641216')
    expect(localStorage.getItem('primaryMemberID')).toBeNull()
    expect(prefs.watched).toHaveLength(1)
  })
})
