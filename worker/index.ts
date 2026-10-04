// OpenBoard Web on Cloudflare Workers: static assets serve the site, and this
// Worker runs only for the page itself, share links (/p/…, /e/…, /t/…) and
// /api/* (see run_worker_first in wrangler.jsonc). It sends other hostnames to
// the canonical one, gives share links real link-preview tags, and relays
// /api/* to US Chess with an edge cache in front.

import { type Preview, type ShareLink, eventPreview, metaTags, parseShareLink, playerPreview, tournamentPreview } from './preview'
import { type Upstream, canonicalRedirect, upstreamFor, userAgent } from './relay'

/** How long browsers may reuse a relayed answer without asking again. */
const browserTTL = 60

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * The upstream answer, from the edge cache when possible. Successful answers
 * are cached for the path's lifetime; anything else passes through uncached.
 */
async function fetchUpstream(upstream: Upstream, ctx: ExecutionContext, accept: string, timeout = 20_000): Promise<Response> {
  const cache = caches.default
  // Cache by the normalized upstream URL, so equivalent requests share one entry.
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
      headers: { 'User-Agent': userAgent, Accept: accept },
      signal: AbortSignal.timeout(timeout),
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
}

/** The relay path holding a share link's data, and how to turn it into a preview. */
const previewSources: Record<ShareLink['kind'], (id: string) => [string, (json: never) => Preview | undefined]> = {
  player: (id) => [`/api/ratings/members/${id}`, playerPreview],
  event: (id) => [`/api/ratings/rated-events/${id}`, eventPreview],
  tournament: (id) => [`/api/site/${id}?_format=json`, tournamentPreview],
}

const fallbackPreview: Preview = {
  title: 'OpenBoard · US Chess ratings and tournaments',
  description: 'US Chess ratings and tournaments, made for families: ratings, crosstables, Top 100 lists and tournaments near you.',
}

/**
 * The app's page with link-preview tags for a share link. The app reads the
 * path and opens the right screen. A slow or failed lookup falls back to the
 * generic preview rather than delaying the page.
 */
async function sharePage(share: ShareLink, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const [path, toPreview] = previewSources[share.kind](share.id)
  const upstream = upstreamFor(new URL(path, url))
  let preview = fallbackPreview
  if (upstream) {
    const response = await fetchUpstream(upstream, ctx, 'application/json', 4_000)
    if (response.ok) preview = toPreview((await response.json().catch(() => null)) as never) ?? fallbackPreview
  }

  const page = await env.ASSETS.fetch(new Request(new URL('/', url)))
  const canonical = `https://${env.CANONICAL_HOST}${url.pathname}${url.search}`
  const rewritten = new HTMLRewriter()
    .on('title', { element: (e) => void e.setInnerContent(preview.title) })
    .on('meta[name="description"]', { element: (e) => void e.setAttribute('content', preview.description) })
    // Replace the page's generic preview tags with this link's.
    .on('meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]', { element: (e) => void e.remove() })
    .on('head', { element: (e) => void e.append(metaTags(preview, canonical, `https://${env.CANONICAL_HOST}/icon-512.png`), { html: true }) })
    .transform(page)
  const response = new Response(rewritten.body, rewritten)
  response.headers.set('Cache-Control', 'public, max-age=300')
  return response
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    const isAPI = url.pathname.startsWith('/api/')

    if (!isAPI) {
      // Forward www and the old workers.dev address (the #/… part of a link
      // survives a redirect).
      const target = canonicalRedirect(url, env.CANONICAL_HOST)
      if (target) return Response.redirect(target, 301)
      const share = parseShareLink(url.pathname)
      return share ? sharePage(share, url, env, ctx) : env.ASSETS.fetch(request)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return error(405, 'Only GET requests are relayed.')
    }
    const upstream = upstreamFor(url)
    if (!upstream) return error(404, 'Not a US Chess path this site relays.')
    return fetchUpstream(upstream, ctx, request.headers.get('Accept') ?? '*/*')
  },
} satisfies ExportedHandler<Env>
