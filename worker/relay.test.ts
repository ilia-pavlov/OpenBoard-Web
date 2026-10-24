import { describe, expect, it } from 'vitest'
import { canonicalRedirect, upstreamFor } from './relay'

const at = (path: string) => upstreamFor(new URL(`https://openboard.example${path}`))

describe('upstreamFor', () => {
  it('maps ratings paths to the API with a cache lifetime', () => {
    expect(at('/api/ratings/members/12641216')).toEqual({ url: 'https://ratings-api.uschess.org/api/v1/members/12641216', ttl: 600 })
    expect(at('/api/ratings/rated-events/202605200063/sections/1/standings?Size=100&Offset=0')?.url).toBe(
      'https://ratings-api.uschess.org/api/v1/rated-events/202605200063/sections/1/standings?Offset=0&Size=100',
    )
    expect(at('/api/ratings/top-players/Regular9')?.ttl).toBe(12 * 3600)
  })

  it('maps tournament pages to new.uschess.org, keeping only known parameters', () => {
    const search = at('/api/site/upcoming-tournaments?field_geofield_proximity%5Bvalue%5D=25&utm_source=x&field_geofield_proximity%5Bsource_configuration%5D%5Borigin_address%5D=07057')
    expect(search?.url).toBe(
      'https://new.uschess.org/upcoming-tournaments?field_geofield_proximity%5Bsource_configuration%5D%5Borigin_address%5D=07057&field_geofield_proximity%5Bvalue%5D=25',
    )
    expect(at('/api/site/princeton-national-chess-day-open?_format=json')?.ttl).toBe(3600)
  })

  it('relays club, school and event-name searches', () => {
    expect(at('/api/ratings/affiliates?Fuzzy=oak%20hall&Size=40')?.url).toBe('https://ratings-api.uschess.org/api/v1/affiliates?Fuzzy=oak+hall&Size=40')
    expect(at('/api/ratings/affiliates/H6043396')?.ttl).toBe(12 * 3600)
    expect(at('/api/ratings/affiliates/H6043396/events?Size=50&Offset=0')?.url).toBe(
      'https://ratings-api.uschess.org/api/v1/affiliates/H6043396/events?Offset=0&Size=50',
    )
    expect(at('/api/ratings/rated-events?Name=marshall&Size=40')?.url).toBe('https://ratings-api.uschess.org/api/v1/rated-events?Name=marshall&Size=40')
    expect(at('/api/ratings/affiliates?Fuzzy=chess&StateCode=NJ&Size=40')?.url).toBe(
      'https://ratings-api.uschess.org/api/v1/affiliates?Fuzzy=chess&Size=40&StateCode=NJ',
    )
    expect(at('/api/ratings/affiliates/h6043396')).toBeUndefined() // IDs are upper case
  })

  it('normalizes parameter order so equivalent requests share a cache entry', () => {
    expect(at('/api/ratings/members?Size=40&Fuzzy=pavlov')?.url).toBe(at('/api/ratings/members?Fuzzy=pavlov&Size=40')?.url)
  })

  it('refuses paths the site does not use, so it is not an open proxy', () => {
    expect(at('/api/ratings/admin/users')).toBeUndefined()
    expect(at('/api/ratings/members/123')).toBeUndefined() // not an 8-digit ID
    expect(at('/api/site/../etc/passwd')).toBeUndefined()
    expect(at('/api/site/news/some-article')).toBeUndefined() // nested site paths
    expect(at('/api/other/thing')).toBeUndefined()
  })
})

describe('canonicalRedirect', () => {
  const host = 'openboard.online'
  it('sends www and the old workers.dev address to the canonical host, keeping the path', () => {
    expect(canonicalRedirect(new URL('https://www.openboard.online/'), host)).toBe('https://openboard.online/')
    expect(canonicalRedirect(new URL('https://openboard-web.openboard-web.workers.dev/index.html?x=1'), host)).toBe('https://openboard.online/index.html?x=1')
  })

  it('serves preview URLs directly so a version can be tried before it goes live', () => {
    expect(canonicalRedirect(new URL('https://staging-openboard-web.openboard-web.workers.dev/'), host)).toBeUndefined()
    expect(canonicalRedirect(new URL('https://3f2a91c0-openboard-web.openboard-web.workers.dev/'), host)).toBeUndefined()
  })

  it('serves the canonical host and local development directly', () => {
    expect(canonicalRedirect(new URL('https://openboard.online/'), host)).toBeUndefined()
    expect(canonicalRedirect(new URL('http://127.0.0.1:8787/'), host)).toBeUndefined()
  })
})
