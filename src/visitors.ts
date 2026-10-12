// "1,247 monthly users" in the header; tapping it opens a sheet that puts the
// number next to online chess for context. This browser asks to be counted
// at most once per 30 days, remembered on this device only; the server keeps
// just a number per day (see worker/visits.ts).

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

export interface Stats {
  visitors30d: number
  /** Rated games on Lichess in its latest published month, when it could be loaded. */
  lichess?: { month: string; games: number }
}

/**
 * Chess.com publishes daily active users in its quarterly board reports (a web
 * page, no API). Update these by hand when a new report comes out.
 */
export const chessCom = {
  dailyActive: 9_700_000,
  period: 'Q1 2026',
  source: 'https://www.chess.com/board-reports/2026-q1',
} as const

/** "2026-09" → "September 2026". */
export const monthName = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** The sheet that opens from the badge: OpenBoard's number, then online chess for context. */
export function visitorsSheet(stats: Stats): string {
  const lichess = stats.lichess
  return `<h3>Monthly users</h3>
    <p class="sheet-hero"><strong>${num(stats.visitors30d)}</strong> people used OpenBoard in the last 30 days.</p>
    <p class="muted">Parents and players finding <strong>over-the-board</strong> tournaments and following US Chess ratings.</p>
    <h4 class="section-label">For context: online chess</h4>
    <ul class="sheet-context">
      ${
        lichess
          ? `<li><span class="sheet-num">${num(lichess.games)}</span><span>rated games on <strong>Lichess</strong> in ${monthName(lichess.month)}</span>
              <a href="https://database.lichess.org/" target="_blank" rel="noopener">Lichess open database</a></li>`
          : ''
      }
      <li><span class="sheet-num">${num(chessCom.dailyActive)}</span><span>people a day on <strong>Chess.com</strong> (average, ${chessCom.period})</span>
        <a href="${chessCom.source}" target="_blank" rel="noopener">Chess.com board report</a></li>
    </ul>
    <p class="sheet-note">These measure different things: OpenBoard counts people per month, Lichess counts games per month and Chess.com counts people per day, so they can't be compared directly.</p>`
}

/** OpenBoard's numbers and the online context (count 0 if they can't be loaded). */
async function loadStats(): Promise<Stats> {
  try {
    const r = await fetch('/api/stats')
    if (!r.ok) return { visitors30d: 0 }
    const json = (await r.json()) as Partial<Stats>
    return { visitors30d: Number(json.visitors30d) || 0, lichess: json.lichess }
  } catch {
    return { visitors30d: 0 }
  }
}

/** Fills the header badge and its sheet once the count is loaded and big enough. */
export async function showVisitors(badge: HTMLElement, sheet: HTMLElement) {
  const stats = await loadStats()
  const html = visitorsBadge(stats.visitors30d)
  if (!html) return
  badge.innerHTML = html
  badge.title = `${num(stats.visitors30d)} people used OpenBoard in the last 30 days. Tap to compare with online chess.`
  badge.setAttribute('aria-label', badge.title)
  sheet.querySelector('.sheet-body')!.innerHTML = visitorsSheet(stats)
  badge.hidden = false
}
