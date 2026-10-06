import { describe, expect, it } from 'vitest'
import { type Player, provisionalStatus, provisionalText } from './models'

const player = (ratings: Player['ratings'], events: Player['events'] = []): Player => ({ id: '99000001', name: 'Alex Rivera', ratings, events, ratingHistory: [] })
const event = (key: string, regular: { pre: number; post: number; games?: number }) => ({ key, id: key, name: key, date: new Date(2026, 9, 4), regular })

describe('provisionalStatus', () => {
  it('counts live games from the latest tournament and keeps the official count', () => {
    // Official list: 15 games. Two tournaments since then bring the live count to 22.
    const p = player({ regular: { value: 422, games: 15, provisional: true } }, [
      event('oct4', { pre: 529, post: 546, games: 22 }),
      event('sep27', { pre: 422, post: 529, games: 19 }),
    ])
    expect(provisionalStatus(p, 'regular')).toEqual({
      provisional: true,
      liveGames: 22,
      liveRemaining: 4,
      officialProvisional: true,
      officialGames: 15,
      officialRemaining: 11,
    })
    expect(provisionalText(provisionalStatus(p, 'regular'))).toBe('Provisional · 4 games to go')
  })

  it('treats a missing count after a tournament as established', () => {
    const p = player({ regular: { value: 1500, games: 24, provisional: true } }, [event('e', { pre: 1490, post: 1500 })])
    const s = provisionalStatus(p, 'regular')!
    expect(s.provisional).toBe(false)
    expect(s.officialProvisional).toBe(true)
    expect(provisionalText(s)).toBe('Established (official from the next list)')
  })

  it('uses the official count when there are no tournament results (Blitz, or no events)', () => {
    const p = player({ blitz: { value: 900, games: 10, provisional: true } })
    expect(provisionalStatus(p, 'blitz')).toMatchObject({ provisional: true, liveGames: 10, liveRemaining: 16 })
  })

  it('reports established players and unrated ones', () => {
    expect(provisionalText(provisionalStatus(player({ regular: { value: 2846, provisional: false } }), 'regular'))).toBe('Established')
    expect(provisionalStatus(player({}), 'quick')).toBeUndefined()
  })
})
