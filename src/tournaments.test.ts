import { describe, expect, it } from 'vitest'
import {
  bestMatch, dedupedAndSorted, lastPageIndex, matchesKind, occursIn, parseDetail, parseListings, parseMajorEvents,
  registrationLink, startDate, unescape, windowRange,
} from './tournaments'

const row = (path: string, name: string, dates: string[], extra = '') => `<div class="views-row">
  <h3 class="title3"><a href="${path}" hreflang="en">${name}</a></h3>
  <div class="banner-line h4">${extra}</div>
  <div class="address">Princeton, , New Jersey</div>
  <div class="dates"><div class="${dates.length > 1 && extra === 'recur' ? 'date-recur-occurrences' : 'date-recur-date'}">${dates
    .map((d) => `<time datetime="${d}T07:00:00Z">x</time>`)
    .join(' - ')}</div></div>
  <div class="organizer-name">Atlantic Chess Association</div>
  <div class="information">  Rated &amp; fun  </div>
</div>`

describe('parseListings', () => {
  const html = `<html>${row('/princeton-open', 'Princeton Open', ['2026-10-09', '2026-10-11'])}${row('/friday-rapid', 'Friday Rapid', ['2026-01-02', '2026-12-25'], 'recur')}<a href="?page=2">3</a></html>`
  const listings = parseListings(html)

  it('reads name, path, dates, organizer and cleans the location', () => {
    expect(listings[0]).toMatchObject({
      id: '/princeton-open',
      name: 'Princeton Open',
      location: 'Princeton, New Jersey',
      organizer: 'Atlantic Chess Association',
      summary: 'Rated & fun',
      isRecurring: false,
    })
    expect(listings[0].endDate?.getDate()).toBe(11)
  })

  it('treats a range over two weeks as a recurring series', () => {
    expect(listings[1].isRecurring).toBe(true)
  })

  it('finds the last page in the pager', () => {
    expect(lastPageIndex(html)).toBe(2)
    expect(lastPageIndex('<html></html>')).toBe(0)
  })
})

describe('dedupedAndSorted', () => {
  const now = new Date(2026, 9, 3)
  const l = (id: string, start: Date, isRecurring = false) => ({
    id, name: id, location: '', organizer: '', summary: '', banner: '', startDate: start, endDate: start, isRecurring,
  })
  it('drops past events and duplicates, soonest first, recurring last', () => {
    const out = dedupedAndSorted([l('b', new Date(2026, 9, 20)), l('r', new Date(2026, 9, 4), true), l('a', new Date(2026, 9, 5)), l('a', new Date(2026, 9, 5)), l('old', new Date(2026, 8, 1))], now)
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'r'])
  })
})

describe('filters', () => {
  const listing = {
    id: '/x', name: 'Fall K-8 Scholastic Quads', location: '', organizer: '', summary: '', banner: 'Grand Prix',
    startDate: new Date(2026, 9, 10), endDate: new Date(2026, 9, 10), isRecurring: false,
  }
  it('matches tournament types by keywords', () => {
    expect(matchesKind('scholastic', listing)).toBe(true)
    expect(matchesKind('quads', listing)).toBe(true)
    expect(matchesKind('grandPrix', listing)).toBe(true)
    expect(matchesKind('quads', { ...listing, name: 'Swiss' })).toBe(false)
  })

  it('makes "this weekend" run from today through Sunday', () => {
    const [from, to] = windowRange('weekend', new Date(2026, 9, 7, 15))! // a Wednesday
    expect([from.getDate(), to.getDate(), to.getDay()]).toEqual([7, 11, 0])
    expect(occursIn(listing, [from, to])).toBe(true)
    expect(occursIn(listing, windowRange('weekend', new Date(2026, 9, 12)))).toBe(false)
  })
})

describe('parseDetail', () => {
  it('reads the announcement fields and finds the registration link', () => {
    const d = parseDetail('/princeton-open', {
      title: [{ value: 'Princeton Open' }],
      body: [{ value: '<p>Info at <a href="https://example.com/about">site</a>. <a href="https://chessregister.com/e/1">Enter online</a></p>' }],
      field_event_dates: [{ value: '2026-10-09', end_value: '2026-10-11' }],
      field_event_address: [{ address_line1: '100 College Road East', locality: 'Plainsboro', administrative_area: 'NJ', postal_code: '08540' }],
      field_geofield: [{ lat: 40.355856, lon: -74.597239 }],
      field_fide_rated: [{ value: true }],
      field_organizer_website: [{ uri: 'javascript:alert(1)' }],
    })
    expect(d).toMatchObject({ name: 'Princeton Open', city: 'Plainsboro', isFIDERated: true, registrationURL: 'https://chessregister.com/e/1' })
    expect(d.organizerWebsite).toBeUndefined() // only http(s) websites
  })

  it('ignores registration-looking links that are not web addresses', () => {
    expect(registrationLink('<a href="mailto:td@example.com">Register by email</a>')).toBeUndefined()
  })
})

describe('Plan Ahead Calendar', () => {
  const html = `<h2>2026</h2><p><strong>October 16-18: </strong>2026 South Dakota Governor's Cup, Sioux Falls, SD</p>
    <p><strong>December 11-13:</strong> National K-12 Grade Championships (N), Orlando, FL</p><h2>2027 Events</h2>
    <p><strong>June 30-July 4: </strong>World Open ($200,000 Guaranteed), Philadelphia, PA</p>`
  const events = parseMajorEvents(html)

  it('reads entries under their year heading', () => {
    expect(events.map((e) => [e.year, e.dates, e.name, e.city, e.state, e.isNationalChampionship])).toEqual([
      [2026, 'October 16-18', "2026 South Dakota Governor's Cup", 'Sioux Falls', 'SD', false],
      [2026, 'December 11-13', 'National K-12 Grade Championships', 'Orlando', 'FL', true],
      [2027, 'June 30-July 4', 'World Open ($200,000 Guaranteed)', 'Philadelphia', 'PA', false],
    ])
    expect(startDate('June 30-July 4', 2027)?.getMonth()).toBe(5)
  })

  it('matches an announcement by shared title words', () => {
    const listing = (name: string) => ({ id: name, name, location: '', organizer: '', summary: '', banner: '', startDate: null, endDate: null, isRecurring: false })
    expect(bestMatch(events[2], [listing('Philadelphia Chess Club'), listing('55th Annual World Open')])?.name).toBe('55th Annual World Open')
    expect(bestMatch(events[0], [listing('Fall Swiss')])).toBeUndefined()
    const masters = { ...events[2], name: 'US Masters ($25,000 Guaranteed)' }
    expect(bestMatch(masters, [listing('$2,000 Blitz - US Masters & NC Open'), listing('2026 US Masters'), listing('US Masters / NC Open Blitz')])?.name).toBe('2026 US Masters')
  })
})

describe('unescape', () => {
  it('decodes named and numeric entities, ampersands last', () => {
    expect(unescape('Rock &amp; Roll &#8217;26 &#x2014; &amp;lt;')).toBe('Rock & Roll ’26 — &lt;')
  })
})
