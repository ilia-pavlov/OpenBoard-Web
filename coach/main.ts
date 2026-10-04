// OpenBoard for Coaches: a desktop dashboard of groups of players, on the same
// US Chess data and relay as the family app. Groups live in this browser; no
// accounts. Routes: #/group/<id>, #/import?name=…&ids=… (a shared roster).

import '../src/tokens.css'
import '../src/styles.css'
import './coach.css'
import { fetchPlayer, searchPlayers } from '../src/api'
import type { Player, PlayerSummary } from '../src/models'
import { cached, write as storeWrite } from '../src/store'
import { badgeSlot, ranksFor, startBadges, topListsReady } from '../src/toplists'
import { type TournamentListing, fetchUpcoming } from '../src/tournaments'
import { clockDigits, daysAgo, deltaBadge, emptyState, esc, eventDate, num, prefs, stateChip } from '../src/ui'
import { type Group, exportFile, groups, parseExportFile, parseShareRoster, shareRosterURL } from './groups'
import { type PlayerRow, type SortKey, groupSummary, parseMemberIDs, playerRow, recentResults, sortRows } from './metrics'

const main = document.getElementById('coach')!
const sidebar = document.querySelector<HTMLElement>('.coach-sidebar')!

// MARK: - Appearance (shared with the family app)

