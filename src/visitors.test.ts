import { describe, expect, it } from 'vitest'
import { monthName, shouldCount, visitorsBadge, visitorsSheet } from './visitors'

const day = 86_400_000

describe('shouldCount', () => {
  it('counts a browser once per 30 days', () => {
    const now = Date.UTC(2026, 9, 12)
    expect(shouldCount(null, now)).toBe(true)
    expect(shouldCount(now - 29 * day, now)).toBe(false)
    expect(shouldCount(now - 30 * day, now)).toBe(true)
  })

  it('counts again if the stored time is broken', () => {
    expect(shouldCount(Number.NaN, 0)).toBe(true)
  })
})

describe('visitorsBadge', () => {
  it('stays hidden below 100', () => {
    expect(visitorsBadge(0)).toBe('')
    expect(visitorsBadge(99)).toBe('')
    expect(visitorsBadge(Number.NaN)).toBe('')
  })

  it('shows the exact number from 100 up', () => {
    expect(visitorsBadge(100)).toContain('<strong>100</strong>')
    expect(visitorsBadge(1247)).toContain('<strong>1,247</strong><small>monthly users</small>')
  })
})

describe('visitorsSheet', () => {
  it('names the month', () => {
    expect(monthName('2026-09')).toBe('September 2026')
  })

  it('shows OpenBoard, Lichess and Chess.com, each with its own measure', () => {
    const html = visitorsSheet({ visitors30d: 1247, lichess: { month: '2026-09', games: 89616462 } })
    expect(html).toContain('<strong>1,247</strong> people used OpenBoard in the last 30 days')
    expect(html).toContain('89,616,462</span><span>rated games on <strong>Lichess</strong> in September 2026')
    expect(html).toContain('9,700,000</span><span>people a day on <strong>Chess.com</strong>')
    expect(html).toContain("can't be compared directly")
  })

  it('leaves Lichess out when it could not be loaded', () => {
    expect(visitorsSheet({ visitors30d: 500 })).not.toContain('Lichess</strong>')
  })
})
