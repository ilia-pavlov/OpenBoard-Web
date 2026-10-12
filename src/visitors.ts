// "1,247 people used OpenBoard in the last 30 days" on About. This browser
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

/** The About line, or '' while the number is below `minimumShown`. */
export function visitorsLine(count: number): string {
  if (!(count >= minimumShown)) return ''
  return `♛ <strong>${num(count)}</strong> people used OpenBoard in the last 30 days`
}

/** People counted over the last 30 days (0 if it can't be loaded). */
export async function visitorsLast30Days(signal?: AbortSignal): Promise<number> {
  try {
    const r = await fetch('/api/stats', { signal })
    return r.ok ? Number(((await r.json()) as { visitors30d?: number }).visitors30d) || 0 : 0
  } catch {
    return 0
  }
}