type Appearance = 'system' | 'light' | 'dark'
const appearances: Appearance[] = ['dark', 'light', 'system']
const icons: Record<Appearance, string> = { dark: '☾', light: '☀', system: '◐' }
const currentAppearance = (): Appearance => {
  try {
    const saved = localStorage.getItem('appearance') as Appearance
    return appearances.includes(saved) ? saved : 'dark'
  } catch {
    return 'dark'
  }
}
function applyAppearance(a: Appearance) {
  if (a === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = a
  const button = document.querySelector<HTMLButtonElement>('.appearance')!
  button.textContent = icons[a]
  button.title = `Appearance: ${a[0].toUpperCase()}${a.slice(1)}`
}
document.querySelector('.appearance')!.addEventListener('click', () => {
  const next = appearances[(appearances.indexOf(currentAppearance()) + 1) % appearances.length]
  try {
    localStorage.setItem('appearance', next)
  } catch {}
  applyAppearance(next)
})
applyAppearance(currentAppearance())

// MARK: - Player data (shared relay and caches)

/** Players load a few at a time so a big roster stays inside US Chess's rate limit. */
const concurrency = 3
const playerTTL = 30 * 60 * 1000

type Loaded = Player | Error
const players = new Map<string, Loaded>()
let queue: { id: string; force: boolean }[] = []
let active = 0
let redrawPending = false

function redrawSoon() {
  if (redrawPending) return
  redrawPending = true
  requestAnimationFrame(() => {
    redrawPending = false
    if (currentGroup()) renderGroupContent()
  })
}

function pump() {
  while (active < concurrency && queue.length) {
    const { id, force } = queue.shift()!
    active++
    const request = force
      ? fetchPlayer(id, { force: true }).then(async (p) => (await storeWrite(`coach-player-${id}`, p), p))
      : cached(`coach-player-${id}`, playerTTL, () => fetchPlayer(id))
    request
      .then((p) => players.set(id, p))
      .catch((e: Error) => players.set(id, e))
      .finally(() => {
        active--
        redrawSoon()
        pump()
      })
  }
}

function load(ids: string[], force = false) {
  for (const id of ids) {
    if (!force && players.has(id)) continue
    if (queue.some((q) => q.id === id)) continue
    if (force) players.delete(id)
    queue.push({ id, force })
  }
  pump()
}

// MARK: - State

let groupID: string | null = null
let sort: { key: SortKey; descending: boolean } = { key: 'regular', descending: true }
let addOpen = false
let searchResults: PlayerSummary[] = []
let searchQuery = ''
let searchTimer: number | undefined
let message = ''

const currentGroup = (): Group | undefined => (groupID ? groups.get(groupID) : undefined)

// MARK: - Sidebar

function renderSidebar() {
  const all = groups.all()
  sidebar.innerHTML = `
    <h2 class="section-label">Groups</h2>
    <div class="group-list">
      ${all
        .map(
          (g) => `<a class="group-link${g.id === groupID ? ' active' : ''}" href="#/group/${esc(g.id)}">
            <span class="group-link-name">${esc(g.name)}</span><span class="group-count">${g.memberIDs.length}</span>
          </a>`,
        )
        .join('')}
    </div>
    <form class="new-group" data-form="new-group">
      <input name="name" type="text" placeholder="New group (e.g. Tuesday club)" aria-label="New group name" maxlength="80" required>
      <button class="button" type="submit">Add</button>
    </form>
    <div class="sidebar-tools">
      <button class="link-button" type="button" data-action="export" ${all.length ? '' : 'disabled'}>⬇ Export groups</button>
      <label class="link-button file-button">⬆ Import groups<input type="file" accept="application/json,.json" data-action="import-file" hidden></label>
      <p class="muted small">Groups are saved in this browser on this computer. Export them to keep a backup or move to another computer.</p>
    </div>`
}

// MARK: - Main views

function renderWelcome() {
  main.innerHTML = `
    <section class="coach-welcome">
      <div class="about-crown" aria-hidden="true">♛</div>
      <h1>OpenBoard for Coaches</h1>
      <p class="about-tagline">Your whole team on one screen: every player's rating, recent results and the next tournaments near you.</p>
      <ol class="welcome-steps">
        <li><strong>Create a group</strong> in the left column, like "Tuesday club" or "Grades 3–5".</li>
        <li><strong>Add players</strong> by name, or paste a list of US Chess member IDs.</li>
        <li><strong>Share or back up</strong> a group with a link or an export file. No account needed.</li>
      </ol>
    </section>`
}

function renderImport(query: string) {
  const shared = parseShareRoster(query)
  main.innerHTML = shared
    ? `<section class="card import-card">
        <h1>Add “${esc(shared.name)}”?</h1>
        <p class="muted">A coach shared a group with ${shared.memberIDs.length} ${shared.memberIDs.length === 1 ? 'player' : 'players'}. It will be saved in this browser.</p>
        <div class="about-cta"><button class="button prominent big" type="button" data-action="accept-import">Add this group</button><a class="button big" href="/coach/">Cancel</a></div>
      </section>`
    : emptyState('⚠', 'This link has no players', 'Ask for a new share link.')
  main.onclick = (e) => {
    if (!shared || !(e.target as HTMLElement).closest('[data-action="accept-import"]')) return
    const group = groups.create(shared.name, shared.memberIDs)
    location.hash = `#/group/${group.id}`
  }
}

function renderGroup() {
  const group = currentGroup()!
  main.innerHTML = `
    <header class="group-head">
      <input class="group-name" type="text" value="${esc(group.name)}" aria-label="Group name" maxlength="80" data-action="rename">
      <span class="muted">${group.memberIDs.length} ${group.memberIDs.length === 1 ? 'player' : 'players'}</span>
      <span class="spacer"></span>
      <button class="button" type="button" data-action="toggle-add" aria-expanded="${addOpen}">＋ Add players</button>
      <button class="button" type="button" data-action="refresh" ${group.memberIDs.length ? '' : 'disabled'}>↻ Refresh</button>
      <button class="button" type="button" data-action="share-roster" ${group.memberIDs.length ? '' : 'disabled'}>Share roster</button>
      <button class="button danger" type="button" data-action="delete-group">Delete</button>
    </header>
    ${message ? `<div class="card banner" role="status">${message}</div>` : ''}
    ${addOpen ? addPanel() : ''}
    <div class="group-content"></div>`
  renderGroupContent()
  if (addOpen) main.querySelector<HTMLInputElement>('input[name=search]')?.focus()
}

function addPanel(): string {
  return `<section class="card add-panel">
    <div class="add-search">
      <h2 class="section-label">Find a player</h2>
      <input name="search" type="search" placeholder="Name or 8-digit member ID" autocomplete="off" data-action="search" value="${esc(searchQuery)}">
      <div class="search-results-list">${searchResultsHTML()}</div>
    </div>
    <form class="add-paste" data-form="paste">
      <h2 class="section-label">Or paste member IDs</h2>
      <textarea name="ids" rows="5" placeholder="12345678, 23456789…&#10;A column copied from a spreadsheet works too."></textarea>
      <button class="button prominent" type="submit">Add these players</button>
    </form>
  </section>`
}

function searchResultsHTML(): string {
  const group = currentGroup()
  return searchResults
    .map(
      (p) => `<div class="search-hit">
        <span class="player-text"><span class="player-name"><strong>${esc(p.name)}</strong>${stateChip(p.state)}</span><small class="mono">ID ${esc(p.id)}</small></span>
        ${clockDigits(p.regular, { size: 'sm' })}
        ${group?.memberIDs.includes(p.id) ? '<span class="muted small">Added</span>' : `<button class="button" type="button" data-add="${esc(p.id)}">Add</button>`}
      </div>`,
    )
    .join('')
}

function renderGroupContent() {
  const group = currentGroup()
  const host = main.querySelector<HTMLElement>('.group-content')
  if (!group || !host) return
  if (!group.memberIDs.length) {
    host.innerHTML = emptyState('♟', 'No players yet', 'Use “Add players” to add your kids by name or member ID.')
    return
  }
  load(group.memberIDs)

  const loaded = group.memberIDs.map((id) => players.get(id))
  const ready = loaded.filter((p): p is Player => !!p && !(p instanceof Error))
  const rows = ready.map((p) => playerRow(p))
  const summary = groupSummary(rows)
  const pending = group.memberIDs.length - loaded.filter(Boolean).length
  const onTop100 = ready.filter((p) => ranksFor(p.id).length).length

  host.innerHTML = `
    <div class="tiles">
      ${tile('Average rating', summary.averageRegular != null ? String(summary.averageRegular) : '–', 'Regular, rated players')}
      ${tile('Last 90 days', summary.recentChange ? `${summary.recentChange > 0 ? '+' : ''}${num(summary.recentChange)}` : '0', 'Regular points, whole group', summary.recentChange > 0 ? 'up' : summary.recentChange < 0 ? 'down' : '')}
      ${tile('Events played', num(summary.recentEvents), 'in the last 90 days')}
      ${tile('On a Top 100 list', String(onTop100), 'US Chess, this month')}
    </div>
    ${pending ? `<p class="muted small loading-line"><span class="spinner" aria-hidden="true"></span> Loading ${pending} of ${group.memberIDs.length} players…</p>` : ''}
    <div class="coach-grid">
      <section class="card roster-card">${rosterTable(group, rows)}</section>
      <aside class="coach-side">
        <section class="card side-card">${resultsHTML(ready)}</section>
        <section class="card side-card upcoming-card">${upcomingHTML()}</section>
      </aside>
    </div>`
}

function tile(title: string, value: string, caption: string, tint = ''): string {
  return `<div class="card coach-tile"><span class="tile-title">${esc(title)}</span><span class="tile-value ${tint}">${esc(value)}</span><span class="tile-caption">${esc(caption)}</span></div>`
}

const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Player' },
  { key: 'regular', label: 'Regular', numeric: true },
  { key: 'quick', label: 'Quick', numeric: true },
  { key: 'blitz', label: 'Blitz', numeric: true },
  { key: 'lastChange', label: 'Last event', numeric: true },
  { key: 'recentChange', label: '90 days', numeric: true },
  { key: 'recentEvents', label: 'Events (90d)', numeric: true },
  { key: 'lastRated', label: 'Last rated', numeric: true },
]

