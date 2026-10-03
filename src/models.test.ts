import { describe, expect, it } from 'vitest'
import {
  type APIMember, type APIMemberSection, capitalizedIfShouty, classTitle, isProvisional, mapPlayer, mapSummary,
  parseDate, peakRegular, topPercent,
} from './models'

const member: APIMember = {
  id: '12345678',
  firstName: 'ILIA',
  lastName: 'PAVLOV',
  stateRep: 'CA',
  jurisdiction: 'CA-N',
  rank: 2000,
  stateRank: 150,
  ratings: [
    { ratingSystem: 'R', rating: 1450, floor: 1200, isProvisional: false },
    { ratingSystem: 'Q', rating: 1380, gamesPlayed: 12, isProvisional: true },
    { ratingSystem: 'B', isProvisional: true },
  ],
}

const sections: APIMemberSection[] = [
  {
    event: { id: '202601010001', name: 'WINTER OPEN', startDate: '2026-01-01' },
    ratingRecords: [{ ratingSource: 'R', preRating: 1400, postRating: 1420 }],
  },
  {
    event: { id: '202603150002', name: 'Spring Quads', startDate: '2026-03-15' },
    ratingRecords: [
      { ratingSource: 'R', preRating: 1420, postRating: 1450 },
      { ratingSource: 'Q', preRating: 1360, postRating: 1380 },
    ],
  },
]

const maxRanks = [
  { ratingSource: 'R', maxRank: 70000 },
  { ratingSource: 'R', maxRank: 4000, jurisdiction: 'CA-N' },
  { ratingSource: 'Q', maxRank: 50000 },
]

describe('mapPlayer', () => {
  const player = mapPlayer(member, sections, maxRanks)

  it('title-cases shouty names', () => {
    expect(player.name).toBe('Ilia Pavlov')
  })

  it('sorts events newest first and title-cases their names', () => {
    expect(player.events.map((e) => e.name)).toEqual(['Spring Quads', 'Winter Open'])
    expect(player.events[0].quick).toEqual({ pre: 1360, post: 1380, games: undefined })
  })

  it('builds the regular series oldest first, starting from the first pre-rating', () => {
    expect(player.ratingHistory).toEqual([1400, 1420, 1450])
  })

  it('looks up the state total by jurisdiction, which splits big states', () => {
    expect(player.ranking).toEqual({
      overall: { rank: 2000, total: 70000 },
      state: { rank: 150, total: 4000 },
      stateName: 'CA',
    })
  })

  it('keeps the provisional flag the API sends', () => {
    expect(player.ratings.regular).toMatchObject({ value: 1450, provisional: false })
    expect(player.ratings.blitz?.value).toBeUndefined()
  })
})

describe('isProvisional', () => {
  it('trusts the API flag, since the API omits the game count for established players', () => {
    expect(isProvisional({ value: 2846, provisional: false })).toBe(false)
  })

  it('falls back to the 26-game rule without a flag', () => {
    expect(isProvisional({ value: 900, games: 10 })).toBe(true)
    expect(isProvisional({ value: 900, games: 40 })).toBe(false)
  })
})

describe('helpers', () => {
  it('leaves mixed-case names alone', () => {
    expect(capitalizedIfShouty('McDonald Open')).toBe('McDonald Open')
    expect(capitalizedIfShouty('NJ STATE OPEN')).toBe('Nj State Open')
  })

  it('maps ratings to USCF classes', () => {
    expect(classTitle(2846)).toBe('Senior Master')
    expect(classTitle(2200)).toBe('National Master')
    expect(classTitle(1799)).toBe('Class B')
    expect(classTitle(383)).toBe('Class I')
    expect(classTitle(150)).toBe('Class J')
  })

  it('never reports top 0%', () => {
    expect(topPercent({ rank: 2, total: 73930 })).toBe(1)
    expect(topPercent({ rank: 58224, total: 76379 })).toBe(76)
  })

  it('parses API dates as local calendar days', () => {
    const d = parseDate('2026-09-18')!
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 18])
    expect(parseDate(undefined)).toBeNull()
  })

  it('includes the published rating in the peak', () => {
    const player = mapPlayer({ ...member, ratings: [{ ratingSystem: 'R', rating: 1500 }] }, sections, maxRanks)
    expect(peakRegular(player)).toBe(1500)
  })

  it('summarizes a member for search results', () => {
    expect(mapSummary(member)).toEqual({ id: '12345678', name: 'Ilia Pavlov', state: 'CA', regular: 1450 })
  })
})
