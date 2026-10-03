import { describe, expect, it } from 'vitest'
import { ageGroup, badgeLabel, mapTopList, mapTopListDefinitions, sortKey } from './models'

const definitions = mapTopListDefinitions([
  { id: 'Regular9', name: 'Age 9', ratingSource: 'R', minAge: 9, maxAge: 9 },
  { id: 'Regular7andUnder', name: 'Age 7', ratingSource: 'R', maxAge: 7 },
  { id: 'RegularOverall', name: 'Overall', ratingSource: 'R' },
  { id: 'RegularUnder21', name: 'Under Age 21', ratingSource: 'R', maxAge: 20 },
  { id: 'Regular65Plus', name: 'Age 65 and Over', ratingSource: 'R', minAge: 65 },
  { id: 'WomensRegular', name: 'Women', ratingSource: 'R', gender: 'Female' },
  { id: 'WomensRegular10', name: 'Girls Age 10', ratingSource: 'R', minAge: 10, maxAge: 10, gender: 'Female' },
  { id: 'WomensQuick50Plus', name: 'Quick Women Age 50 and over', ratingSource: 'Q', minAge: 50, gender: 'Female' },
  { id: 'OnlineRegular', name: 'Online', ratingSource: 'OR' },
  { id: 'AnyFedRegular', name: 'Overall', ratingSource: 'R', fideUsaOnly: false },
])
const byID = Object.fromEntries(definitions.map((d) => [d.id, d]))

describe('mapTopListDefinitions', () => {
  it('skips online lists and any-federation duplicates', () => {
    expect(definitions.map((d) => d.id)).not.toContain('OnlineRegular')
    expect(definitions.map((d) => d.id)).not.toContain('AnyFedRegular')
    expect(byID.WomensRegular10.isWomen).toBe(true)
  })
})

describe('labels', () => {
  it('strips rating and gender words for the age group', () => {
    expect(ageGroup(byID.WomensQuick50Plus)).toBe('Age 50 and over')
    expect(ageGroup(byID.WomensRegular)).toBe('Overall')
    expect(ageGroup(byID.Regular65Plus)).toBe('Age 65 and over')
  })

  it('makes short badge labels', () => {
    expect(badgeLabel(byID.Regular9)).toBe('Age 9')
    expect(badgeLabel(byID.RegularOverall)).toBe('US Top 100')
    expect(badgeLabel(byID.WomensRegular)).toBe('Top Women')
    expect(badgeLabel(byID.WomensRegular10)).toBe('Girls Age 10')
    expect(badgeLabel(byID.WomensQuick50Plus)).toBe('Women Age 50 and over')
  })
})

describe('sortKey', () => {
  it('orders youngest first, then under-N, overall, and seniors', () => {
    const ids = ['Regular65Plus', 'RegularOverall', 'RegularUnder21', 'Regular9', 'Regular7andUnder']
    expect(ids.map((id) => byID[id]).sort((a, b) => sortKey(a) - sortKey(b)).map((d) => d.id)).toEqual([
      'Regular7andUnder', 'Regular9', 'RegularUnder21', 'RegularOverall', 'Regular65Plus',
    ])
  })
})

describe('mapTopList', () => {
  it('drops entries missing a rank or rating', () => {
    const list = mapTopList(
      { reportDate: '2026-09-01', topPlayers: [{ ordinal: 1, rating: 2066, id: '99000002', firstName: 'Jordan', lastName: 'Lee', stateRep: 'OH' }, { id: 'x' }] },
      byID.Regular9,
    )
    expect(list.entries).toEqual([{ id: '99000002', rank: 1, name: 'Jordan Lee', state: 'OH', rating: 2066 }])
    expect(list.reportDate?.getMonth()).toBe(8)
  })
})
