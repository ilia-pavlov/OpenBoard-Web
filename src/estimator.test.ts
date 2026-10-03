import { describe, expect, it } from 'vitest'
import { estimate, roundPreservingSum, split } from './estimator'
import type { EventSection, Standing } from './models'

const standing = (id: string, rank: number, pre: number, post: number, rounds: Standing['rounds']): Standing => ({
  id, rank, name: id, points: '0.0', regular: { pre, post }, rounds,
})

describe('roundPreservingSum', () => {
  it('rounds so the parts still add up to the total', () => {
    expect(roundPreservingSum([3.4, 3.4, 3.2], 10)).toEqual([4, 3, 3])
    expect(roundPreservingSum([-2.5, -2.5], -5)).toEqual([-2, -3])
  })
})

describe('split', () => {
  it('splits proportionally to each game’s surprise when the games explain the change', () => {
    const parts = split(20, [0.5, 0.25])
    expect(parts[0]).toBeCloseTo(13.33, 1)
    expect(parts[1]).toBeCloseTo(6.67, 1)
  })

  it('falls back to K=32 plus an even remainder when results cancel out', () => {
    const parts = split(10, [0.5, -0.5])
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10)
    expect(parts).toEqual([21, -11])
  })
})

describe('estimate', () => {
  const section: EventSection = {
    number: 1,
    name: 'Open',
    players: [
      standing('a', 1, 1500, 1530, [
        { round: 1, symbol: 'W', opponentRank: 2 },
        { round: 2, symbol: 'W', opponentRank: 3 },
        { round: 3, symbol: 'B' },
      ]),
      standing('b', 2, 1600, 1580, [{ round: 1, symbol: 'L', opponentRank: 1 }]),
      standing('c', 3, 1400, 1390, [{ round: 2, symbol: 'L', opponentRank: 1 }]),
    ],
  }
  const result = estimate(section)

  it('uses the regular rating when anyone in the section has one', () => {
    expect(result.system).toBe('regular')
  })

  it('gives every rated game an estimate that adds up to the official change', () => {
    const a = result.byMember.get('a')!
    expect([...a.keys()]).toEqual([1, 2]) // the bye has none
    expect(a.get(1)! + a.get(2)!).toBe(30)
    expect(a.get(1)!).toBeGreaterThan(a.get(2)!) // beating the stronger player is worth more
  })

  it('estimates the opponent side too', () => {
    expect(result.byMember.get('b')!.get(1)).toBe(-20)
  })
})