function rosterTable(group: Group, rows: PlayerRow[]): string {
  const sorted = sortRows(rows, sort.key, sort.descending)
  const failed = group.memberIDs.filter((id) => players.get(id) instanceof Error)
  const waiting = group.memberIDs.filter((id) => !players.has(id))
  const change = (n?: number) => (n == null ? '<span class="muted">–</span>' : deltaBadge(n))
  return `<table class="roster">
    <thead><tr>
      ${columns
        .map((c) => {
          const active = sort.key === c.key
          const aria = active ? (sort.descending ? 'descending' : 'ascending') : 'none'
          return `<th class="${c.numeric ? 'num' : ''}" aria-sort="${aria}"><button type="button" data-sort="${c.key}">${c.label}${active ? (sort.descending ? ' ▼' : ' ▲') : ''}</button></th>`
        })
        .join('')}
      <th><span class="sr-only">Remove</span></th>
    </tr></thead>
    <tbody>
      ${sorted
        .map(
          (r) => `<tr>
            <td class="player-cell"><a href="/#/player/${esc(r.id)}" target="_blank" rel="noopener"><strong>${esc(r.name)}</strong></a> ${stateChip(r.state)} ${badgeSlot(r.id, 'compact')}<small class="mono">ID ${esc(r.id)}</small></td>
            <td class="num mono">${r.regular ?? '–'}</td>
            <td class="num mono">${r.quick ?? '–'}</td>
            <td class="num mono">${r.blitz ?? '–'}</td>
            <td class="num">${change(r.lastChange)}</td>
            <td class="num">${r.recentEvents ? change(r.recentChange) : '<span class="muted">–</span>'}</td>
            <td class="num mono">${r.recentEvents}</td>
            <td class="num muted">${r.lastRated ? daysAgo(r.lastRated) : 'never'}</td>
            <td><button class="icon-button small" type="button" data-remove="${esc(r.id)}" aria-label="Remove ${esc(r.name)} from the group">✕</button></td>
          </tr>`,
        )
        .join('')}
      ${waiting.map((id) => `<tr class="pending-row"><td class="player-cell"><span class="muted">Loading ID ${esc(id)}…</span></td><td colspan="8"></td></tr>`).join('')}
      ${failed
        .map(
          (id) => `<tr class="pending-row"><td class="player-cell"><span class="text-down">Couldn't load ID ${esc(id)}</span></td><td colspan="7"></td>
            <td><button class="icon-button small" type="button" data-remove="${esc(id)}" aria-label="Remove ID ${esc(id)}">✕</button></td></tr>`,
        )
        .join('')}
    </tbody>
  </table>`
}

