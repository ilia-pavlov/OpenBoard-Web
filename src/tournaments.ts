// Upcoming tournaments come from the US Chess website (new.uschess.org), not
// the ratings API: the "Upcoming Tournaments" search (Tournament Life
// Announcements, with distance search), each announcement's JSON, and the
// "Plan Ahead Calendar" of major events. None of these are an official API, so
// parsing is defensive. Port of OpenBoard's UpcomingTournaments.swift and
// TournamentsService.swift.

import { Params, Patterns, Site } from './endpoints'
import { ApiError } from './api'

// MARK: - Models

/** One row of the US Chess "Upcoming Tournaments" search. */
export interface TournamentListing {
  /** Site path of the announcement, e.g. "/ica-glen-rock-quads-112". */
  id: string
  name: string
  location: string // "Glen Rock, New Jersey"
  organizer: string
  summary: string
  /** Banner line, e.g. "Grand Prix, Enhanced Grand Prix" (empty for most events). */
  banner: string
  startDate: Date | null
  endDate: Date | null
  /** Weekly/monthly series listed as one long date range. */
  isRecurring: boolean
}

/** Full announcement for the detail screen. */
export interface TournamentDetail {
  id: string
  name: string
  startDate: Date | null
  endDate: Date | null
  venueName?: string
  street?: string
  city?: string
  state?: string
  postalCode?: string
  latitude?: number
  longitude?: number
  isOnline: boolean
  isFIDERated: boolean
  banner: string[]
  organizerName?: string
  organizerEmail?: string
  organizerPhone?: string
  organizerWebsite?: string
  /** Best guess at the registration link found in the announcement text. */
  registrationURL?: string
  /** The organizer's announcement HTML, unsanitized: render it through `sanitizeAnnouncement`. */
  bodyHTML: string
}

/** A major event from the Plan Ahead Calendar: national championships and $5,000+ guaranteed prizes. */
export interface MajorEvent {
  year: number
  dates: string // "November 25-29"
  name: string // "US Masters ($25,000 Guaranteed)"
  city: string
  state: string
  isNationalChampionship: boolean
  startDate: Date | null
}

export const majorEventID = (e: MajorEvent) => `${e.year}-${e.dates}-${e.name}`

/** Name without the prize-fund note, for searching announcements. */
export const searchName = (e: MajorEvent) => e.name.replace(/\s*\([^)]*\)/g, '').trim()

