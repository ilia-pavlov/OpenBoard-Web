import { describe, expect, it } from 'vitest'
import { canStop, maxUpset, rank, scanOrder } from './bestwins'
import { mapRegularWin, type NotableWin, type RatedWin } from './models'

const win = (opponentID: string, eventID: string, section: number, day: number): RatedWin => ({
  opponentID,
  opponentName: opponentID.toUpperCase(),
  eventID,
  eventName: `Event ${eventID}`,
  section,
  date: new Date(2026, 0, day),
})

describe('rank', () => {
  const wins = [win('a', 'e1', 1, 1), win('b', 'e1', 1, 1), win('a', 'e2', 2, 5), win('c', 'e3', 1, 9)]
  const preRatings = new Map<string, Record<string, number>>([
    ['e1-1', { me: 1200, a: 1500, b: 1400 }],
    ['e2-2', { me: 1300, a: 1600 }],
    ['e3-1', { me: 1350 }], // c was unrated: skipped
  ])

  it('keeps one entry per opponent, at their best rating, strongest first', () => {
    const best = rank(wins, 'me', preRatings, 3)
    expect(best.map((w) => [w.opponentID, w.opponentRating, w.playerRating])).toEqual([
      ['a', 1600, 1300],
      ['b', 1400, 1200],
    ])
  })

  it('cuts to the limit', () => {
    expect(rank(wins, 'me', preRatings, 1)).toHaveLength(1)
  })

  it('ignores sections not checked yet', () => {
    expect(rank(wins, 'me', new Map(), 3)).toEqual([])
  })
})

describe('scanOrder', () => {
  it('checks the sections where the player was strongest first, unknown ratings last', () => {
    const wins = [win('a', 'old', 1, 1), win('b', 'strong', 1, 2), win('c', 'unknown', 1, 3), win('d', 'strong', 1, 2)]
    expect(scanOrder(wins, { old: 1000, strong: 1400 })).toEqual([
      { eventID: 'strong', section: 1 },
      { eventID: 'old', section: 1 },
      { eventID: 'unknown', section: 1 },
    ])
  })

  it('orders equal ratings newest first', () => {
    const wins = [win('a', 'jan', 1, 1), win('b', 'mar', 1, 60)]
    expect(scanOrder(wins, {}).map((k) => k.eventID)).toEqual(['mar', 'jan'])
  })
})

describe('canStop', () => {
  const best = [1900, 1800, 1700].map((opponentRating) => ({ opponentRating }) as NotableWin)

  it('stops once no later section could hold a better win', () => {
    expect(canStop(best, 3, 1700 - maxUpset - 1)).toBe(true)
    expect(canStop(best, 3, 1700 - maxUpset)).toBe(false)
  })

  it('keeps going while the list is short or the rating is unknown', () => {
    expect(canStop(best.slice(0, 2), 3, 100)).toBe(false)
    expect(canStop(best, 3, undefined)).toBe(false)
  })
})

describe('mapRegularWin', () => {
  const game = {
    section: { number: 2 },
    event: { id: '202603150153', name: 'SPRING OPEN', endDate: '2026-03-15' },
    ratingSystem: 'D',
    player: { outcome: 'Win' },
    opponent: { id: '99000001', firstName: 'ALEX', lastName: 'RIVERA' },
  }

  it('keeps regular and dual-rated wins', () => {
    expect(mapRegularWin(game)).toMatchObject({ opponentID: '99000001', opponentName: 'Alex Rivera', section: 2, eventName: 'Spring Open' })
  })

  it('drops losses and quick-only games', () => {
    expect(mapRegularWin({ ...game, player: { outcome: 'Loss' } })).toBeUndefined()
    expect(mapRegularWin({ ...game, ratingSystem: 'Q' })).toBeUndefined()
  })
})
