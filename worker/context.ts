// Online-chess context for the "monthly users" sheet: rated games played on
// Lichess last month, from the Lichess open database's counts file (one line
// per month: "lichess_db_standard_rated_2026-09.pgn.zst 89616462"). Kept free
// of Workers globals so it can be unit-tested.

export const lichessCountsURL = 'https://database.lichess.org/standard/counts.txt'

export interface LichessMonth {
  /** Like 2026-09. */
  month: string
  games: number
}

/** The latest month in the counts file, or undefined if it can't be read. */
export function latestLichessMonth(text: string): LichessMonth | undefined {
  let latest: LichessMonth | undefined
  for (const line of text.split('\n')) {
    const m = line.match(/_(\d{4}-\d{2})\.pgn\.zst\s+(\d+)\s*$/)
    if (m && (!latest || m[1] > latest.month)) latest = { month: m[1], games: Number(m[2]) }
  }
  return latest
}
