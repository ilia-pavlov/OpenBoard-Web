// Sharing players, events and tournaments as openboard.online links. Shared
// links use short paths (/p/…, /e/…, /t/…) that the Worker gives link-preview
// tags; opening one lands on the same screen in the app.

import { esc } from './ui'

const origin = 'https://openboard.online'

export const playerShareURL = (memberID: string) => `${origin}/p/${memberID}`
export const eventShareURL = (eventID: string, highlight?: string) =>
  `${origin}/e/${eventID}${highlight ? `?highlight=${encodeURIComponent(highlight)}` : ''}`
/** `id` is the announcement path, e.g. "/princeton-national-chess-day-open". */
export const tournamentShareURL = (id: string) => `${origin}/t${id}`

/**
 * The app route for a share link path, if the page was opened from one:
 * "/p/12641216" → "#/player/12641216". Query parameters carry over.
 */
export function routeForSharePath(pathname: string, search: string): string | undefined {
  const m = pathname.match(/^\/(p|e|t)\/([\w-]+)\/?$/)
  if (!m) return undefined
  const [, kind, id] = m
  const query = search.replace(/^\?/, '')
  const withQuery = (route: string) => (query ? `${route}?${query}` : route)
  if (kind === 'p' && /^\d{8}$/.test(id)) return `#/player/${id}`
  if (kind === 'e' && /^\d{12}$/.test(id)) return withQuery(`#/event/${id}`)
  if (kind === 't') return `#/tournament/${id}`
  return undefined
}

/** Opened from a share link: show the matching screen at a clean URL. */
export function openSharedLink() {
  const route = routeForSharePath(location.pathname, location.search)
  if (route) history.replaceState(null, '', `/${route}`)
}

export const shareIcon = `<svg class="share-glyph" viewBox="0 0 16 20" aria-hidden="true"><path d="M8 1v11M4 5l4-4 4 4M3 9H2v10h12V9h-1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`

/** A Share button; the view handles `data-action="share"` with `share()`. */
export const shareButton = (label = 'Share', className = 'button') =>
  `<button class="${className} share-button" type="button" data-action="share" aria-label="${esc(label)}">${shareIcon}<span>${esc(label)}</span></button>`

/**
 * The system share sheet where there is one (phones, Safari), else copy the
 * link. Reports what happened on the button for a moment.
 */
export async function share(button: HTMLElement, data: { title: string; text: string; url: string }) {
  if (navigator.share) {
    try {
      await navigator.share(data)
      return
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return // the user closed the sheet
    }
  }
  const label = button.querySelector('span')
  const original = label?.textContent ?? ''
  try {
    await navigator.clipboard.writeText(data.url)
    if (label) label.textContent = 'Link copied'
  } catch {
    // No clipboard either: show the link so it can be copied by hand.
    window.prompt('Copy this link', data.url)
    return
  }
  button.classList.add('copied')
  setTimeout(() => {
    if (label) label.textContent = original
    button.classList.remove('copied')
  }, 1800)
}
