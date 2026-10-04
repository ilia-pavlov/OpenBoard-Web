// A coach's groups, kept in this browser (no accounts), with ways to move them:
// export/import as a file, and a "share roster" link that carries only member
// IDs in the URL.

export interface Group {
  id: string
  name: string
  memberIDs: string[]
}

const key = 'coach.groups'

function read(): Group[] {
  try {
    const raw = localStorage.getItem(key)
    const groups = raw ? (JSON.parse(raw) as Group[]) : []
    return Array.isArray(groups) ? groups.filter((g) => g && typeof g.id === 'string' && Array.isArray(g.memberIDs)) : []
  } catch {
    return []
  }
}

function write(groups: Group[]) {
  try {
    localStorage.setItem(key, JSON.stringify(groups))
  } catch {
    // Storage blocked (private mode): changes last until the page closes.
  }
}

const newID = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export const groups = {
  all: read,
  get(id: string) {
    return read().find((g) => g.id === id)
  },
  create(name: string, memberIDs: string[] = []): Group {
    const group = { id: newID(), name: name.trim() || 'New group', memberIDs: [...new Set(memberIDs)] }
    write([...read(), group])
    return group
  },
  update(id: string, changes: Partial<Omit<Group, 'id'>>) {
    write(read().map((g) => (g.id === id ? { ...g, ...changes } : g)))
  },
  remove(id: string) {
    write(read().filter((g) => g.id !== id))
  },
  addMembers(id: string, memberIDs: string[]) {
    const group = this.get(id)
    if (group) this.update(id, { memberIDs: [...new Set([...group.memberIDs, ...memberIDs])] })
  },
  removeMember(id: string, memberID: string) {
    const group = this.get(id)
    if (group) this.update(id, { memberIDs: group.memberIDs.filter((m) => m !== memberID) })
  },
}

// MARK: - Moving groups between computers

export interface ExportFile {
  app: 'openboard-coach'
  version: 1
  exportedAt: string
  groups: { name: string; memberIDs: string[] }[]
}

export function exportFile(all: Group[]): ExportFile {
  return { app: 'openboard-coach', version: 1, exportedAt: new Date().toISOString(), groups: all.map(({ name, memberIDs }) => ({ name, memberIDs })) }
}

/** Groups from an export file; throws a readable message for anything else. */
export function parseExportFile(text: string): { name: string; memberIDs: string[] }[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("That file isn't an OpenBoard export.")
  }
  const file = data as Partial<ExportFile>
  if (file?.app !== 'openboard-coach' || !Array.isArray(file.groups)) throw new Error("That file isn't an OpenBoard export.")
  return file.groups
    .filter((g) => g && typeof g.name === 'string' && Array.isArray(g.memberIDs))
    .map((g) => ({ name: g.name.slice(0, 80), memberIDs: g.memberIDs.filter((m) => /^\d{8}$/.test(m)) }))
}

/** A link that recreates a group on another computer: names and member IDs only. */
export function shareRosterURL(group: Group, origin = location.origin): string {
  const params = new URLSearchParams({ name: group.name, ids: group.memberIDs.join(',') })
  return `${origin}/coach/#/import?${params}`
}

export function parseShareRoster(query: string): { name: string; memberIDs: string[] } | undefined {
  const params = new URLSearchParams(query)
  const memberIDs = (params.get('ids') ?? '').split(',').filter((m) => /^\d{8}$/.test(m))
  if (!memberIDs.length) return undefined
  return { name: (params.get('name') ?? 'Shared group').slice(0, 80), memberIDs: [...new Set(memberIDs)] }
}
