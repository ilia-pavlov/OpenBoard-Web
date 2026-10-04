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
import { clockDigits, deltaBadge, emptyState, esc, eventDate, num, signed, stateChip } from '../src/ui'
import { renderGroupChart, resetChart } from './chart'
import { type Group, exportFile, groups, parseExportFile, parseShareRoster, shareRosterURL } from './groups'
import {
  type PeriodDays, type PlayerRow, type RatingType, type ResultFilter, type ResultRow, type SortKey, chartSeries, groupSummary,
  lastRatedText, periods, playerRow, ratingTypes, resultFilters, resultOf, resultRows, sortRows,
} from './metrics'

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

const players = new Map<string, Player | Error>()
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

const loadedPlayer = (id: string) => {
  const p = players.get(id)
  return p && !(p instanceof Error) ? p : undefined
}

// MARK: - State

function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

/** Each widget has its own controls, remembered in this browser. */
interface Settings {
  overview: { type: RatingType; period: PeriodDays }
  players: { type: RatingType; period: PeriodDays }
  chart: { type: RatingType; period: PeriodDays; result: ResultFilter }
  results: { type: RatingType; period: PeriodDays; result: ResultFilter; player: string; mode: 'event' | 'player' }
}

const defaultSettings: Settings = {
  overview: { type: 'regular', period: 90 },
  players: { type: 'regular', period: 90 },
  chart: { type: 'regular', period: 365, result: 'all' },
  results: { type: 'regular', period: 90, result: 'all', player: '', mode: 'event' },
}

function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('coach.settings') ?? '{}') as Partial<Settings>
    return {
      overview: { ...defaultSettings.overview, ...saved.overview },
      players: { ...defaultSettings.players, ...saved.players },
      chart: { ...defaultSettings.chart, ...saved.chart },
      results: { ...defaultSettings.results, ...saved.results, player: '' },
    }
  } catch {
    return structuredClone(defaultSettings)
  }
}

const settings = readSettings()
const saveSettings = () => saveSetting('coach.settings', JSON.stringify(settings))

/** Results show in pages, so a big group's season stays readable. */
const resultsPage = 30
let resultsLimit = resultsPage

let groupID: string | null = null
let sort: { key: SortKey; descending: boolean } = { key: 'live', descending: true }
let addOpen = false
let renaming = false
let searchQuery = ''
let searchResults: PlayerSummary[] = []
let searchTimer: number | undefined
let message = ''
let disposeChart: (() => void) | undefined

const currentGroup = (): Group | undefined => (groupID ? groups.get(groupID) : undefined)
/** Per-tournament results exist for Regular and Quick only, so the chart and results offer those two. */
const perEventTypes = { regular: 'Regular', quick: 'Quick' } as const

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

// MARK: - Welcome and shared-roster screens

