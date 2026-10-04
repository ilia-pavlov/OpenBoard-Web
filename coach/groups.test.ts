import { beforeEach, describe, expect, it } from 'vitest'
import { exportFile, groups, parseExportFile, parseShareRoster, shareRosterURL } from './groups'

// Node 25 ships its own (unconfigured) localStorage; use a plain in-memory one.
const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) },
  configurable: true,
})

describe('groups', () => {
  beforeEach(() => memory.clear())

  it('creates groups and adds members once', () => {
    const g = groups.create('Tuesday club', ['99000001'])
    groups.addMembers(g.id, ['99000001', '99000002'])
    expect(groups.get(g.id)?.memberIDs).toEqual(['99000001', '99000002'])
    groups.removeMember(g.id, '99000001')
    expect(groups.get(g.id)?.memberIDs).toEqual(['99000002'])
  })

  it('round-trips through an export file, keeping only valid member IDs', () => {
    groups.create('Grades 3-5', ['99000001'])
    const text = JSON.stringify(exportFile(groups.all()))
    expect(parseExportFile(text)).toEqual([{ name: 'Grades 3-5', memberIDs: ['99000001'] }])
    expect(parseExportFile(JSON.stringify({ app: 'openboard-coach', groups: [{ name: 'x', memberIDs: ['99000001', 'nope'] }] }))).toEqual([{ name: 'x', memberIDs: ['99000001'] }])
    expect(() => parseExportFile('{"hello":1}')).toThrow("isn't an OpenBoard export")
  })

  it('shares a roster as a link with names and member IDs only', () => {
    const g = groups.create('Varsity', ['99000001', '99000002'])
    const url = shareRosterURL(g, 'https://openboard.online')
    expect(url).toBe('https://openboard.online/coach/#/import?name=Varsity&ids=99000001%2C99000002')
    expect(parseShareRoster(url.split('?')[1])).toEqual({ name: 'Varsity', memberIDs: ['99000001', '99000002'] })
    expect(parseShareRoster('name=x&ids=abc')).toBeUndefined()
  })
})
