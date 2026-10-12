import { describe, expect, it } from 'vitest'
import { shouldCount, visitorsBadge } from './visitors'

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