function renderWelcome() {
  main.innerHTML = `
    <section class="coach-welcome">
      <div class="about-crown" aria-hidden="true">♛</div>
      <h1>OpenBoard for Coaches</h1>
      <p class="about-tagline">Your whole team on one screen: every player's published and live ratings, how they're trending, and their latest results.</p>
      <ol class="welcome-steps">
        <li><strong>Create a group</strong> in the left column, like "Tuesday club" or "Grades 3–5".</li>
        <li><strong>Add players</strong> by name or US Chess member ID.</li>
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
}

// MARK: - Group view

function renderGroup() {
  const group = currentGroup()!
  const count = `${group.memberIDs.length} ${group.memberIDs.length === 1 ? 'player' : 'players'}`
  main.innerHTML = `
    <header class="group-head">
      ${
        renaming
          ? `<form class="rename-form" data-form="rename">
              <input class="group-name editing" name="name" type="text" value="${esc(group.name)}" aria-label="Group name" maxlength="80" required>
              <button class="button prominent" type="submit">Save</button>
              <button class="button" type="button" data-action="cancel-rename">Cancel</button>
            </form>`
          : `<h1 class="group-title">${esc(group.name)}</h1>
             <button class="button icon-label" type="button" data-action="rename">✎ Rename</button>`
      }
      <span class="muted">${count}</span>
      <span class="spacer"></span>
      <button class="button${addOpen ? ' active-toggle' : ''}" type="button" data-action="toggle-add" aria-expanded="${addOpen}">＋ Add players</button>
      <button class="button" type="button" data-action="refresh" ${group.memberIDs.length ? '' : 'disabled'}>↻ Refresh</button>
      <button class="button" type="button" data-action="share-roster" ${group.memberIDs.length ? '' : 'disabled'}>Share roster</button>
      <button class="button danger" type="button" data-action="delete-group">Delete</button>
    </header>
    ${message ? `<div class="card banner" role="status">${message}</div>` : ''}
    ${addOpen ? addPanel() : ''}
    <div class="group-content"></div>`
  renderGroupContent()
  if (renaming) main.querySelector<HTMLInputElement>('.group-name')?.select()
  else if (addOpen) main.querySelector<HTMLInputElement>('input[name=search]')?.focus()
}

const periodOptions = () => Object.entries(periods) as [string, string][]

function controlChip(key: string, label: string, title: string, options: [string, string][], value: string): string {
  return `<label class="chip control-chip">
    <span class="control-label">${label}</span><span class="chip-text">${esc(title)}</span><span aria-hidden="true">▾</span>
    <select data-control="${key}" aria-label="${label}">
      ${options.map(([k, v]) => `<option value="${esc(k)}"${k === value ? ' selected' : ''}>${esc(v)}</option>`).join('')}
    </select>
  </label>`
}

function addPanel(): string {
  return `<section class="card add-panel">
    <div class="add-head">
      <h2 class="section-label">Add players</h2>
      <button class="button prominent" type="button" data-action="toggle-add">Done</button>
    </div>
    <input name="search" type="search" placeholder="Search by name or 8-digit member ID" autocomplete="off" data-action="search" value="${esc(searchQuery)}">
    <div class="search-results-list">${searchResultsHTML()}</div>
  </section>`
}

function searchResultsHTML(): string {
  const group = currentGroup()
  if (!searchResults.length) return searchQuery.trim().length >= 2 ? '<p class="muted small">No players found.</p>' : ''
  return searchResults
    .map(
      (p) => `<div class="search-hit">
        <span class="player-text"><span class="player-name"><strong>${esc(p.name)}</strong>${stateChip(p.state)}</span><small class="mono">ID ${esc(p.id)}</small></span>
        ${clockDigits(p.regular, { size: 'sm' })}
        ${group?.memberIDs.includes(p.id) ? '<span class="added-label">✓ Added</span>' : `<button class="button" type="button" data-add="${esc(p.id)}">Add</button>`}
      </div>`,
    )
    .join('')
}

function renderGroupContent() {
  const group = currentGroup()
  const host = main.querySelector<HTMLElement>('.group-content')
  if (!group || !host) return
  disposeChart?.()
  disposeChart = undefined
  if (!group.memberIDs.length) {
    host.innerHTML = emptyState('♟', 'No players yet', 'Use “Add players” to add your kids by name or member ID.')
    return
  }
  load(group.memberIDs)

  const ready = group.memberIDs.map(loadedPlayer).filter((p): p is Player => !!p)
  const { overview: os, players: ps, chart: cs } = settings
  const rows = ready.map((p) => playerRow(p, ps.type, ps.period))
  const summary = groupSummary(ready.map((p) => playerRow(p, os.type, os.period)))
  const pending = group.memberIDs.filter((id) => !players.has(id)).length
  const onTop100 = ready.filter((p) => ranksFor(p.id).length).length
  const typeLabel = ratingTypes[ps.type]
  const periodLabel = periods[ps.period]
  const overviewType = ratingTypes[os.type]
  const overviewPeriod = periods[os.period]

  host.innerHTML = `
    <section class="overview">
      <div class="widget-head">
        <h2 class="section-label">Overview</h2>
        <div class="coach-controls">
          ${controlChip('overview.period', 'Period', overviewPeriod, periodOptions(), String(os.period))}
          ${controlChip('overview.type', 'Rating', overviewType, Object.entries(ratingTypes), os.type)}
        </div>
      </div>
      <div class="tiles">
        ${tile('Average live rating', summary.averageLive != null ? String(summary.averageLive) : '–', `${overviewType}, rated players`)}
        ${tile(`Change · ${overviewPeriod}`, os.type === 'blitz' ? '–' : summary.periodChange ? signed(summary.periodChange) : '0', `${overviewType} points, whole group`, summary.periodChange > 0 ? 'up' : summary.periodChange < 0 ? 'down' : '')}
        ${tile(`Events · ${overviewPeriod}`, os.type === 'blitz' ? '–' : num(summary.periodEvents), `${overviewType}-rated tournaments`)}
        ${tile('On a Top 100 list', String(onTop100), 'US Chess, this month')}
      </div>
    </section>
    ${pending ? `<p class="muted small loading-line"><span class="spinner" aria-hidden="true"></span> Loading ${pending} of ${group.memberIDs.length} players…</p>` : ''}

    <section class="card widget chart-card-wide">
      <div class="widget-head">
        <h2 class="section-label">Rating over time</h2>
        <div class="coach-controls">
          ${controlChip('chart.period', 'Period', periods[cs.period], periodOptions(), String(cs.period))}
          ${controlChip('chart.type', 'Rating', perEventTypes[cs.type as 'regular' | 'quick'] ?? 'Regular', Object.entries(perEventTypes), cs.type)}
          ${controlChip('chart.result', 'Result', resultFilters[cs.result], Object.entries(resultFilters), cs.result)}
        </div>
      </div>
      <p class="muted small">Each dot is a tournament${cs.result === 'all' ? '' : ` where the player ${cs.result === 'up' ? 'gained' : cs.result === 'down' ? 'lost' : 'kept the same'} rating`}. Click a dot for the player; click a name to hide or show them.</p>
      <div class="group-legend"></div>
      <div class="group-chart"></div>
    </section>

    <section class="card widget roster-card">
      <div class="widget-head">
        <h2 class="section-label">Players</h2>
        <div class="coach-controls">
          ${controlChip('players.period', 'Period', periodLabel, periodOptions(), String(ps.period))}
          ${controlChip('players.type', 'Rating', typeLabel, Object.entries(ratingTypes), ps.type)}
        </div>
      </div>
      ${ps.type === 'blitz' ? '<p class="muted small">US Chess publishes Blitz ratings without per-tournament results, so Blitz shows ratings only.</p>' : ''}
      <div class="table-scroll">${rosterTable(group, rows)}</div>
    </section>

    <section class="card widget results-card">${resultsHTML(ready)}</section>`

  disposeChart = renderGroupChart(
    host.querySelector<HTMLElement>('.group-chart')!,
    host.querySelector<HTMLElement>('.group-legend')!,
    chartSeries(ready, cs.type === 'blitz' ? 'regular' : cs.type, cs.period),
    (id, anchor) => openPlayerCard(id, anchor),
    cs.result,
  )
}

function tile(title: string, value: string, caption: string, tint = ''): string {
  return `<div class="card coach-tile"><span class="tile-title">${esc(title)}</span><span class="tile-value ${tint}">${esc(value)}</span><span class="tile-caption">${esc(caption)}</span></div>`
}

const playerButton = (id: string, name: string) => `<button class="player-link" type="button" data-player="${esc(id)}">${esc(name)}</button>`

function rosterTable(group: Group, rows: PlayerRow[]): string {
  const periodLabel = periods[settings.players.period]
  const columns: { key: SortKey; label: string; numeric?: boolean; title?: string }[] = [
    { key: 'name', label: 'Player' },
    { key: 'published', label: 'Published', numeric: true, title: 'The official rating from the latest monthly supplement' },
    { key: 'live', label: 'Live', numeric: true, title: 'Includes tournaments rated since the monthly supplement' },
    { key: 'lastChange', label: 'Last event', numeric: true },
    { key: 'periodChange', label: `Change · ${periodLabel}`, numeric: true, title: `Net rating change over ${periodLabel}` },
    { key: 'periodEvents', label: `Events · ${periodLabel}`, numeric: true, title: `How many tournaments were rated in ${periodLabel}` },
    { key: 'lastRated', label: 'Last tournament', numeric: true, title: 'When the latest tournament (any rating) was rated' },
  ]
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
          return `<th class="${c.numeric ? 'num' : ''}" aria-sort="${aria}"${c.title ? ` title="${esc(c.title)}"` : ''}><button type="button" data-sort="${c.key}">${esc(c.label)}${active ? (sort.descending ? ' ▼' : ' ▲') : ''}</button></th>`
        })
        .join('')}
      <th><span class="sr-only">Remove</span></th>
    </tr></thead>
    <tbody>
      ${sorted
        .map((r) => {
          const pendingSupplement = r.live != null && r.published != null && r.live !== r.published
          return `<tr>
            <td class="player-cell">${playerButton(r.id, r.name)} ${stateChip(r.state)} ${badgeSlot(r.id, 'compact')}<small class="mono">ID ${esc(r.id)}</small></td>
            <td class="num mono">${r.published ?? '–'}</td>
            <td class="num mono${pendingSupplement ? ' live-new' : ''}"${pendingSupplement ? ' title="New since the monthly supplement"' : ''}>${r.live ?? '–'}</td>
            <td class="num">${change(r.lastChange)}</td>
            <td class="num">${r.periodEvents ? change(r.periodChange) : '<span class="muted">–</span>'}</td>
            <td class="num mono">${r.periodEvents}</td>
            <td class="num muted">${lastRatedText(r.lastRated)}</td>
            <td><button class="icon-button small" type="button" data-remove="${esc(r.id)}" aria-label="Remove ${esc(r.name)} from the group">✕</button></td>
          </tr>`
        })
        .join('')}
      ${waiting.map((id) => `<tr class="pending-row"><td class="player-cell"><span class="muted">Loading ID ${esc(id)}…</span></td><td colspan="7"></td></tr>`).join('')}
      ${failed
        .map(
          (id) => `<tr class="pending-row"><td class="player-cell"><span class="text-down">Couldn't load ID ${esc(id)}</span></td><td colspan="6"></td>
            <td><button class="icon-button small" type="button" data-remove="${esc(id)}" aria-label="Remove ID ${esc(id)}">✕</button></td></tr>`,
        )
        .join('')}
    </tbody>
  </table>`
}

