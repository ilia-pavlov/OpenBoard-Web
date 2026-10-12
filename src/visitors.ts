// "1,247 monthly users" in the header. This browser
// asks to be counted at most once per 30 days, remembered on this device
// only; the server keeps just a number per day (see worker/visits.ts).

import { num } from './ui'

const key = 'ob.counted'
const window30d = 30 * 86_400_000

/** Below this the line stays hidden: a small number says less than none. */
export const minimumShown = 100

/** Whether a browser last counted at `last` (ms, or null) should be counted again. */
export const shouldCount = (last: number | null, now: number) => last == null || !(now - last < window30d)

/** Asks the server to count this visit, once per 30 days per browser. */
export function countThisVisit() {
  let last: number | null = null
  try {
    last = Number(localStorage.getItem(key)) || null
  } catch {
    // Storage blocked: counting once per page load would overcount, so skip.
    return
  }
  const now = Date.now()
  if (!shouldCount(last, now)) return
  fetch('/api/visit', { method: 'POST', keepalive: true })
    .then((r) => {
      if (r.ok) localStorage.setItem(key, String(now))
    })
    .catch(() => {})
}

const peopleIcon = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2 19c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5v1H2z"/><circle cx="17" cy="9" r="2.8" opacity=".7"/><path d="M15.5 13.7c3.6.2 6.5 2.2 6.5 5.3v1h-4.5v-1c0-2.1-.8-3.9-2-5.3z" opacity=".7"/></svg>`

/** The header badge's content, or '' while the number is below `minimumShown`. */
export function visitorsBadge(count: number): string {
  if (!(count >= minimumShown)) return ''
  return `<span class="visitors-icon">${peopleIcon}</span><span class="visitors-text"><strong>${num(count)}</strong><small>monthly users</small></span>`
}

/** People counted over the last 30 days (0 if it can't be loaded). */
async function visitorsLast30Days(): Promise<number> {
  try {
    const r = await fetch('/api/stats')
    return r.ok ? Number(((await r.json()) as { visitors30d?: number }).visitors30d) || 0 : 0
  } catch {
    return 0
  }
}

/** Fills the header badge once the count is loaded and big enough. */
export async function showVisitors(badge: HTMLElement) {
  const count = await visitorsLast30Days()
  const html = visitorsBadge(count)
  if (!html) return
  badge.innerHTML = html
  badge.title = `${num(count)} people used OpenBoard in the last 30 days`
  badge.setAttribute('aria-label', badge.title)
  badge.hidden = false
}
