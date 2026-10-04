// What the coach dashboard shows about players and groups, computed from the
// same Player data the family app uses, for a chosen rating type and period.
// Pure functions, unit-tested.

import type { EventResult, Player, PrePost } from '../src/models'

const day = 86_400_000

export type RatingType = 'regular' | 'quick' | 'blitz'
export const ratingTypes: Record<RatingType, string> = { regular: 'Regular', quick: 'Quick', blitz: 'Blitz' }

/** Period choices, in days (0 = all time). */
export const periods = { 30: '30 days', 90: '90 days', 180: '6 months', 365: '1 year', 730: '2 years', 0: 'All time' } as const
export type PeriodDays = keyof typeof periods

/** The event's result for a rating type. US Chess publishes per-event results for Regular and Quick only. */
export const resultOf = (e: EventResult, type: RatingType): PrePost | undefined =>
  type === 'regular' ? e.regular : type === 'quick' ? e.quick : undefined

const hasChange = (r?: PrePost): r is PrePost & { pre: number; post: number } => r?.pre != null && r.post != null

export interface PlayerRow {
  id: string
  name: string
  state?: string
  /** The official rating from the latest monthly supplement. */
  published?: number
  /** Including events rated since the supplement (the latest event's post rating). */
  live?: number
  /** Change at the latest event rated in this type. */
  lastChange?: number
  /** Net change over the period. */
  periodChange?: number
  /** Events rated in this type during the period. */
  periodEvents: number
  /** The latest rated event of any type. */
  lastRated: Date | null
}

export const sinceOf = (days: PeriodDays, now = new Date()) => (days ? now.getTime() - days * day : -Infinity)

export function playerRow(p: Player, type: RatingType, days: PeriodDays, now = new Date()): PlayerRow {
  const since = sinceOf(days, now)
  const published = p.ratings[type]?.value
  const latest = p.events.find((e) => resultOf(e, type)?.post != null)
  const inPeriod = p.events.filter((e) => resultOf(e, type)?.post != null && (e.date?.getTime() ?? 0) >= since)
  const changes = inPeriod.map((e) => resultOf(e, type)).filter(hasChange)
  const last = p.events.map((e) => resultOf(e, type)).find(hasChange)
  return {
    id: p.id,
    name: p.name,
    state: p.state,
    published,
    live: latest ? resultOf(latest, type)!.post : published,
    lastChange: last ? last.post - last.pre : undefined,
    periodChange: type === 'blitz' ? undefined : changes.reduce((sum, r) => sum + (r.post - r.pre), 0),
    periodEvents: inPeriod.length,
    lastRated: p.events[0]?.date ?? null,
  }
}

export interface GroupSummary {
  players: number
  averageLive?: number
  periodChange: number
  periodEvents: number
}

export function groupSummary(rows: PlayerRow[]): GroupSummary {
  const rated = rows.filter((r) => r.live != null)
  return {
    players: rows.length,
    averageLive: rated.length ? Math.round(rated.reduce((s, r) => s + r.live!, 0) / rated.length) : undefined,
    periodChange: rows.reduce((s, r) => s + (r.periodChange ?? 0), 0),
    periodEvents: rows.reduce((s, r) => s + r.periodEvents, 0),
  }
}

/** Filter by how a tournament went for the player. */
export const resultFilters = { all: 'All results', up: 'Gained', down: 'Lost', even: 'No change' } as const
export type ResultFilter = keyof typeof resultFilters

export const matchesResult = (filter: ResultFilter, change: number) =>
  filter === 'all' || (filter === 'up' && change > 0) || (filter === 'down' && change < 0) || (filter === 'even' && change === 0)

export interface ResultRow {
  eventID?: string
  section?: number
  event: string
  date: Date | null
  playerID: string
  playerName: string
  pre: number
  post: number
  change: number
}

/**
 * Every tournament result in the period for a rating type (one row per player
 * per tournament), newest first, filtered by result and optionally one player.
 */
export function resultRows(
  players: Player[],
  type: RatingType,
  days: PeriodDays,
  result: ResultFilter = 'all',
  playerID?: string,
  now = new Date(),
): ResultRow[] {
  const since = sinceOf(days, now)
  const rows: ResultRow[] = []
  for (const p of players) {
    if (playerID && p.id !== playerID) continue
    for (const e of p.events) {
      const r = resultOf(e, type)
      if (!hasChange(r) || (e.date?.getTime() ?? 0) < since) continue
      const change = r.post - r.pre
      if (!matchesResult(result, change)) continue
      rows.push({ eventID: e.id, section: e.section, event: e.name, date: e.date, playerID: p.id, playerName: p.name, pre: r.pre, post: r.post, change })
    }
  }
  return rows.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0) || a.playerName.localeCompare(b.playerName))
}

export interface ChartSeries {
  id: string
  name: string
  points: { date: Date; rating: number; event: string; pre?: number }[]
}

/** Each player's rating after every event in the period, oldest first, for the group chart. */
export function chartSeries(players: Player[], type: RatingType, days: PeriodDays, now = new Date()): ChartSeries[] {
  const since = sinceOf(days, now)
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    points: p.events
      .filter((e) => e.date && e.date.getTime() >= since && resultOf(e, type)?.post != null)
      .map((e) => ({ date: e.date!, rating: resultOf(e, type)!.post!, event: e.name, pre: resultOf(e, type)!.pre }))
      .reverse(),
  }))
}

export type SortKey = 'name' | 'published' | 'live' | 'lastChange' | 'periodChange' | 'periodEvents' | 'lastRated'

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

/** "6 days ago" for recent dates, "Jun 2006" once it's been more than a year. */
export function lastRatedText(date: Date | null, now = new Date()): string {
  if (!date) return 'never'
  const days = Math.floor((now.getTime() - date.getTime()) / day)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days <= 365) return `${days} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