function resultsHTML(ready: Player[]): string {
  const rs = settings.results
  const type = rs.type === 'blitz' ? 'regular' : rs.type
  const rows = resultRows(ready, type, rs.period, rs.result, rs.player || undefined)
  const playerOptions: [string, string][] = [['', 'All players'], ...ready.map((p) => [p.id, p.name] as [string, string])]
  const playerLabel = rs.player ? (ready.find((p) => p.id === rs.player)?.name ?? 'All players') : 'All players'
  const gained = rows.filter((r) => r.change > 0).length
  const lost = rows.filter((r) => r.change < 0).length
  const net = rows.reduce((sum, r) => sum + r.change, 0)

  const head = `<div class="widget-head">
      <h2 class="section-label">Recent results</h2>
      <div class="coach-controls">
        ${controlChip('results.period', 'Period', periods[rs.period], periodOptions(), String(rs.period))}
        ${controlChip('results.type', 'Rating', perEventTypes[type], Object.entries(perEventTypes), type)}
        ${controlChip('results.result', 'Result', resultFilters[rs.result], Object.entries(resultFilters), rs.result)}
        ${controlChip('results.player', 'Player', playerLabel, playerOptions, rs.player)}
        <div class="segmented small-seg" role="radiogroup" aria-label="Group results by">
          <button type="button" role="radio" aria-checked="${rs.mode === 'event'}" data-results="event">By event</button>
          <button type="button" role="radio" aria-checked="${rs.mode === 'player'}" data-results="player">By player</button>
        </div>
      </div>
    </div>
    <p class="results-summary small">${rows.length} ${rows.length === 1 ? 'result' : 'results'} · <span class="text-up">▲ ${gained} gained</span> · <span class="text-down">▼ ${lost} lost</span> · net ${rows.length ? deltaBadge(net) : '–'}</p>`

  if (!rows.length) return `${head}<p class="muted">No ${rs.result === 'all' ? '' : `${resultFilters[rs.result].toLowerCase()} `}results in ${periods[rs.period]}.</p>`

  const shown = rows.slice(0, resultsLimit)
  const crosstable = (r: ResultRow) => (r.eventID ? `/#/event/${esc(r.eventID)}${r.section != null ? `?section=${r.section}` : ''}` : undefined)
  const eventLink = (r: ResultRow) => {
    const href = crosstable(r)
    return href ? `<a class="event-link" href="${href}" target="_blank" rel="noopener">${esc(r.event)}</a>` : esc(r.event)
  }
  const ratingCells = (r: ResultRow) => `<td class="num mono">${r.pre} → ${r.post}</td><td class="num">${deltaBadge(r.change)}</td>`

  let body = ''
  if (rs.mode === 'event') {
    let current = ''
    for (const r of shown) {
      const key = `${r.eventID ?? r.event}|${r.date?.getTime()}`
      if (key !== current) {
        current = key
        const players = rows.filter((x) => `${x.eventID ?? x.event}|${x.date?.getTime()}` === key)
        body += `<tr class="group-row"><td colspan="2">${eventLink(r)}</td><td class="muted small" colspan="2">${eventDate(r.date)} · ${players.length} ${players.length === 1 ? 'player' : 'players'}</td></tr>`
      }
      body += `<tr><td class="indent">${playerButton(r.playerID, r.playerName)}</td><td></td>${ratingCells(r)}</tr>`
    }
  } else {
    const byPlayer = new Map<string, ResultRow[]>()
    for (const r of shown) byPlayer.set(r.playerID, [...(byPlayer.get(r.playerID) ?? []), r])
    for (const [id, list] of byPlayer) {
      const all = rows.filter((x) => x.playerID === id)
      const playerNet = all.reduce((sum, x) => sum + x.change, 0)
      body += `<tr class="group-row"><td colspan="2">${playerButton(id, list[0].playerName)}</td><td class="muted small">${all.length} ${all.length === 1 ? 'tournament' : 'tournaments'}</td><td class="num">${deltaBadge(playerNet)}</td></tr>`
      for (const r of list) body += `<tr><td class="indent">${eventLink(r)}</td><td class="muted small nowrap">${eventDate(r.date)}</td>${ratingCells(r)}</tr>`
    }
  }

  return `${head}
    <div class="table-scroll"><table class="results-table">
      <thead><tr><th>${rs.mode === 'event' ? 'Tournament / player' : 'Player / tournament'}</th><th>${rs.mode === 'event' ? '' : 'Date'}</th><th class="num">Rating</th><th class="num">Change</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    ${rows.length > resultsLimit ? `<button class="button show-more" type="button" data-action="more-results">Show more (${rows.length - resultsLimit} more)</button>` : ''}`
}

