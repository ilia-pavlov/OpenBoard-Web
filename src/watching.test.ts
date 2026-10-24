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

describe('saved schools and clubs', () => {
  beforeEach(() => localStorage.clear())

  it('saves, lists in order, and unsaves', () => {
    expect(prefs.toggleSavedClub({ id: 'H6043396', name: 'Oak Hall School Chess Club', state: 'FL' })).toBe(true)
    expect(prefs.toggleSavedClub({ id: 'A5002346', name: 'Marshall Chess Club', state: 'NY' })).toBe(true)
    expect(prefs.savedClubs.map((c) => c.id)).toEqual(['H6043396', 'A5002346'])
    expect(prefs.isClubSaved('A5002346')).toBe(true)
    expect(prefs.toggleSavedClub({ id: 'H6043396', name: 'Oak Hall School Chess Club' })).toBe(false)
    prefs.removeSavedClub('A5002346')
    expect(prefs.savedClubs).toEqual([])
  })
})

describe('my school', () => {
  beforeEach(() => localStorage.clear())

  it('keeps one school as mine, separate from other saved ones', () => {
    prefs.toggleSavedClub({ id: 'A5002346', name: 'Marshall Chess Club' })
    prefs.setMyClub({ id: 'H6014810', name: 'International Chess Academy' })
    expect(prefs.myClub?.id).toBe('H6014810')
    expect(prefs.savedClubs.map((c) => [c.id, c.isMine])).toEqual([['H6014810', true], ['A5002346', false]])
    prefs.setMyClub({ id: 'A5002346', name: 'Marshall Chess Club' })
    expect(prefs.savedClubs.map((c) => [c.id, c.isMine])).toEqual([['A5002346', true], ['H6014810', false]])
    prefs.setMyClub(null)
    expect(prefs.myClub).toBeUndefined()
    expect(prefs.savedClubs).toHaveLength(2)
  })

  it('unsaving My School removes it', () => {
    prefs.setMyClub({ id: 'H6014810', name: 'International Chess Academy' })
    expect(prefs.toggleSavedClub({ id: 'H6014810', name: 'International Chess Academy' })).toBe(false)
    expect(prefs.myClub).toBeUndefined()
  })
})
