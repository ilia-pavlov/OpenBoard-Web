import { describe, expect, it } from 'vitest'
import { blitzPlayersThisWeek } from './context'

describe('blitzPlayersThisWeek', () => {
  it("reads the number from Lichess's distribution page", () => {
    const html = '<div class="desc"><p><strong>707,912</strong> Blitz players this week.</p></div>'
    expect(blitzPlayersThisWeek(html)).toBe(707912)
  })

  it('returns nothing for an unexpected page', () => {
    expect(blitzPlayersThisWeek('<html>Not found</html>')).toBeUndefined()
    expect(blitzPlayersThisWeek('<strong>0</strong> Blitz players this week')).toBeUndefined()
    expect(blitzPlayersThisWeek('')).toBeUndefined()
  })
})