// MARK: - Player card (tap a name or a chart dot)

function closePlayerCard() {
  document.querySelector('.player-card')?.remove()
}

function openPlayerCard(id: string, anchor: HTMLElement) {
  closePlayerCard()
  const p = loadedPlayer(id)
  if (!p) return
  const { type: ratingType, period } = settings.players
  const rows = (['regular', 'quick', 'blitz'] as RatingType[]).map((t) => ({ t, row: playerRow(p, t, period) }))
  const last = p.events[0]
  const lastResult = last ? (resultOf(last, ratingType) ?? last.regular ?? last.quick) : undefined
  const card = document.createElement('div')
  card.className = 'card player-card'
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-label', `${p.name} quick view`)
  card.innerHTML = `
    <div class="pc-head">
      <div><strong class="pc-name">${esc(p.name)}</strong> ${stateChip(p.state)}<small class="mono muted">ID ${esc(p.id)}</small></div>
      <button class="icon-button small" type="button" data-action="close-card" aria-label="Close">✕</button>
    </div>
    ${badgeSlot(p.id, 'all')}
    <table class="pc-ratings">
      <thead><tr><th></th><th>Published</th><th>Live</th><th>${esc(periods[period])}</th></tr></thead>
      <tbody>${rows
        .map(
          ({ t, row }) => `<tr><th>${ratingTypes[t]}</th><td class="mono">${row.published ?? '–'}</td><td class="mono${row.live != null && row.live !== row.published ? ' live-new' : ''}">${row.live ?? '–'}</td>
            <td>${row.periodEvents && row.periodChange != null ? deltaBadge(row.periodChange) : '<span class="muted">–</span>'}</td></tr>`,
        )
        .join('')}</tbody>
    </table>
    ${
      last
        ? `<div class="pc-last"><span class="muted small">Last event</span><strong>${esc(last.name)}</strong>
            <span class="small muted">${eventDate(last.date)}${lastResult?.pre != null && lastResult.post != null ? ` · ${lastResult.pre} → ${lastResult.post}` : ''}</span></div>`
        : '<p class="muted small">No rated events yet.</p>'
    }
    <div class="pc-actions">
      <a class="button prominent" href="/#/player/${esc(p.id)}" target="_blank" rel="noopener">View full profile ↗</a>
      <a class="button" href="/#/player/${esc(p.id)}/history?system=${ratingType === 'quick' ? 'quick' : 'regular'}" target="_blank" rel="noopener">Rating history ↗</a>
    </div>`
  document.body.append(card)

  // Next to the name (or the chart), kept on screen.
  const rect = anchor.getBoundingClientRect()
  const width = card.offsetWidth
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
  const below = rect.bottom + 8
  const top = below + card.offsetHeight > window.innerHeight - 8 ? Math.max(8, rect.top - card.offsetHeight - 8) : below
  card.style.left = `${left + window.scrollX}px`
  card.style.top = `${top + window.scrollY}px`
  card.querySelector<HTMLElement>('a.button')?.focus()
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePlayerCard()
})

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

  // Player card: open on a name, close on anything outside it.
  const playerLink = target.closest<HTMLElement>('[data-player]')
  if (playerLink) {
    openPlayerCard(playerLink.dataset.player!, playerLink)
    return
  }
  if (target.closest('[data-action="close-card"]') || !target.closest('.player-card, .group-chart')) closePlayerCard()

  const sortButton = target.closest<HTMLElement>('[data-sort]')
  if (sortButton) {
    const key = sortButton.dataset.sort as SortKey
    sort = sort.key === key ? { key, descending: !sort.descending } : { key, descending: key !== 'name' }
    renderGroupContent()
    return
  }
  const resultsButton = target.closest<HTMLElement>('[data-results]')
  if (resultsButton) {
    settings.results.mode = resultsButton.dataset.results as 'event' | 'player'
    saveSettings()
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
    case 'accept-import': {
      const shared = parseShareRoster(location.hash.split('?')[1] ?? '')
      if (shared) location.hash = `#/group/${groups.create(shared.name, shared.memberIDs).id}`
      break
    }
    case 'toggle-add':
      addOpen = !addOpen
      if (!addOpen) {
        searchQuery = ''
        searchResults = []
      }
      renderGroup()
      break
    case 'rename':
      renaming = true
      renderGroup()
      break
    case 'cancel-rename':
      renaming = false
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
    case 'more-results':
      resultsLimit += resultsPage
      renderGroupContent()
      break
    case 'export':
      download(`openboard-coach-groups-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportFile(groups.all()), null, 2))
      break
  }
})

document.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement | HTMLSelectElement
  const control = target.dataset.control
  if (control) {
    const [widget, key] = control.split('.') as [keyof Settings, string]
    const value = key === 'period' ? Number(target.value) : target.value
    ;(settings[widget] as Record<string, unknown>)[key] = value
    if (widget === 'results') resultsLimit = resultsPage
    saveSettings()
    renderGroupContent()
  } else if (target.dataset.action === 'import-file' && (target as HTMLInputElement).files?.[0]) {
    const input = target as HTMLInputElement
    try {
      const imported = parseExportFile(await input.files![0].text())
      for (const g of imported) groups.create(g.name, g.memberIDs)
      message = `Imported ${imported.length} ${imported.length === 1 ? 'group' : 'groups'}.`
      route()
      message = ''
    } catch (error) {
      alert((error as Error).message)
    }
    input.value = ''
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
  const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value
  if (kind === 'new-group') {
    const group = groups.create(field('name'))
    addOpen = true
    location.hash = `#/group/${group.id}`
  } else if (kind === 'rename') {
    const group = currentGroup()
    const name = field('name').trim()
    if (group && name) groups.update(group.id, { name })
    renaming = false
    renderSidebar()
    renderGroup()
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
  disposeChart?.()
  disposeChart = undefined
  closePlayerCard()
  renderSidebar()
  if (path.startsWith('/import')) renderImport(query)
  else if (groupID) renderGroup()
  else renderWelcome()
}

window.addEventListener('hashchange', () => {
  addOpen = false
  renaming = false
  searchQuery = ''
  searchResults = []
  resetChart()
  settings.results.player = ''
  resultsLimit = resultsPage
  route()
})
startBadges(document.body)
topListsReady().then(redrawSoon)
route()
