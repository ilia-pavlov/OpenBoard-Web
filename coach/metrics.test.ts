import { describe, expect, it } from 'vitest'
import type { Player } from '../src/models'
import { groupSummary, parseMemberIDs, playerRow, recentResults, sortRows } from './metrics'

const now = new Date(2026, 9, 3)
const daysAgo = (n: number) => new Date(2026, 9, 3 - n)

const player = (id: string, name: string, regular: number | undefined, events: Player['events']): Player => ({
  id, name, state: 'NJ', ratings: { regular: regular != null ? { value: regular } : undefined }, events, ratingHistory: [],
})

const alex = player('99000001', 'Alex Rivera', 1450, [
  { key: 'a', id: '202609260001', section: 1, name: 'Fall Quads', date: daysAgo(7), regular: { pre: 1420, post: 1450 } },
  { key: 'b', id: '202608010001', section: 2, name: 'Summer Open', date: daysAgo(50), regular: { pre: 1400, post: 1420 } },
  { key: 'c', id: '202501010001', name: 'Old Event', date: daysAgo(640), regular: { pre: 1000, post: 1400 } },
])
const sam = player('99000002', 'Sam Taylor', undefined, [
  { key: 'd', id: '202609260001', section: 1, name: 'Fall Quads', date: daysAgo(7), quick: { pre: 800, post: 790 } },
])

describe('playerRow', () => {
  it('summarizes the last event and the last 90 days', () => {
    expect(playerRow(alex, now)).toMatchObject({ regular: 1450, lastChange: 30, recentChange: 50, recentEvents: 2 })
  })

  it('handles players without a regular rating', () => {
    expect(playerRow(sam, now)).toMatchObject({ regular: undefined, lastChange: undefined, recentChange: 0, recentEvents: 1 })
  })
})

describe('groupSummary', () => {
  it('averages only rated players and totals the group', () => {
    expect(groupSummary([playerRow(alex, now), playerRow(sam, now)])).toEqual({ players: 2, averageRegular: 1450, recentChange: 50, recentEvents: 3 })
  })
})

describe('recentResults', () => {
  it('groups players by event, newest first, within the window', () => {
    const results = recentResults([alex, sam], now)
    expect(results.map((r) => [r.name, r.players.map((p) => p.name)])).toEqual([
      ['Fall Quads', ['Alex Rivera', 'Sam Taylor']],
      ['Summer Open', ['Alex Rivera']],
    ])
    expect(results[0].players[1]).toMatchObject({ pre: 800, post: 790 }) // quick when there's no regular
  })
})

describe('sortRows', () => {
  it('sorts by a column and keeps missing values last', () => {
    const rows = [playerRow(sam, now), playerRow(alex, now)]
    expect(sortRows(rows, 'regular', true).map((r) => r.name)).toEqual(['Alex Rivera', 'Sam Taylor'])
    expect(sortRows(rows, 'regular', false).map((r) => r.name)).toEqual(['Alex Rivera', 'Sam Taylor'])
    expect(sortRows(rows, 'name', false).map((r) => r.name)).toEqual(['Alex Rivera', 'Sam Taylor'])
  })
})

describe('parseMemberIDs', () => {
  it('finds 8-digit IDs in pasted text, once each', () => {
    expect(parseMemberIDs('99000001, 99000002\n99000001\t123\n990000033')).toEqual(['99000001', '99000002'])
  })
})
