import { Params, Ratings, fill } from './endpoints'
import {
  type APIMaxRank, type APIMember, type APIMemberSection, type APIPage, type Player, type PlayerSummary,
  mapPlayer, mapSummary,
} from './models'

export class ApiError extends Error {
  constructor(message: string, readonly kind: 'notFound' | 'rateLimited' | 'http' | 'offline') {
    super(message)
  }
}

/** Seconds to wait before each retry of a rate-limited (429) request; the last entry is never waited on. */
const rateLimitBackoff = [4, 10, 20, 30, 0]

/** In-flight request de-duplication: identical URLs share one network call. */
const inflight = new Map<string, Promise<unknown>>()

function get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(query).toString()
  const url = `${Ratings.base}/${path}${qs ? `?${qs}` : ''}`
  let request = inflight.get(url)
  if (!request) {
    request = fetchJSON(url).finally(() => inflight.delete(url))
    inflight.set(url, request)
  }
  return request as Promise<T>
}

async function fetchJSON(url: string): Promise<unknown> {
  // The API allows roughly 100 requests a minute and then answers 429 for
  // about 40 seconds. Wait it out rather than failing the screen.
  for (const [attempt, backoff] of rateLimitBackoff.entries()) {
    let response: Response
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' } })
    } catch {
      throw new ApiError("Can't reach US Chess. Check your connection and try again.", 'offline')
    }
    if (response.status === 404) throw new ApiError('US Chess has no record of that.', 'notFound')
    if (response.status === 429) {
      if (attempt === rateLimitBackoff.length - 1) break
      const retryAfter = Number(response.headers.get('Retry-After')) || backoff
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
      continue
    }
    if (!response.ok) throw new ApiError(`US Chess answered with an error (${response.status}).`, 'http')
    return response.json()
  }
  throw new ApiError('US Chess is busy right now. Try again in a minute.', 'rateLimited')
}

/** Fetches pages until the API says there are no more (capped at `maxPages`). */
async function collectPages<T>(
  pageSize: number,
  maxPages: number,
  fetchPage: (offset: number, size: number) => Promise<APIPage<T>>,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 0; page < maxPages; page++) {
    const { items, hasNextPage } = await fetchPage(page * pageSize, pageSize)
    all.push(...items)
    if (!hasNextPage || items.length === 0) break
  }
  return all
}

let maxRanksRequest: Promise<APIMaxRank[]> | undefined

function maxRanks(): Promise<APIMaxRank[]> {
  maxRanksRequest ??= get<APIMaxRank[]>(Ratings.maxRanks).catch((error) => {
    maxRanksRequest = undefined
    throw error
  })
  return maxRanksRequest
}

/**
 * Every rated section the player has. The API caps pages at 100 and active
 * juniors have hundreds, so keep paging — otherwise history starts mid-career.
 */
function allSections(memberID: string): Promise<APIMemberSection[]> {
  return collectPages(100, 20, (offset, size) =>
    get<APIPage<APIMemberSection>>(fill(Ratings.memberSections, { memberID }), {
      [Params.size]: String(size),
      [Params.offset]: String(offset),
    }),
  )
}

const players = new Map<string, Promise<Player>>()

/** A player with their full event history. Cached for the session; `force` refetches. */
export function fetchPlayer(id: string, { force = false } = {}): Promise<Player> {
  let request = players.get(id)
  if (!request || force) {
    request = Promise.all([
      get<APIMember>(fill(Ratings.member, { memberID: id })),
      allSections(id),
      maxRanks(),
    ]).then(([member, sections, ranks]) => mapPlayer(member, sections, ranks))
    request.catch(() => players.delete(id))
    players.set(id, request)
  }
  return request
}

/** Name search, or an exact lookup for an 8-digit member ID. */
export async function searchPlayers(query: string): Promise<PlayerSummary[]> {
  const trimmed = query.trim()
  if (/^\d{8}$/.test(trimmed)) {
    try {
      return [mapSummary(await get<APIMember>(fill(Ratings.member, { memberID: trimmed })))]
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'notFound') return []
      throw error
    }
  }
  // `Fuzzy` is the API's name search; an unknown param would be silently
  // ignored and return the default top-rated list instead.
  const page = await get<APIPage<APIMember>>(Ratings.memberSearch, { [Params.fuzzy]: trimmed, [Params.size]: '40' })
  return page.items.map(mapSummary)
}