export const addressLine = (d: TournamentDetail) => {
  const cityLine = [d.city, [d.state, d.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [d.street, cityLine].filter(Boolean).join(', ') || undefined
}

export const pageURL = (id: string) => Site.publicBase + id

// MARK: - Filters

export const radii = [10, 25, 50, 100, 200, 300, 500] as const
export type Radius = (typeof radii)[number]

export const windows = { any: 'Any time', weekend: 'This weekend', month: 'Next 30 days', threeMonths: 'Next 3 months' } as const
export type UpcomingWindow = keyof typeof windows

/** Inclusive [start, end] range, or undefined for any time. */
export function windowRange(w: UpcomingWindow, now = new Date()): [Date, Date] | undefined {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)
  switch (w) {
    case 'any':
      return undefined
    case 'weekend':
      return [today, days((7 - today.getDay()) % 7)] // today through the coming Sunday
    case 'month':
      return [today, days(30)]
    case 'threeMonths':
      return [today, days(92)]
  }
}

export const kinds = { any: 'Any type', scholastic: 'Scholastic', quads: 'Quads', grandPrix: 'Grand Prix' } as const
export type TournamentKind = keyof typeof kinds

const scholasticWords = ['scholastic', 'k-12', 'k-8', 'k-5', 'k-3', 'grade', 'kids', 'youth', 'junior', 'school']

export function matchesKind(kind: TournamentKind, l: TournamentListing): boolean {
  const text = `${l.name} ${l.summary} ${l.banner}`.toLowerCase()
  switch (kind) {
    case 'any':
      return true
    case 'scholastic':
      return scholasticWords.some((w) => text.includes(w))
    case 'quads':
      return text.includes('quad')
    case 'grandPrix':
      return text.includes('grand prix')
  }
}

/** Whether the listing falls inside `range` (recurring series match if they overlap it). */
export function occursIn(l: TournamentListing, range?: [Date, Date]): boolean {
  if (!range) return true
  if (!l.startDate) return false
  const end = l.endDate ?? l.startDate
  return l.startDate <= range[1] && end >= range[0]
}

// MARK: - Parsing helpers

const entities: Record<string, string> = {
  '&nbsp;': ' ', '&quot;': '"', '&#039;': "'", '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>',
  '&ndash;': '–', '&mdash;': '—', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”', '&hellip;': '…',
}

export function unescape(s: string): string {
  if (!s.includes('&')) return s
  return s
    .replace(/&(nbsp|quot|#0?39|apos|lt|gt|ndash|mdash|rsquo|lsquo|ldquo|rdquo|hellip);/g, (m) => entities[m] ?? m)
    .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex: string, digits: string) => {
      const code = parseInt(digits, hex ? 16 : 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    })
    .replace(/&amp;/g, '&')
}

export const clean = (html: string) =>
  unescape(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

const regex = (pattern: string) => new RegExp(pattern, 'gis')
const captureGroups = (pattern: string, text: string) => [...text.matchAll(regex(pattern))].map((m) => m.slice(1).map((g) => g ?? ''))
const captures = (pattern: string, text: string) => captureGroups(pattern, text).map((g) => g[0])
const capture = (pattern: string, text: string) => captures(pattern, text)[0] as string | undefined

/** "2026-10-09" → local midnight that day. */
function day(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}

// MARK: - Search results page

export function parseListings(html: string): TournamentListing[] {
  return html
    .split(Patterns.listingRow)
    .slice(1)
    .flatMap((row) => {
      const path = capture(Patterns.listingPath, row)
      const name = capture(Patterns.listingName, row)
      if (!path || !name) return []
      const times = captures(Patterns.listingDate, row)
      const start = times[0] ? day(times[0]) : null
      const end = times.length > 1 ? day(times[times.length - 1]) : start
      // A range spanning more than two weeks is a recurring series, not a multi-day event.
      const isRecurring = row.includes('date-recur-occurrences') && !!start && !!end && end.getTime() - start.getTime() > 14 * 86_400_000
      return [
        {
          id: path,
          name: clean(name),
          // Organizers type stray commas/spaces: "Princeton, , New Jersey", "Millburn , New Jersey".
          location: clean(capture(Patterns.listingAddress, row) ?? '').replace(/\s*,(\s*,)*\s*/g, ', '),
          organizer: clean(capture(Patterns.listingOrganizer, row) ?? ''),
          summary: clean(capture(Patterns.listingSummary, row) ?? ''),
          banner: clean(capture(Patterns.listingBanner, row) ?? ''),
          startDate: start,
          endDate: end,
          isRecurring,
        },
      ]
    })
}

/** Highest `page=N` in the pager (0 when there's a single page). */
export const lastPageIndex = (html: string) => Math.max(0, ...captures(Patterns.pagerPage, html).map(Number).filter(Number.isFinite))

/** Dated events soonest first, then recurring series; past events and duplicates across pages removed. */
export function dedupedAndSorted(listings: TournamentListing[], now = new Date()): TournamentListing[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const seen = new Set<string>()
  return listings
    .filter((l) => {
      if (seen.has(l.id)) return false
      seen.add(l.id)
      const last = l.endDate ?? l.startDate
      return !last || last >= today
    })
    .sort((a, b) => {
      if (a.isRecurring !== b.isRecurring) return a.isRecurring ? 1 : -1
      return (a.startDate?.getTime() ?? Infinity) - (b.startDate?.getTime() ?? Infinity)
    })
}

// MARK: - Announcement JSON

type Field<T> = { value?: T }[] | undefined

interface NodeJSON {
  title?: Field<string>
  body?: Field<string>
  field_event_dates?: { value?: string; end_value?: string }[]
  field_event_location_name?: Field<string>
  field_event_address?: { administrative_area?: string; locality?: string; postal_code?: string; address_line1?: string }[]
  field_geofield?: { lat?: number; lon?: number }[]
  field_online_event?: Field<boolean>
  field_fide_rated?: Field<boolean>
  field_banner_line?: Field<string>
  field_organizer_name?: Field<string>
  field_organizer_email_address?: Field<string>
  field_organizer_phone_number?: Field<string>
  field_organizer_website?: { uri?: string }[]
}

const first = <T>(field: Field<T>) => field?.[0]?.value ?? undefined
const isWeb = (url?: string) => !!url && /^https?:\/\//i.test(url)

export function parseDetail(id: string, node: NodeJSON): TournamentDetail {
  const bodyHTML = first(node.body) ?? ''
  const address = node.field_event_address?.[0]
  const dates = node.field_event_dates?.[0]
  const website = node.field_organizer_website?.[0]?.uri
  return {
    id,
    name: clean(first(node.title) ?? ''),
    startDate: dates?.value ? day(dates.value) : null,
    endDate: dates?.end_value ? day(dates.end_value) : null,
    venueName: first(node.field_event_location_name) && clean(first(node.field_event_location_name)!),
    street: address?.address_line1 && clean(address.address_line1),
    city: address?.locality && clean(address.locality),
    state: address?.administrative_area,
    postalCode: address?.postal_code,
    latitude: node.field_geofield?.[0]?.lat,
    longitude: node.field_geofield?.[0]?.lon,
    isOnline: first(node.field_online_event) ?? false,
    isFIDERated: first(node.field_fide_rated) ?? false,
    banner: (node.field_banner_line ?? []).flatMap((b) => (b.value ? [b.value] : [])),
    organizerName: first(node.field_organizer_name) && clean(first(node.field_organizer_name)!),
    organizerEmail: first(node.field_organizer_email_address),
    organizerPhone: first(node.field_organizer_phone_number),
    organizerWebsite: isWeb(website) ? website : undefined,
    registrationURL: registrationLink(bodyHTML),
    bodyHTML,
  }
}

const registrationHints = [
  'regist', 'entry', 'entries', 'enter', 'sign up', 'signup', 'sign-up', 'onlineregistration', 'chessregister',
  'caissachess', 'eventbrite', 'forms.gle', 'docs.google.com/forms', 'jotform', 'payment',
]

/** The link in the announcement most likely to be the entry/registration form. */
export function registrationLink(html: string): string | undefined {
  for (const [href, label] of captureGroups('<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', html)) {
    const haystack = `${href} ${label}`.toLowerCase()
    const url = unescape(href)
    if (registrationHints.some((h) => haystack.includes(h)) && isWeb(url)) return url
  }
  return undefined
}

// MARK: - Plan Ahead Calendar

export function parseMajorEvents(html: string): MajorEvent[] {
  const events: MajorEvent[] = []
  let year: number | undefined
  // Walk year headings and entries in document order.
  for (const [heading, rawDates, rawRest] of captureGroups(Patterns.planAheadEntry, html)) {
    if (heading) {
      const y = parseInt(clean(heading).slice(0, 4), 10)
      if (Number.isFinite(y)) year = y
      continue
    }
    if (year == null) continue
    const dates = clean(rawDates).replace(/^[:\s]+|[:\s]+$/g, '')
    let rest = clean(rawRest)
    const isNationalChampionship = rest.includes('(N)')
    rest = rest.replace('(N)', '').trim()
    const parts = rest.split(/\s*,\s+/).map((p) => p.trim())
    if (parts.length < 3 || !dates) continue
    const state = parts.pop()!
    const city = parts.pop()!
    events.push({ year, dates, name: parts.join(', '), city, state, isNationalChampionship, startDate: startDate(dates, year) })
  }
  return events
}

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** "November 25-29" / "June 30-July 4" → the first day in `year`. */
export function startDate(dates: string, year: number): Date | null {
  const m = dates.match(/^([A-Za-z]+) (\d{1,2})/)
  const month = m ? months.indexOf(m[1].toLowerCase()) : -1
  return month >= 0 ? new Date(year, month, +m![2]) : null
}

/**
 * The search result whose title shares the most words with the event name;
 * among ties, the one with the fewest extra words ("2026 US Masters" over
 * "$2,000 Blitz - US Masters & NC Open").
 */
export function bestMatch(event: MajorEvent, listings: TournamentListing[]): TournamentListing | undefined {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  const target = words(searchName(event))
  if (!target.size) return undefined
  let best: { listing: TournamentListing; score: number; extra: number } | undefined
  for (const listing of listings) {
    const name = words(listing.name)
    const shared = [...name].filter((w) => target.has(w)).length
    const score = shared / target.size
    const extra = name.size - shared
    if (score < 0.6) continue
    if (!best || score > best.score || (score === best.score && extra < best.extra)) best = { listing, score, extra }
  }
  return best?.listing
}

// MARK: - Fetching

/** The search returns 30 per page; cap how many pages one search pulls. */
const maxPages = 6

async function text(path: string, query: Record<string, string> = {}): Promise<string> {
  const qs = new URLSearchParams(query).toString()
  let response: Response
  try {
    response = await fetch(`${Site.base}/${path.replace(/^\//, '')}${qs ? `?${qs}` : ''}`)
  } catch {
    throw new ApiError("Can't reach US Chess. Check your connection and try again.", 'offline')
  }
  if (response.status === 404) throw new ApiError('US Chess has no record of that.', 'notFound')
  if (!response.ok) throw new ApiError(`US Chess answered with an error (${response.status}).`, 'http')
  return response.text()
}

const searchPage = (query: Record<string, string>, page: number) =>
  text(Site.upcomingSearch, page > 0 ? { ...query, [Params.page]: String(page) } : query)

/** Announcements within `radius` miles of `origin` (a city or ZIP), soonest first. */
export async function fetchUpcoming(origin: string, radius: Radius): Promise<TournamentListing[]> {
  const query = { [Params.radius]: String(radius), [Params.origin]: origin }
  const firstPage = await searchPage(query, 0)
  const last = Math.min(lastPageIndex(firstPage), maxPages - 1)
  const rest = await Promise.all(Array.from({ length: last }, (_, i) => searchPage(query, i + 1)))
  return dedupedAndSorted([firstPage, ...rest].flatMap(parseListings))
}

export async function fetchDetail(id: string): Promise<TournamentDetail> {
  const json = await text(id, { [Params.format]: 'json' })
  try {
    return parseDetail(id, JSON.parse(json) as NodeJSON)
  } catch {
    throw new ApiError('That announcement could not be read.', 'http')
  }
}

export async function fetchMajorEvents(): Promise<MajorEvent[]> {
  return parseMajorEvents(await text(Site.planAheadCalendar))
}

/** Finds the announcement for a Plan Ahead entry, if the organizer posted one. */
export async function findAnnouncement(event: MajorEvent): Promise<TournamentListing | undefined> {
  return bestMatch(event, parseListings(await searchPage({ [Params.keyword]: searchName(event) }, 0)))
}
