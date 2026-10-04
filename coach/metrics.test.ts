import { describe, expect, it } from 'vitest'
import type { Player } from '../src/models'
import { chartSeries, groupSummary, lastRatedText, playerRow, resultsByEvent, resultsByPlayer, sortRows } from './metrics'

const now = new Date(2026, 9, 3)
const daysAgo = (n: number) => new Date(2026, 9, 3 - n)

const player = (id: string, name: string, ratings: Player['ratings'], events: Player['events']): Player => ({
  id, name, state: 'NJ', ratings, events, ratingHistory: [],
})

// Published 1420 (last supplement); the Fall Quads rating since then makes the live rating 1450.
const alex = player('99000001', 'Alex Rivera', { regular: { value: 1420 }, quick: { value: 1300 }, blitz: { value: 1250 } }, [
  { key: 'a', id: '202609260001', section: 1, name: 'Fall Quads', date: daysAgo(7), regular: { pre: 1420, post: 1450 }, quick: { pre: 1300, post: 1310 } },
  { key: 'b', id: '202608010001', section: 2, name: 'Summer Open', date: daysAgo(50), regular: { pre: 1400, post: 1420 } },
  { key: 'c', id: '202501010001', name: 'Old Event', date: daysAgo(640), regular: { pre: 1000, post: 1400 } },
])
const sam = player('99000002', 'Sam Taylor', { quick: { value: 790 } }, [
  { key: 'd', id: '202609260001', section: 1, name: 'Fall Quads', date: daysAgo(7), quick: { pre: 800, post: 790 } },
])

describe('playerRow', () => {
  it('shows published and live ratings, and changes over the period', () => {
    expect(playerRow(alex, 'regular', 90, now)).toMatchObject({ published: 1420, live: 1450, lastChange: 30, periodChange: 50, periodEvents: 2 })
    expect(playerRow(alex, 'regular', 30, now)).toMatchObject({ periodChange: 30, periodEvents: 1 })
    expect(playerRow(alex, 'regular', 0, now)).toMatchObject({ periodChange: 450, periodEvents: 3 })
  })

  it('switches rating type', () => {
    expect(playerRow(alex, 'quick', 90, now)).toMatchObject({ published: 1300, live: 1310, lastChange: 10, periodEvents: 1 })
  })

  it('shows Blitz as published only, since US Chess has no per-tournament Blitz results', () => {
    expect(playerRow(alex, 'blitz', 90, now)).toMatchObject({ published: 1250, live: 1250, lastChange: undefined, periodChange: undefined, periodEvents: 0 })
  })

  it('handles players without a rating of that type', () => {
    expect(playerRow(sam, 'regular', 90, now)).toMatchObject({ published: undefined, live: undefined, periodChange: 0, periodEvents: 0 })
  })
})

describe('groupSummary', () => {
  it('averages live ratings of rated players and totals the group', () => {
    expect(groupSummary([playerRow(alex, 'quick', 90, now), playerRow(sam, 'quick', 90, now)])).toEqual({ players: 2, averageLive: 1050, periodChange: 0, periodEvents: 2 })
  })
})

describe('results', () => {
  it('groups players by event, newest first, within the period', () => {
    const results = resultsByEvent([alex, sam], 'regular', 90, now)
    expect(results.map((r) => [r.name, r.players.map((p) => p.name)])).toEqual([
      ['Fall Quads', ['Alex Rivera', 'Sam Taylor']],
      ['Summer Open', ['Alex Rivera']],
    ])
    expect(results[0].players[1]).toMatchObject({ pre: 800, post: 790 }) // quick when there's no regular
  })

  it('lists each player\'s latest events, most recently active first', () => {
    const byPlayer = resultsByPlayer([sam, alex], 'regular', 90, now)
    expect(byPlayer.map((p) => [p.name, p.events.map((e) => e.name)])).toEqual([
      ['Sam Taylor', ['Fall Quads']],
      ['Alex Rivera', ['Fall Quads', 'Summer Open']],
    ])
  })
})

describe('chartSeries', () => {
  it('gives each player\'s rating after every event in the period, oldest first', () => {
    const [a, s] = chartSeries([alex, sam], 'regular', 90, now)
    expect(a.points.map((p) => p.rating)).toEqual([1420, 1450])
    expect(s.points).toEqual([])
  })
})

describe('sortRows', () => {
  it('sorts by a column and keeps missing values last', () => {
    const rows = [playerRow(sam, 'regular', 90, now), playerRow(alex, 'regular', 90, now)]
    expect(sortRows(rows, 'live', true).map((r) => r.name)).toEqual(['Alex Rivera', 'Sam Taylor'])
    expect(sortRows(rows, 'live', false).map((r) => r.name)).toEqual(['Alex Rivera', 'Sam Taylor'])
    expect(sortRows(rows, 'name', false).map((r) => r.name)).toEqual(['Alex Rivera', 'Sam Taylor'])
  })
})

describe('lastRatedText', () => {
  it('uses days for the last year and a month and year before that', () => {
    expect(lastRatedText(daysAgo(6), now)).toBe('6 days ago')
    expect(lastRatedText(new Date(2006, 5, 10), now)).toBe('Jun 2006')
    expect(lastRatedText(null, now)).toBe('never')
  })
})
