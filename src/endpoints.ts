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

/** Query parameter names (the API ignores unknown ones silently). */
export const Params = {
  fuzzy: 'Fuzzy',
  size: 'Size',
  offset: 'Offset',
  ratingSource: 'RatingSource',
} as const

export const Links = {
  join: 'https://www.uschess.org/join',
} as const

/** `template` with each {placeholder} filled in. */
export function fill(template: string, values: Record<string, string> = {}): string {
  return Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, encodeURIComponent(v)), template)
}
