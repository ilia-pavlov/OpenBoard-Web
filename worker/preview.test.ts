import { describe, expect, it } from 'vitest'
import { eventPreview, metaTags, parseShareLink, playerPreview, tournamentPreview } from './preview'

describe('parseShareLink', () => {
  it('reads player, event and tournament links', () => {
    expect(parseShareLink('/p/12641216')).toEqual({ kind: 'player', id: '12641216' })
    expect(parseShareLink('/e/202605200063')).toEqual({ kind: 'event', id: '202605200063' })
    expect(parseShareLink('/t/princeton-national-chess-day-open/')).toEqual({ kind: 'tournament', id: 'princeton-national-chess-day-open' })
  })

  it('ignores anything else', () => {
    expect(parseShareLink('/p/123')).toBeUndefined()
    expect(parseShareLink('/e/2026')).toBeUndefined()
    expect(parseShareLink('/t/../secret')).toBeUndefined()
    expect(parseShareLink('/x/12641216')).toBeUndefined()
  })
})

describe('previews', () => {
  it('describes a player with their ratings', () => {
    expect(playerPreview({ firstName: 'HIKARU', lastName: 'NAKAMURA', stateRep: 'NY', ratings: [{ ratingSystem: 'R', rating: 2846 }, { ratingSystem: 'Q', rating: 2723 }] })).toEqual({
      title: 'Hikaru Nakamura (NY) · US Chess ratings',
      description: 'Regular 2846 · Quick 2723. Rating history, every tournament and best wins on OpenBoard.',
    })
  })

  it('describes a rated event', () => {
    expect(eventPreview({ name: 'Knights of Cypress', endDate: '2026-10-02', city: 'CYPRESS', stateCode: 'TX', playerCount: 39 })?.description).toBe(
      'Oct 2, 2026 · Cypress, TX · 39 players. Standings, every round and rating changes on OpenBoard.',
    )
  })

  it('describes an upcoming tournament', () => {
    expect(
      tournamentPreview({
        title: [{ value: 'Princeton National Chess Day Open' }],
        field_event_dates: [{ value: '2026-10-09', end_value: '2026-10-11' }],
        field_event_address: [{ locality: 'Plainsboro', administrative_area: 'NJ' }],
      }),
    ).toEqual({
      title: 'Princeton National Chess Day Open · Upcoming tournament',
      description: 'Oct 9, 2026 – Oct 11, 2026 · Plainsboro, NJ. Map, entry link and full announcement on OpenBoard.',
    })
  })

  it('returns nothing when the data has no name', () => {
    expect(playerPreview({})).toBeUndefined()
    expect(eventPreview({})).toBeUndefined()
    expect(tournamentPreview({})).toBeUndefined()
  })

  it('escapes names in the meta tags', () => {
    const tags = metaTags({ title: 'A "B" <C>', description: 'd' }, 'https://openboard.online/p/1', 'https://openboard.online/icon-512.png')
    expect(tags).toContain('content="A &quot;B&quot; &lt;C&gt;"')
    expect(tags).not.toContain('<C>')
  })
})
