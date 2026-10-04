// Share links: short paths (/p/12641216, /e/202605200063, /t/some-tournament)
// that open the right screen in the app and give link previews (Messages,
// WhatsApp, Slack) a real title. The app routes with #/…, which never reaches a
// server, so previews need these paths. Kept free of Workers globals so it can
// be unit-tested.

export type ShareKind = 'player' | 'event' | 'tournament'

export interface ShareLink {
  kind: ShareKind
  id: string
}

/** The share link a path names, if any. */
export function parseShareLink(pathname: string): ShareLink | undefined {
  const m = pathname.match(/^\/(p|e|t)\/([\w-]+)\/?$/)
  if (!m) return undefined
  const [, letter, id] = m
  if (letter === 'p' && /^\d{8}$/.test(id)) return { kind: 'player', id }
  if (letter === 'e' && /^\d{12}$/.test(id)) return { kind: 'event', id }
  if (letter === 't' && /^[a-z0-9-]{1,200}$/i.test(id)) return { kind: 'tournament', id }
  return undefined
}

export interface Preview {
  title: string
  description: string
}

/** USCF stores many names in ALL CAPS; title-case those, leave mixed case alone. */
function shouty(s: string): string {
  if (!s || s !== s.toUpperCase()) return s
  return s.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const name = (first?: string, last?: string) => shouty([first, last].filter(Boolean).join(' ').trim())

interface MemberJSON {
  firstName?: string
  lastName?: string
  stateRep?: string
  ratings?: { ratingSystem?: string; rating?: number }[]
}

export function playerPreview(m: MemberJSON): Preview | undefined {
  const full = name(m.firstName, m.lastName)
  if (!full) return undefined
  const rating = (system: string) => m.ratings?.find((r) => r.ratingSystem === system)?.rating
  const parts = [
    rating('R') != null ? `Regular ${rating('R')}` : 'Unrated',
    rating('Q') != null ? `Quick ${rating('Q')}` : null,
    rating('B') != null ? `Blitz ${rating('B')}` : null,
  ].filter(Boolean)
  return {
    title: `${full}${m.stateRep ? ` (${m.stateRep})` : ''} · US Chess ratings`,
    description: `${parts.join(' · ')}. Rating history, every tournament and best wins on OpenBoard.`,
  }
}

interface EventJSON {
  name?: string
  endDate?: string
  startDate?: string
  city?: string
  stateCode?: string
  playerCount?: number
}

const longDate = (iso?: string) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m
    ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : undefined
}

export function eventPreview(e: EventJSON): Preview | undefined {
  if (!e.name) return undefined
  const where = [e.city ? shouty(e.city) : null, e.stateCode].filter(Boolean).join(', ')
  const parts = [longDate(e.endDate ?? e.startDate), where || null, e.playerCount ? `${e.playerCount} players` : null].filter(Boolean)
  return {
    title: `${shouty(e.name)} · Crosstable`,
    description: `${parts.join(' · ')}. Standings, every round and rating changes on OpenBoard.`,
  }
}

type Field<T> = { value?: T }[] | undefined

interface AnnouncementJSON {
  title?: Field<string>
  field_event_dates?: { value?: string; end_value?: string }[]
  field_event_address?: { locality?: string; administrative_area?: string }[]
  field_event_location_name?: Field<string>
}

export function tournamentPreview(t: AnnouncementJSON): Preview | undefined {
  const title = t.title?.[0]?.value?.trim()
  if (!title) return undefined
  const dates = t.field_event_dates?.[0]
  const start = longDate(dates?.value)
  const end = longDate(dates?.end_value)
  const address = t.field_event_address?.[0]
  const where = [address?.locality, address?.administrative_area].filter(Boolean).join(', ')
  const parts = [start && end && end !== start ? `${start} – ${end}` : start, t.field_event_location_name?.[0]?.value, where || null].filter(Boolean)
  return {
    title: `${title} · Upcoming tournament`,
    description: `${parts.join(' · ')}. Map, entry link and full announcement on OpenBoard.`,
  }
}

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => entities[c])

/** The meta tags a link preview reads. */
export function metaTags(preview: Preview, url: string, image: string): string {
  return [
    `<meta property="og:site_name" content="OpenBoard">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(preview.title)}">`,
    `<meta property="og:description" content="${esc(preview.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta name="twitter:card" content="summary">`,
    `<link rel="canonical" href="${esc(url)}">`,
  ].join('\n')
}
