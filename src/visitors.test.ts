import { describe, expect, it } from 'vitest'
import { shouldCount, visitorsBadge, visitorsSheet } from './visitors'

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
  const sheet = visitorsSheet({ visitors30d: 1247, lichessBlitzWeek: 707912 })
  const section = (cls: string) => sheet.slice(sheet.indexOf(`sheet-group ${cls}`)).split('</section>')[0]

  it('puts OpenBoard alone in the over-the-board group', () => {
    const otb = section('otb')
    expect(otb).toContain('<span class="sheet-label">OpenBoard</span><span class="sheet-num">1,247</span>')
    expect(otb).not.toContain('Lichess')
  })

  it('puts Lichess and Chess.com in the online group, each with its measure and source', () => {
    const online = section('online')
    expect(online).toContain('<span class="sheet-label">Lichess</span><span class="sheet-num">707,912</span>')
    expect(online).toContain('blitz players this week')
    expect(online).toContain('<span class="sheet-label">Chess.com</span><span class="sheet-num">9,700,000</span>')
    expect(online).toContain('people a day, Q1 2026 average')
    expect(online.match(/sheet-source/g)).toHaveLength(2)
    expect(sheet).toContain("can't be compared directly")
  })

  it('leaves Lichess out when it could not be loaded', () => {
    expect(visitorsSheet({ visitors30d: 500 })).not.toContain('>Lichess<')
  })
})
