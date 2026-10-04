// US Chess endpoints and query parameters. Mirrors OpenBoard's
// Shared/USChessEndpoints.swift — keep the two in step when US Chess changes.

/** ratings-api.uschess.org (MUIR), reached through the same-origin relay. */
export const Ratings = {
  base: '/api/ratings',
  member: 'members/{memberID}',
  memberSections: 'members/{memberID}/sections',
  memberGames: 'members/{memberID}/games',
  memberSearch: 'members',
  maxRanks: 'members/max-ranks',
  ratedEvent: 'rated-events/{eventID}',
  sectionStandings: 'rated-events/{eventID}/sections/{section}/standings',
  topListCatalog: 'top-players',
  topList: 'top-players/{listID}',
} as const

/** new.uschess.org pages (HTML, or Drupal's JSON view of a page), through the relay. */
export const Site = {
  base: '/api/site',
  publicBase: 'https://new.uschess.org',
  upcomingSearch: 'upcoming-tournaments',
  planAheadCalendar: 'plan-ahead-calendar',
} as const

/** Query parameter names (the API ignores unknown ones silently). */
export const Params = {
  fuzzy: 'Fuzzy',
  size: 'Size',
  offset: 'Offset',
  ratingSource: 'RatingSource',
  radius: 'field_geofield_proximity[value]',
  origin: 'field_geofield_proximity[source_configuration][origin_address]',
  keyword: 'combine',
  page: 'page',
  format: '_format',
} as const

/** Regular expressions (and one split marker) the HTML parsers depend on. */
export const Patterns = {
  listingRow: '<div class="views-row">',
  listingPath: '<h3 class="title3"><a href="([^"]+)"',
  listingName: '<h3 class="title3"><a [^>]*>(.*?)</a>',
  listingDate: '<time datetime="(\\d{4}-\\d{2}-\\d{2})',
  listingAddress: '<div class="address">(.*?)</div>',
  listingOrganizer: '<div class="organizer-name">(.*?)</div>',
  listingSummary: '<div class="information">(.*?)</div>',
  listingBanner: '<div class="banner-line h4">(.*?)</div>',
  pagerPage: '[?&amp;]page=(\\d+)',
  planAheadEntry: '<h2[^>]*>(.*?)</h2>|<p[^>]*>\\s*<strong>([^<]*\\d[^<]*):?\\s*</strong>(.*?)</p>',
} as const

export const Links = {
  join: 'https://www.uschess.org/join',
  /** Stripe Payment Link for "Support OpenBoard": $7 a gift, donor picks how many. Empty hides every support button. */
  donate: 'https://donate.stripe.com/eVq7sN3X0bc3dVrcAR8Ra05',
} as const

/** `template` with each {placeholder} filled in. */
export function fill(template: string, values: Record<string, string> = {}): string {
  return Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, encodeURIComponent(v)), template)
}