function resultsHTML(ready: Player[]): string {
  const results = recentResults(ready)
  return `<h2 class="section-label">Recent results</h2>
    ${
      results.length
        ? `<div class="result-list">${results
            .map(
              (r) => `<a class="result-item" href="/#/event/${esc(r.eventID)}${r.section != null ? `?section=${r.section}` : ''}" target="_blank" rel="noopener">
                <span class="result-head"><strong>${esc(r.name)}</strong><small class="muted">${eventDate(r.date)}</small></span>
                <span class="result-players">${r.players
                  .map((p) => `<span>${esc(p.name.split(' ')[0])}${p.pre != null && p.post != null ? ` ${deltaBadge(p.post - p.pre)}` : ''}</span>`)
                  .join('')}</span>
              </a>`,
            )
            .join('')}</div>`
        : '<p class="muted small">No rated events in the last 60 days.</p>'
    }`
}

// MARK: - Upcoming tournaments near the coach

let upcoming: { origin: string; request: Promise<TournamentListing[]> } | undefined

function coachLocation(): string | undefined {
  try {
    return localStorage.getItem('coach.location') ?? prefs.location?.origin ?? undefined
  } catch {
    return prefs.location?.origin
  }
}

function upcomingHTML(): string {
  const origin = coachLocation()
  const form = `<form class="location-inline" data-form="location">
      <input name="origin" type="text" placeholder="City or ZIP" value="${esc(origin ?? '')}" aria-label="City or ZIP for upcoming tournaments">
      <button class="button" type="submit">Set</button>
    </form>`
  if (!origin) return `<h2 class="section-label">Upcoming near you</h2>${form}<p class="muted small">Enter your school's city or ZIP to see tournaments within 50 miles.</p>`
  if (upcoming?.origin !== origin) {
    upcoming = { origin, request: fetchUpcoming(origin, 50) }
    upcoming.request.then(redrawSoon, redrawSoon)
  }
  let list = '<p class="muted small">Loading tournaments…</p>'
  const settled = settledValue(upcoming.request)
  if (settled instanceof Error) list = '<p class="muted small">Couldn\'t load tournaments right now.</p>'
  else if (settled) {
    const next = settled.filter((l) => !l.isRecurring).slice(0, 6)
    list = next.length
      ? `<div class="result-list">${next
          .map(
            (l) => `<a class="result-item" href="/#/tournament${esc(l.id)}" target="_blank" rel="noopener">
              <span class="result-head"><strong>${esc(l.name)}</strong></span>
              <small class="muted">${l.startDate ? eventDate(l.startDate) : ''}${l.location ? ` · ${esc(l.location)}` : ''}</small>
            </a>`,
          )
          .join('')}</div>`
      : '<p class="muted small">No tournaments within 50 miles right now.</p>'
  }
  return `<h2 class="section-label">Upcoming near ${esc(origin)}</h2>${form}${list}`
}

/** A promise's value once settled (or the Error it failed with), else undefined. */
const settled = new WeakMap<Promise<unknown>, unknown>()
function settledValue<T>(p: Promise<T>): T | Error | undefined {
  if (!settled.has(p)) {
    settled.set(p, undefined)
    p.then((v) => settled.set(p, v), (e) => settled.set(p, e instanceof Error ? e : new Error(String(e))))
  }
  return settled.get(p) as T | Error | undefined
}

// MARK: - Events

