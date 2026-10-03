// Best wins: the highest-rated opponents a player has beaten in Regular play,
// rated as they were going into that event. Port of OpenBoard's BestWins
// (DomainModels.swift) and bestWinsScan (CacheStore.swift).

import { fetchPlayer, fetchRegularPreRatings, fetchRegularWins } from './api'
import type { NotableWin, RatedWin, RatedWins } from './models'
import { cached, read } from './store'

/** One section of a rated event, e.g. section 2 of event 202312050922. */
export interface SectionKey {
  eventID: string
  section: number
}

const keyOf = (k: SectionKey) => `${k.eventID}-${k.section}`

/**
 * Beating someone this far above your own rating is vanishingly rare (an
 * expected score around 1%), so it bounds where a better win can be.
 */
export const maxUpset = 800

function isBetter(a: NotableWin, b: NotableWin): boolean {
  if (a.opponentRating !== b.opponentRating) return a.opponentRating > b.opponentRating
  return (a.date?.getTime() ?? 0) > (b.date?.getTime() ?? 0)
}

/**
 * The highest-rated opponents beaten, one entry per opponent (their best rating
 * when beaten more than once), newest first among equal ratings. Wins over
 * opponents unrated at the time are skipped.
 */
export function rank(
  wins: RatedWin[],
  playerID: string,
  preRatings: Map<string, Record<string, number>>,
  limit: number,
): NotableWin[] {
  const best = new Map<string, NotableWin>()
  for (const win of wins) {
    const ratings = preRatings.get(keyOf(win))
    const opponentRating = ratings?.[win.opponentID]
    if (!ratings || opponentRating == null) continue
    const candidate: NotableWin = { ...win, opponentRating, playerRating: ratings[playerID] }
    const current = best.get(win.opponentID)
    if (current && !isBetter(candidate, current)) continue
    best.set(win.opponentID, candidate)
  }
  return [...best.values()].sort((a, b) => (isBetter(a, b) ? -1 : isBetter(b, a) ? 1 : 0)).slice(0, limit)
}

/**
 * Sections to check, strongest first: by the player's own pre-event rating,
 * newest first among equals. Sections with no known rating go last, since
 * they can't be ruled out early.
 */
export function scanOrder(wins: RatedWin[], playerRatings: Record<string, number>): SectionKey[] {
  const newest = new Map<string, { key: SectionKey; time: number }>()
  for (const win of wins) {
    const id = keyOf(win)
    const time = win.date?.getTime() ?? 0
    const seen = newest.get(id)
    if (!seen || time > seen.time) newest.set(id, { key: { eventID: win.eventID, section: win.section }, time })
  }
  return [...newest.values()]
    .sort((a, b) => {
      const x = playerRatings[a.key.eventID]
      const y = playerRatings[b.key.eventID]
      if (x != null && y != null && x !== y) return y - x
      if (x != null && y == null) return -1
      if (x == null && y != null) return 1
      return b.time - a.time
    })
    .map((e) => e.key)
}

/**
 * True once `best` is full and a player rated `nextPlayerRating` would need an
 * upset beyond `maxUpset` to beat anyone better than its last entry. Sections
 * come strongest first, so every later one is ruled out too.
 */
export function canStop(best: NotableWin[], limit: number, nextPlayerRating?: number): boolean {
  const floor = best[best.length - 1]?.opponentRating
  if (best.length < limit || floor == null || nextPlayerRating == null) return false
  return nextPlayerRating + maxUpset < floor
}

// MARK: - Scan

export interface Progress {
  wins: NotableWin[]
  gameCount: number
  eventsChecked: number
  eventsTotal: number
  isFinished: boolean
}

/** New wins only arrive when an event is rated; a few hours is fresh enough. */
const winsTTL = 6 * 60 * 60 * 1000
/** Pause between uncached sections, to stay well inside the API's rate limit. */
const scanSpacing = 1000

const winsKey = (memberID: string) => `wins-${memberID}`
const preRatingsKey = (k: SectionKey) => `prerating-${k.eventID}-${k.section}`

/**
 * Checks each section with a win, strongest first, reporting as wins are found.
 * Uncached sections are paced and kept for good, so a stopped scan resumes
 * where it left off. A section that fails to load is skipped.
 *
 * `cachedOnly` makes no requests: it reports what earlier scans found (for a
 * paused scan), never finishing.
 */
export async function scan(
  memberID: string,
  onProgress: (p: Progress) => void,
  { signal, cachedOnly = false, limit = 3 }: { signal: AbortSignal; cachedOnly?: boolean; limit?: number },
): Promise<void> {
  const record = cachedOnly
    ? await read<RatedWins>(winsKey(memberID))
    : await cached(winsKey(memberID), winsTTL, () => fetchRegularWins(memberID))
  if (!record || signal.aborted) return

  const playerRatings: Record<string, number> = {}
  if (!cachedOnly) {
    const player = await fetchPlayer(memberID).catch(() => undefined)
    for (const e of player?.events ?? []) if (e.id && e.regular?.pre != null) playerRatings[e.id] = e.regular.pre
  }

  const order = scanOrder(record.wins, playerRatings)
  const preRatings = new Map<string, Record<string, number>>()
  let best: NotableWin[] = []
  let checked = 0
  const report = (isFinished: boolean) =>
    onProgress({ wins: best, gameCount: record.gameCount, eventsChecked: checked, eventsTotal: order.length, isFinished })

  report(false)
  for (const key of order) {
    if (signal.aborted) return
    if (!cachedOnly && canStop(best, limit, playerRatings[key.eventID])) break
    const saved = await read<Record<string, number>>(preRatingsKey(key))
    if (saved) {
      preRatings.set(keyOf(key), saved)
    } else if (cachedOnly) {
      continue
    } else {
      try {
        preRatings.set(keyOf(key), await cached(preRatingsKey(key), Infinity, () => fetchRegularPreRatings(key.eventID, key.section)))
      } catch {
        // Skipped; a later scan retries it.
      }
      if (signal.aborted) return
      await new Promise((resolve) => setTimeout(resolve, scanSpacing))
    }
    checked += 1
    best = rank(record.wins, memberID, preRatings, limit)
    report(false)
  }
  if (!signal.aborted) report(!cachedOnly)
}
