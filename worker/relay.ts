// The relay's rules, kept free of Workers globals so they can be unit-tested:
// which upstream URL a same-origin /api path maps to, and how long its answer
// may be shared from Cloudflare's cache.
//
// US Chess allows about 100 requests a minute per IP. Every visitor's request
// leaves through this relay, so caching is what keeps one busy hour from
// rate-limiting everyone: finished events never change, Top 100 lists are
// monthly, and a profile a few minutes old is fine.

export const userAgent = 'OpenBoard-Web (+https://github.com/ilia-pavlov/OpenBoard-Web)'

export interface Upstream {
  url: string
  /** Seconds to keep a successful answer in the edge cache (0: don't). */
  ttl: number
}

const minutes = 60
const hours = 60 * minutes

/** Cache lifetimes for ratings-api paths (relative to /api/v1), first match wins. */
const ratingsTTL: [RegExp, number][] = [
  [/^members\/max-ranks$/, 24 * hours],
  [/^members\/\d{8}\/games$/, 1 * hours],
  [/^members\/\d{8}(\/sections)?$/, 10 * minutes],
  [/^members$/, 10 * minutes], // name search
  [/^rated-events\/\d{12}(\/sections\/\d{1,3}\/standings)?$/, 6 * hours],
  [/^top-players(\/[A-Za-z0-9]+)?$/, 12 * hours],
]

/** Cache lifetimes for new.uschess.org pages, first match wins. */
const siteTTL: [RegExp, number][] = [
  [/^upcoming-tournaments$/, 30 * minutes],
  [/^plan-ahead-calendar$/, 12 * hours],
  [/^[\w%.-]+$/, 1 * hours], // a tournament announcement (?_format=json)
]

/** Query parameters each upstream accepts; anything else is dropped (and can't split the cache). */
const ratingsParams = new Set(['Fuzzy', 'Size', 'Offset', 'RatingSource'])
const siteParams = new Set([
  'field_geofield_proximity[value]',
  'field_geofield_proximity[source_configuration][origin_address]',
  'combine',
  'page',
  '_format',
])

function query(search: URLSearchParams, allowed: Set<string>): string {
  const kept = new URLSearchParams()
  for (const [k, v] of search) if (allowed.has(k)) kept.append(k, v)
  kept.sort() // one cache entry per distinct query, whatever the order
  const qs = kept.toString()
  return qs ? `?${qs}` : ''
}

/**
 * The upstream request for a same-origin /api path, or undefined when the path
 * isn't one the site uses. Only known path shapes pass, so the relay can't be
 * used as a general-purpose proxy.
 */
export function upstreamFor(url: URL): Upstream | undefined {
  const ratings = url.pathname.match(/^\/api\/ratings\/(.+)$/)
  if (ratings) {
    const path = ratings[1]
    const rule = ratingsTTL.find(([pattern]) => pattern.test(path))
    return rule && { url: `https://ratings-api.uschess.org/api/v1/${path}${query(url.searchParams, ratingsParams)}`, ttl: rule[1] }
  }
  const site = url.pathname.match(/^\/api\/site\/(.+)$/)
  if (site) {
    const path = site[1]
    if (path.includes('..')) return undefined
    const rule = siteTTL.find(([pattern]) => pattern.test(path))
    return rule && { url: `https://new.uschess.org/${path}${query(url.searchParams, siteParams)}`, ttl: rule[1] }
  }
  return undefined
}