function download(filename: string, data: string) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

document.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement
  const group = currentGroup()

  const sortButton = target.closest<HTMLElement>('[data-sort]')
  if (sortButton) {
    const key = sortButton.dataset.sort as SortKey
    sort = sort.key === key ? { key, descending: !sort.descending } : { key, descending: key !== 'name' }
    renderGroupContent()
    return
  }
  const add = target.closest<HTMLElement>('[data-add]')
  if (add && group) {
    groups.addMembers(group.id, [add.dataset.add!])
    renderSidebar()
    renderGroup()
    return
  }
  const remove = target.closest<HTMLElement>('[data-remove]')
  if (remove && group) {
    groups.removeMember(group.id, remove.dataset.remove!)
    renderSidebar()
    renderGroup()
    return
  }

  switch (target.closest<HTMLElement>('[data-action]')?.dataset.action) {
    case 'toggle-add':
      addOpen = !addOpen
      renderGroup()
      break
    case 'refresh':
      if (group) {
        load(group.memberIDs, true)
        message = 'Refreshing ratings from US Chess…'
        renderGroup()
        message = ''
      }
      break
    case 'share-roster':
      if (group) {
        const url = shareRosterURL(group)
        try {
          await navigator.clipboard.writeText(url)
          message = `Link copied. Anyone who opens it can add “${esc(group.name)}” to their own OpenBoard for Coaches. It contains only names and member IDs.`
        } catch {
          window.prompt('Copy this link', url)
        }
        renderGroup()
        message = ''
      }
      break
    case 'delete-group':
      if (group && confirm(`Delete “${group.name}”? Players stay on US Chess; only this group is removed from this browser.`)) {
        groups.remove(group.id)
        location.hash = ''
      }
      break
    case 'export':
      download(`openboard-coach-groups-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportFile(groups.all()), null, 2))
      break
  }
})

document.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement
  const group = currentGroup()
  if (target.dataset.action === 'rename' && group) {
    groups.update(group.id, { name: target.value.trim() || group.name })
    renderSidebar()
  } else if (target.dataset.action === 'import-file' && target.files?.[0]) {
    try {
      const imported = parseExportFile(await target.files[0].text())
      for (const g of imported) groups.create(g.name, g.memberIDs)
      message = `Imported ${imported.length} ${imported.length === 1 ? 'group' : 'groups'}.`
      renderSidebar()
      route()
      message = ''
    } catch (error) {
      alert((error as Error).message)
    }
    target.value = ''
  }
})

document.addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement
  if (target.dataset.action !== 'search') return
  clearTimeout(searchTimer)
  searchQuery = target.value
  const query = target.value.trim()
  searchTimer = window.setTimeout(async () => {
    searchResults = query.length >= 2 ? await searchPlayers(query).catch(() => []) : []
    const list = main.querySelector('.search-results-list')
    if (list) list.innerHTML = searchResultsHTML()
  }, 300)
})

document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement
  const kind = form.dataset.form
  if (!kind) return
  e.preventDefault()
  const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement).value
  if (kind === 'new-group') {
    const group = groups.create(field('name'))
    addOpen = true
    location.hash = `#/group/${group.id}`
  } else if (kind === 'paste') {
    const group = currentGroup()
    const ids = parseMemberIDs(field('ids'))
    if (group && ids.length) {
      groups.addMembers(group.id, ids)
      message = `Added ${ids.length} ${ids.length === 1 ? 'player' : 'players'}.`
      renderSidebar()
      renderGroup()
      message = ''
    }
  } else if (kind === 'location') {
    const origin = field('origin').trim()
    try {
      if (origin) localStorage.setItem('coach.location', origin)
    } catch {}
    renderGroupContent()
  }
})

// MARK: - Routing

function route() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?')
  const match = path.match(/^\/group\/([\w-]+)$/)
  groupID = match && groups.get(match[1]) ? match[1] : null
  if (!groupID && !path.startsWith('/import')) {
    const first = groups.all()[0]
    if (first) {
      history.replaceState(null, '', `#/group/${first.id}`)
      groupID = first.id
    }
  }
  main.onclick = null
  renderSidebar()
  if (path.startsWith('/import')) renderImport(query)
  else if (groupID) renderGroup()
  else renderWelcome()
}

window.addEventListener('hashchange', () => {
  addOpen = false
  searchResults = []
  searchQuery = ''
  route()
})
startBadges(main)
topListsReady().then(redrawSoon)
route()
