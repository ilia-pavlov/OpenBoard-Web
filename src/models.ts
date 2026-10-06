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

export interface APIRatedEvent {
  id: string
  name?: string
  startDate?: string
  endDate?: string
  sections?: { number: number; name?: string }[]
}

export interface APIStanding {
  ordinal?: number
  memberId?: string
  firstName?: string
  lastName?: string
  stateRep?: string
  score?: number
  ratings?: APIRatingRecord[]
  roundOutcomes?: APIRoundOutcome[]
}

interface APIRoundOutcome {
  roundNumber?: number
  outcome?: string // "Win" / "Loss" / "Draw" / "Bye" / "WinForfeit" / …
  color?: string
  opponentOrdinal?: number
  opponentFirstName?: string
  opponentLastName?: string
}

/** One game from `members/{id}/games`: who played whom and the result. No ratings: those come from standings. */
export interface APIMemberGame {
  section?: { number?: number }
  event?: { id?: string; name?: string; startDate?: string; endDate?: string }
  ratingSystem?: string // "R" regular, "D" dual (regular + quick), "Q", "B", "OR", …
  player?: { outcome?: string }
  opponent?: { id?: string; firstName?: string; lastName?: string; outcome?: string }
}

export interface APITopListDefinition {
  id: string
  name?: string
  ratingSource?: string
  minAge?: number
  maxAge?: number
  gender?: string
  fideUsaOnly?: boolean
}

