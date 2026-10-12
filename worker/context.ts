// Online-chess context for the "monthly users" sheet: how many people played
// rated blitz on Lichess this week. Lichess's public rating-distribution page
// says it in words ("<strong>707,912</strong> Blitz players this week."). Blitz
// is its biggest time control; players overlap across time controls, so they
// can't be added up. Kept free of Workers globals so it can be unit-tested.

export const lichessBlitzURL = 'https://lichess.org/stat/rating/distribution/blitz'

/** Blitz players this week, read from the distribution page, or undefined. */
export function blitzPlayersThisWeek(html: string): number | undefined {
  const m = html.match(/<strong>([\d,]+)<\/strong>\s*Blitz players this week/i)
  if (!m) return undefined
  const n = Number(m[1].replaceAll(',', ''))
  return n > 0 ? n : undefined
}
