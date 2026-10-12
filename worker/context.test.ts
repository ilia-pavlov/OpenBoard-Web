import { describe, expect, it } from 'vitest'
import { latestLichessMonth } from './context'

describe('latestLichessMonth', () => {
  it('reads the newest month from the counts file', () => {
    const text = [
      'lichess_db_standard_rated_2013-01.pgn.zst 121332',
      'lichess_db_standard_rated_2026-09.pgn.zst 89616462',
      'lichess_db_standard_rated_2026-08.pgn.zst 91912325',
      '',
    ].join('\n')
    expect(latestLichessMonth(text)).toEqual({ month: '2026-09', games: 89616462 })
  })

  it('returns nothing for an unexpected file', () => {
    expect(latestLichessMonth('<html>Not found</html>')).toBeUndefined()
    expect(latestLichessMonth('')).toBeUndefined()
  })
})
