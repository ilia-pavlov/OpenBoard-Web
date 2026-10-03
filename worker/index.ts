// OpenBoard Web on Cloudflare Workers: static assets serve the site, and this
// Worker runs only for the page itself and /api/* (see run_worker_first in
// wrangler.jsonc). It sends other hostnames to the canonical one and relays
// /api/* to US Chess with an edge cache in front.

import { canonicalRedirect, upstreamFor, userAgent } from './relay'

/** How long browsers may reuse a relayed answer without asking again. */
const browserTTL = 60

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    const isAPI = url.pathname.startsWith('/api/')

    if (!isAPI) {
      // The page: forward www and the old workers.dev address (the #/… part of
      // a link survives a redirect), otherwise serve it from static assets.
      const target = canonicalRedirect(url, env.CANONICAL_HOST)
      return target ? Response.redirect(target, 301) : env.ASSETS.fetch(request)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return error(405, 'Only GET requests are relayed.')
    }
    const upstream = upstreamFor(url)
    if (!upstream) return error(404, 'Not a US Chess path this site relays.')

    // Cache by the normalized upstream URL, so equivalent requests share one entry.
    const cache = caches.default
    const cacheKey = new Request(upstream.url)
    const cached = await cache.match(cacheKey)
    if (cached) {
      const hit = new Response(cached.body, cached)
      hit.headers.set('Cache-Control', `public, max-age=${browserTTL}`)
      hit.headers.set('X-Relay-Cache', 'HIT')
      return hit
    }

    let response: Response
    try {
      response = await fetch(upstream.url, {
        headers: { 'User-Agent': userAgent, Accept: request.headers.get('Accept') ?? '*/*' },
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      console.error(JSON.stringify({ message: 'upstream fetch failed', url: upstream.url, error: String(e) }))
      return error(502, "Couldn't reach US Chess.")
    }

    // Pass the status through (the page waits out 429s using Retry-After), but
    // never forward cookies or US Chess's own caching headers.
    const headers = new Headers()
    for (const name of ['Content-Type', 'Retry-After']) {
      const value = response.headers.get(name)
      if (value) headers.set(name, value)
    }

    if (response.status === 200 && upstream.ttl > 0) {
      const [forCache, forClient] = response.body ? response.body.tee() : [null, null]
      const stored = new Response(forCache, { status: 200, headers: new Headers(headers) })
      stored.headers.set('Cache-Control', `public, max-age=${upstream.ttl}`)
      ctx.waitUntil(cache.put(cacheKey, stored))
      headers.set('Cache-Control', `public, max-age=${browserTTL}`)
      headers.set('X-Relay-Cache', 'MISS')
      return new Response(forClient, { status: 200, headers })
    }

    if (response.status === 429) {
      console.warn(JSON.stringify({ message: 'rate limited by US Chess', url: upstream.url }))
    }
    headers.set('Cache-Control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  },
} satisfies ExportedHandler<Env>
