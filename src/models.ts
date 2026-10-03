// Wire types for ratings-api.uschess.org and their mapping to the domain
// models the UI uses. Port of OpenBoard's USCFAPITypes.swift + DomainModels.swift:
// if US Chess renames fields, fix it HERE — the domain types must not change.

// MARK: - Wire types

export interface APIPage<T> {
  items: T[]
  hasNextPage?: boolean
  offset?: number
  pageSize?: number
}

export interface APIMember {
  id: string
  firstName?: string
  lastName?: string
  stateRep?: string
  jurisdiction?: string
  rank?: number
  stateRank?: number
  ratings?: APIMemberRating[]
}

interface APIMemberRating {
  ratingSystem?: string // "R" "Q" "B" "OR" "OQ" "OB"
  rating?: number
  gamesPlayed?: number
  isProvisional?: boolean
  floor?: number
}

export interface APIMemberSection {
  sectionNumber?: number
  sectionName?: string
  startDate?: string
  endDate?: string
  ratingRecords?: APIRatingRecord[]
  event?: { id?: string; name?: string; startDate?: string; stateCode?: string }
}

interface APIRatingRecord {
  preRating?: number
  postRating?: number
  ratingSource?: string // "R" / "Q" on member sections
  ratingSystem?: string // "R" / "Q" on standings
  postProvisionalGameCount?: number
}

export interface APIMaxRank {
  ratingSource?: string
  maxRank?: number
  jurisdiction?: string // absent = national
}

// MARK: - Domain

export type RatingSystem = 'regular' | 'quick'

export interface Rating {
  value?: number
  floor?: number
  games?: number
  /** From the API; it omits `games` for established players. */
  provisional?: boolean
}

export interface PrePost {
  pre?: number
  post?: number
  games?: number
}

export interface EventResult {
  id: string
  name: string
  date: Date | null
  regular?: PrePost
  quick?: PrePost
}

export interface RankSlot {
  rank: number
  total: number
}

export interface Player {
  id: string
  name: string
  state?: string
  ratings: { regular?: Rating; quick?: Rating; blitz?: Rating }
  ranking?: { overall?: RankSlot; state?: RankSlot; stateName?: string }
  /** Newest first. */
  events: EventResult[]
  /** Regular-rating series, oldest → newest, for the sparkline. */
  ratingHistory: number[]
}

export interface PlayerSummary {
  id: string
  name: string
  state?: string
  regular?: number
}

// MARK: - Domain helpers

export const isProvisional = (r: Rating) => r.provisional ?? (r.games ?? 0) < 26
export const delta = (p?: PrePost) => (p?.pre != null && p.post != null ? p.post - p.pre : undefined)
export const resultFor = (e: EventResult, system: RatingSystem) => (system === 'regular' ? e.regular : e.quick)
export const hasHistory = (p: Player, system: RatingSystem) => p.events.some((e) => resultFor(e, system)?.post != null)
export const firstName = (p: Player) => p.name.split(' ')[0] || p.name

export function peakRegular(p: Player): number | undefined {
  const all = [...p.ratingHistory, ...(p.ratings.regular?.value != null ? [p.ratings.regular.value] : [])]
  return all.length ? Math.max(...all) : undefined
}

/** "Top N%" for a rank, never below 1% (rank 2 of 73,930 is top 1%, not 0%). */
export const topPercent = (s: RankSlot) => Math.max(1, 100 - Math.round(((s.total - s.rank) / Math.max(s.total, 1)) * 100))

/** USCF class title from the regular rating. */
export function classTitle(rating: number): string {
  const classes: [number, string][] = [
    [2400, 'Senior Master'], [2200, 'National Master'], [2000, 'Expert'],
    [1800, 'Class A'], [1600, 'Class B'], [1400, 'Class C'], [1200, 'Class D'],
    [1000, 'Class E'], [800, 'Class F'], [600, 'Class G'], [400, 'Class H'], [200, 'Class I'],
  ]
  return classes.find(([min]) => rating >= min)?.[1] ?? 'Class J'
}

// MARK: - Mapping

/** "2026-09-18" → local midnight that day (dates carry no time zone). */
export function parseDate(s?: string): Date | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}

/** USCF stores many names in ALL CAPS; title-case those, leave mixed case alone. */
export function capitalizedIfShouty(s: string): string {
  if (!s || s !== s.toUpperCase()) return s
  return s.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export const fullName = (first?: string, last?: string) =>
  capitalizedIfShouty([first, last].filter(Boolean).join(' '))

function ratings(api?: APIMemberRating[]): Player['ratings'] {
  const pick = (system: string): Rating | undefined => {
    const r = api?.find((x) => x.ratingSystem === system)
    return r && { value: r.rating, floor: r.floor, games: r.gamesPlayed, provisional: r.isProvisional }
  }
  return { regular: pick('R'), quick: pick('Q'), blitz: pick('B') }
}

function eventResults(sections: APIMemberSection[]): EventResult[] {
  return sections
    .map((section, i) => {
      const records = section.ratingRecords ?? []
      const prePost = (system: string): PrePost | undefined => {
        const r = records.find((x) => (x.ratingSource ?? x.ratingSystem) === system)
        return r && { pre: r.preRating, post: r.postRating, games: r.postProvisionalGameCount }
      }
      return {
        id: section.event?.id ?? `section-${i}`,
        name: section.event?.name ? capitalizedIfShouty(section.event.name) : section.sectionName ?? 'Rated Event',
        date: parseDate(section.event?.startDate ?? section.startDate),
        regular: prePost('R'),
        quick: prePost('Q'),
      }
    })
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
}

/** Oldest pre-rating followed by each post-rating, oldest → newest. */
function history(events: EventResult[]): number[] {
  const chronological = [...events].reverse()
  const series: number[] = []
  const firstPre = chronological[0]?.regular?.pre
  if (firstPre != null) series.push(firstPre)
  for (const e of chronological) if (e.regular?.post != null) series.push(e.regular.post)
  return series
}

export function mapPlayer(member: APIMember, sections: APIMemberSection[], maxRanks: APIMaxRank[]): Player {
  const state = member.stateRep ?? member.jurisdiction
  // Rank totals are keyed by jurisdiction, which splits big states ("CA-N").
  const regionTotal = (j?: string) =>
    maxRanks.find((r) => r.ratingSource === 'R' && r.jurisdiction === j)?.maxRank ?? 0
  const events = eventResults(sections)
  return {
    id: member.id,
    name: fullName(member.firstName, member.lastName),
    state,
    ratings: ratings(member.ratings),
    ranking:
      member.rank != null || member.stateRank != null
        ? {
            overall: member.rank != null ? { rank: member.rank, total: regionTotal(undefined) } : undefined,
            state:
              member.stateRank != null
                ? { rank: member.stateRank, total: regionTotal(member.jurisdiction ?? state) }
                : undefined,
            stateName: state,
          }
        : undefined,
    events,
    ratingHistory: history(events),
  }
}

export function mapSummary(member: APIMember): PlayerSummary {
  return {
    id: member.id,
    name: fullName(member.firstName, member.lastName),
    state: member.stateRep ?? member.jurisdiction,
    regular: member.ratings?.find((r) => r.ratingSystem === 'R')?.rating,
  }
}
