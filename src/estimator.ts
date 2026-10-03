// Estimates how much each rated game moved a player's rating. Port of
// OpenBoard's RoundRatingEstimator.swift.
//
// US Chess only publishes a player's total change for the whole event, so
// per-round numbers are an estimate: each game gets the Elo "surprise"
// (actual score − expected score from pre-event ratings), and the official
// event change is split across games in that proportion. Rounded values
// always add up exactly to the official change.

import type { EventSection, RatingSystem, RoundOutcome, Standing } from './models'
import { delta } from './models'

export interface Estimates {
  /** Which rating the estimates are for (Regular unless the section is quick-only). */
  system: RatingSystem
  /** member ID → round number → estimated change. */
  byMember: Map<string, Map<number, number>>
}

/** Fallback K-factor when the event change can't be split proportionally. */
const fallbackK = 32
/** Proportional splits steeper than this are treated as bonus-driven. */
const maxK = 400

const resultFor = (s: Standing, system: RatingSystem) => (system === 'regular' ? s.regular : s.quick)

/** The rating a player went in with; new players use their first published rating. */
export function entryRating(s: Standing, system: RatingSystem): number | undefined {
  const r = resultFor(s, system)
  return r?.pre ?? r?.post
}

export function estimate(section: EventSection): Estimates {
  const system: RatingSystem = section.players.some((p) => p.regular?.post != null) ? 'regular' : 'quick'
  const byRank = new Map<number, Standing>()
  for (const p of section.players) if (!byRank.has(p.rank)) byRank.set(p.rank, p)

  const byMember = new Map<string, Map<number, number>>()
  for (const player of section.players) {
    const total = delta(resultFor(player, system))
    const own = entryRating(player, system)
    if (total == null || own == null) continue

    // (round, actual − expected) for each rated game against a rated opponent.
    const games: { round: number; surprise: number }[] = []
    for (const outcome of player.rounds) {
      const s = score(outcome.symbol)
      const opponent = outcome.opponentRank != null ? byRank.get(outcome.opponentRank) : undefined
      const theirs = opponent && entryRating(opponent, system)
      if (s == null || theirs == null) continue
      const expected = 1 / (1 + 10 ** ((theirs - own) / 400))
      games.push({ round: outcome.round, surprise: s - expected })
    }
    if (!games.length) continue

    const rounded = roundPreservingSum(split(total, games.map((g) => g.surprise)), total)
    byMember.set(player.id, new Map(games.map((g, i) => [g.round, rounded[i]])))
  }
  return { system, byMember }
}

export function score(symbol: RoundOutcome['symbol']): number | undefined {
  return symbol === 'W' ? 1 : symbol === 'D' ? 0.5 : symbol === 'L' ? 0 : undefined // byes, forfeits, unplayed
}

/** Unrounded per-game changes that sum to `total`. */
export function split(total: number, surprises: number[]): number[] {
  const sum = surprises.reduce((a, b) => a + b, 0)
  // Proportional when the games explain the change: same sign, meaningful size.
  if (total !== 0 && Math.abs(sum) >= 0.25 && total > 0 === sum > 0 && Math.abs(total / sum) <= maxK) {
    const k = total / sum
    return surprises.map((s) => s * k)
  }
  // Otherwise: a standard K per game, with the remainder (bonus points,
  // cancelling results) spread evenly.
  const remainder = (total - fallbackK * sum) / surprises.length
  return surprises.map((s) => fallbackK * s + remainder)
}

/** Rounds each value to an integer so they still add up to `total` (largest-remainder method). */
export function roundPreservingSum(values: number[], total: number): number[] {
  const result = values.map(Math.floor)
  let missing = total - result.reduce((a, b) => a + b, 0)
  const byRemainder = values.map((_, i) => i).sort((a, b) => values[b] - Math.floor(values[b]) - (values[a] - Math.floor(values[a])))
  for (let i = 0; missing > 0 && byRemainder.length; i++, missing--) result[byRemainder[i % byRemainder.length]] += 1
  return result
}