export interface APITopList {
  reportDate?: string
  topPlayers?: { ordinal?: number; rating?: number; id?: string; firstName?: string; lastName?: string; stateRep?: string }[]
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
  /** Unique per row: a player can play several sections of one event. */
  key: string
  /** The US Chess event ID, when known. */
  id?: string
  section?: number
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

export interface RoundOutcome {
  round: number
  symbol: 'W' | 'L' | 'D' | 'B' | '–'
  color?: string
  opponentRank?: number
  opponentName?: string
}

export interface Standing {
  id: string
  rank: number
  name: string
  state?: string
  points: string
  regular?: PrePost
  quick?: PrePost
  rounds: RoundOutcome[]
}

export interface EventSection {
  number: number
  name: string
  players: Standing[]
}

export interface ChessEvent {
  id: string
  name: string
  date: Date | null
  sections: EventSection[]
}

/** A rated Regular win (dual-rated included), before the opponent's rating is known. */
export interface RatedWin {
  opponentID: string
  opponentName: string
  eventID: string
  eventName: string
  section: number
  date: Date | null
}

/** A player's Regular games: how many, and which were wins. */
export interface RatedWins {
  gameCount: number
  wins: RatedWin[]
}

/** A win with both players' Regular ratings going into that event. */
export interface NotableWin extends RatedWin {
  opponentRating: number
  /** The player's own pre-event rating; undefined while they were unrated. */
  playerRating?: number
}

// MARK: - Top 100 lists (monthly, by rating type / age / gender)

export type TopListRating = 'R' | 'Q' | 'B'
export const topListRatingTitle: Record<TopListRating, string> = { R: 'Regular', Q: 'Quick', B: 'Blitz' }

export interface TopListDefinition {
  id: string // "Regular8", "WomensRegular10", "QuickUnder13"
  name: string // "Age 8", "Girls Age 10", "Quick Under Age 13"
  rating: TopListRating
  minAge?: number
  maxAge?: number
  isWomen: boolean
}

export interface TopListEntry {
  id: string
  rank: number
  name: string
  state?: string
  rating: number
}

export interface TopList {
  definition: TopListDefinition
  reportDate: Date | null
  entries: TopListEntry[]
}

/** Where a player appears on a list: what a badge shows. */
export interface TopListRank {
  definition: TopListDefinition
  rank: number
}

/** Age group without the rating or gender word: "Age 8", "Under Age 13", "Overall". */
export function ageGroup(d: TopListDefinition): string {
  let label = d.name
  for (const prefix of ['Quick ', 'Blitz ', 'Top Women ', 'Women ', 'Girls ']) {
    if (label.startsWith(prefix)) label = label.slice(prefix.length)
  }
  if (label === 'Women' || label === 'Overall' || !label) return 'Overall'
  return label.replace('and Over', 'and over')
}

/** Short label for badges: "Age 8", "Girls Age 10", "US Top 100", "Top Women". */
export function badgeLabel(d: TopListDefinition): string {
  const group = ageGroup(d)
  if (group === 'Overall') return d.isWomen ? 'Top Women' : 'US Top 100'
  if (d.isWomen) return d.name.startsWith('Girls') ? d.name : `Women ${group}`
  return group
}

/** Sort key: youngest first, then Under-N groups, overall, and seniors. */
export function sortKey(d: TopListDefinition): number {
  const { minAge, maxAge } = d
  if (maxAge != null && minAge == null && maxAge < 10) return maxAge // "7 and under"
  if (minAge != null && minAge === maxAge) return minAge // single age
  if (maxAge != null && minAge == null) return 100 + maxAge // Under N
  if (minAge == null && maxAge == null) return 200 // Overall
  return 300 + (minAge ?? 0) // 50+, 65+
}

/** Regular/Quick/Blitz over-the-board lists for US players; online lists and "any federation" duplicates are skipped. */
export function mapTopListDefinitions(api: APITopListDefinition[]): TopListDefinition[] {
  return api.flatMap((d) => {
    const rating = d.ratingSource as TopListRating
    if (d.fideUsaOnly === false || !['R', 'Q', 'B'].includes(rating)) return []
    return [{ id: d.id, name: d.name ?? d.id, rating, minAge: d.minAge, maxAge: d.maxAge, isWomen: d.gender === 'Female' }]
  })
}

export function mapTopList(api: APITopList, definition: TopListDefinition): TopList {
  return {
    definition,
    reportDate: parseDate(api.reportDate),
    entries: (api.topPlayers ?? []).flatMap((p) =>
      p.id && p.ordinal != null && p.rating != null
        ? [{ id: p.id, rank: p.ordinal, name: fullName(p.firstName, p.lastName), state: p.stateRep, rating: p.rating }]
        : [],
    ),
  }
}

export interface PlayerSummary {
  id: string
  name: string
  state?: string
  regular?: number
}

// MARK: - Domain helpers

export const isProvisional = (r: Rating) => r.provisional ?? (r.games ?? 0) < 26

/** A US Chess rating stays provisional until it's based on this many games. */
export const establishedAfter = 26

export interface ProvisionalStatus {
  /** Provisional now, counting tournaments rated since the official list. */
  provisional: boolean
  /** Games counted so far, live (after the latest tournament). */
  liveGames?: number
  /** Games still needed to become established, live. */
  liveRemaining?: number
  /** Provisional on the official monthly list. */
  officialProvisional: boolean
  officialGames?: number
  officialRemaining?: number
}

/**
 * How far a player's rating is from established, live and official. US Chess
 * gives the official count on the member's rating (as of the monthly list) and
 * the live count on each tournament result (postProvisionalGameCount); an
 * established rating has no count. Undefined when the player has no rating of
 * that type yet.
 */
export function provisionalStatus(p: Player, system: 'regular' | 'quick' | 'blitz'): ProvisionalStatus | undefined {
  const official = p.ratings[system]
  const latest = system === 'blitz' ? undefined : p.events.map((e) => (system === 'regular' ? e.regular : e.quick)).find((r) => r?.post != null)
  if (official?.value == null && !latest) return undefined
  const remaining = (games?: number) => (games != null ? Math.max(0, establishedAfter - games) : undefined)
  const officialProvisional = official?.value != null && official.provisional !== false && isProvisional(official)
  const officialGames = officialProvisional ? official?.games : undefined
  // The latest tournament is newer than the official list: its count is the live one.
  // No count on it means the rating is established.
  const liveGames = latest ? latest.games : officialGames
  const provisional = latest ? latest.games != null && latest.games < establishedAfter : officialProvisional
  return {
    provisional,
    liveGames: provisional ? liveGames : undefined,
    liveRemaining: provisional ? remaining(liveGames) : undefined,
    officialProvisional,
    officialGames,
    officialRemaining: officialProvisional ? remaining(officialGames) : undefined,
  }
}

/** "Provisional · 4 games to go", "Established", or "" for no rating. */
export function provisionalText(status: ProvisionalStatus | undefined): string {
  if (!status) return ''
  if (!status.provisional) return status.officialProvisional ? 'Established (official from the next list)' : 'Established'
  const left = status.liveRemaining
  return left != null ? `Provisional · ${left} ${left === 1 ? 'game' : 'games'} to go` : 'Provisional'
}
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
      return {
        key: `${section.event?.id ?? 'event'}-${section.sectionNumber ?? i}`,
        id: section.event?.id,
        section: section.sectionNumber,
        name: section.event?.name ? capitalizedIfShouty(section.event.name) : section.sectionName ?? 'Rated Event',
        date: parseDate(section.event?.startDate ?? section.startDate),
        regular: prePostFrom(section.ratingRecords, 'R'),
        quick: prePostFrom(section.ratingRecords, 'Q'),
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

function prePostFrom(records: APIRatingRecord[] | undefined, system: string): PrePost | undefined {
  const r = records?.find((x) => (x.ratingSource ?? x.ratingSystem) === system)
  return r && { pre: r.preRating, post: r.postRating, games: r.postProvisionalGameCount }
}

const roundSymbols: Record<string, RoundOutcome['symbol']> = {
  Win: 'W', Loss: 'L', Draw: 'D', Bye: 'B', FullPointBye: 'B', HalfPointBye: 'B',
}

export function mapStanding(api: APIStanding, index: number): Standing {
  const score = api.score ?? 0
  return {
    id: api.memberId ?? `player-${index}`,
    rank: api.ordinal ?? 0,
    name: fullName(api.firstName, api.lastName),
    state: api.stateRep,
    points: Number.isInteger(score) ? score.toFixed(1) : String(score),
    regular: prePostFrom(api.ratings, 'R'),
    quick: prePostFrom(api.ratings, 'Q'),
    rounds: (api.roundOutcomes ?? [])
      .filter((r) => r.roundNumber != null)
      .map((r) => ({
        round: r.roundNumber!,
        symbol: roundSymbols[r.outcome ?? ''] ?? '–',
        color: r.color,
        opponentRank: r.opponentOrdinal || undefined,
        opponentName: fullName(r.opponentFirstName, r.opponentLastName) || undefined,
      }))
      .sort((a, b) => a.round - b.round),
  }
}

export function mapEvent(api: APIRatedEvent, standings: Map<number, APIStanding[]>): ChessEvent {
  return {
    id: api.id,
    name: api.name ? capitalizedIfShouty(api.name) : `Event ${api.id}`,
    date: parseDate(api.endDate ?? api.startDate),
    sections: [...(api.sections ?? [])]
      .sort((a, b) => a.number - b.number)
      .map((ref) => ({
        number: ref.number,
        name: ref.name || `Section ${ref.number}`,
        players: (standings.get(ref.number) ?? []).map(mapStanding),
      })),
  }
}

/** A Regular-rated win (regular or dual-rated game), or undefined for anything else. */
export function mapRegularWin(game: APIMemberGame): RatedWin | undefined {
  const opponentID = game.opponent?.id
  const eventID = game.event?.id
  const section = game.section?.number
  if (game.player?.outcome !== 'Win' || !['R', 'D'].includes(game.ratingSystem ?? '') || !opponentID || !eventID || section == null) {
    return undefined
  }
  return {
    opponentID,
    opponentName: fullName(game.opponent?.firstName, game.opponent?.lastName),
    eventID,
    eventName: game.event?.name ? capitalizedIfShouty(game.event.name) : `Event ${eventID}`,
    section,
    date: parseDate(game.event?.endDate ?? game.event?.startDate),
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
