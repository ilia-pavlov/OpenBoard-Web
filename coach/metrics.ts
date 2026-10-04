// What the coach dashboard shows about players and groups, computed from the
// same Player data the family app uses. Pure functions, unit-tested.

import type { Player } from '../src/models'

const day = 86_400_000

export interface PlayerRow {
  id: string
  name: string
  state?: string
  regular?: number
  quick?: number
  blitz?: number
  /** Regular change at the latest Regular-rated event. */
  lastChange?: number
  /** Net Regular change over the window (90 days by default). */
  recentChange: number
  /** Rated events (any rating) in the window. */
  recentEvents: number
  lastRated: Date | null
}

/** Best-available regular rating: the published value, or the latest event's post rating. */
const currentRegular = (p: Player) => p.ratings.regular?.value ?? p.events.find((e) => e.regular?.post != null)?.regular?.post

export function playerRow(p: Player, now = new Date(), windowDays = 90): PlayerRow {
  const since = now.getTime() - windowDays * day
  const recent = p.events.filter((e) => (e.date?.getTime() ?? 0) >= since)
  const lastRegular = p.events.find((e) => e.regular?.pre != null && e.regular.post != null)?.regular
  return {
    id: p.id,
    name: p.name,
    state: p.state,
    regular: currentRegular(p),
    quick: p.ratings.quick?.value,
    blitz: p.ratings.blitz?.value,
    lastChange: lastRegular ? lastRegular.post! - lastRegular.pre! : undefined,
    recentChange: recent.reduce((sum, e) => sum + (e.regular?.pre != null && e.regular.post != null ? e.regular.post - e.regular.pre : 0), 0),
    recentEvents: recent.length,
    lastRated: p.events[0]?.date ?? null,
  }
}

export interface GroupSummary {
  players: number
  averageRegular?: number
  recentChange: number
  recentEvents: number
}

export function groupSummary(rows: PlayerRow[]): GroupSummary {
  const rated = rows.filter((r) => r.regular != null)
  return {
    players: rows.length,
    averageRegular: rated.length ? Math.round(rated.reduce((s, r) => s + r.regular!, 0) / rated.length) : undefined,
    recentChange: rows.reduce((s, r) => s + r.recentChange, 0),
    recentEvents: rows.reduce((s, r) => s + r.recentEvents, 0),
  }
}

export interface GroupResult {
  eventID: string
  section?: number
  name: string
  date: Date | null
  players: { id: string; name: string; pre?: number; post?: number }[]
}

/** Recently rated events with every group member who played in them, newest first. */
export function recentResults(players: Player[], now = new Date(), windowDays = 60, limit = 8): GroupResult[] {
  const since = now.getTime() - windowDays * day
  const byEvent = new Map<string, GroupResult>()
  for (const p of players) {
    for (const e of p.events) {
      if (!e.id || (e.date?.getTime() ?? 0) < since) continue
      const result = byEvent.get(e.id) ?? { eventID: e.id, section: e.section, name: e.name, date: e.date, players: [] }
      if (!result.players.some((x) => x.id === p.id)) {
        result.players.push({ id: p.id, name: p.name, pre: e.regular?.pre ?? e.quick?.pre, post: e.regular?.post ?? e.quick?.post })
      }
      byEvent.set(e.id, result)
    }
  }
  return [...byEvent.values()].sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)).slice(0, limit)
}

export type SortKey = 'name' | 'regular' | 'quick' | 'blitz' | 'lastChange' | 'recentChange' | 'recentEvents' | 'lastRated'

/** Rows sorted by a column; players without a value go last either way. */
export function sortRows(rows: PlayerRow[], key: SortKey, descending: boolean): PlayerRow[] {
  const value = (r: PlayerRow): string | number | undefined =>
    key === 'name' ? r.name.toLowerCase() : key === 'lastRated' ? r.lastRated?.getTime() : r[key]
  return [...rows].sort((a, b) => {
    const x = value(a)
    const y = value(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    const order = x < y ? -1 : x > y ? 1 : 0
    return descending ? -order : order
  })
}

/** 8-digit member IDs in pasted text (commas, spaces, new lines, a copied spreadsheet column…). */
export const parseMemberIDs = (text: string) => [...new Set(text.match(/\b\d{8}\b/g) ?? [])]
