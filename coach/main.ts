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
  type PeriodDays, type PlayerRow, type RatingType, type SortKey, chartSeries, groupSummary, lastRatedText, periods, playerRow,
  ratingTypes, resultOf, resultsByEvent, resultsByPlayer, sortRows,
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

function readSetting<T extends string>(key: string, allowed: readonly string[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v && allowed.includes(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}
function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

let groupID: string | null = null
let ratingType: RatingType = readSetting('coach.rating', Object.keys(ratingTypes), 'regular')
let period = Number(readSetting('coach.period', Object.keys(periods), '90')) as PeriodDays
let resultsMode: 'event' | 'player' = readSetting('coach.results', ['event', 'player'], 'event')
let sort: { key: SortKey; descending: boolean } = { key: 'live', descending: true }
let addOpen = false
let renaming = false
let searchQuery = ''
let searchResults: PlayerSummary[] = []
let searchTimer: number | undefined
let message = ''
let disposeChart: (() => void) | undefined

const currentGroup = (): Group | undefined => (groupID ? groups.get(groupID) : undefined)
const periodLabel = () => periods[period]

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
    <div class="coach-controls">
      ${controlChip('rating', 'Rating', ratingTypes[ratingType], Object.entries(ratingTypes), ratingType)}
      ${controlChip('period', 'Period', periodLabel(), Object.entries(periods).map(([k, v]) => [k, v]), String(period))}
      ${ratingType === 'blitz' ? '<span class="muted small">US Chess publishes Blitz ratings without per-tournament changes, so changes and the chart cover Regular and Quick.</span>' : ''}
    </div>
    <div class="group-content"></div>`
  renderGroupContent()
  if (renaming) main.querySelector<HTMLInputElement>('.group-name')?.select()
  else if (addOpen) main.querySelector<HTMLInputElement>('input[name=search]')?.focus()
}

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
  const rows = ready.map((p) => playerRow(p, ratingType, period))
  const summary = groupSummary(rows)
  const pending = group.memberIDs.filter((id) => !players.has(id)).length
  const onTop100 = ready.filter((p) => ranksFor(p.id).length).length
  const chartType = ratingType === 'blitz' ? 'regular' : ratingType

  host.innerHTML = `
    <div class="tiles">
      ${tile('Average live rating', summary.averageLive != null ? String(summary.averageLive) : '–', `${ratingTypes[ratingType]}, rated players`)}
      ${tile(`Change · ${periodLabel()}`, ratingType === 'blitz' ? '–' : summary.periodChange ? signed(summary.periodChange) : '0', `${ratingTypes[ratingType]} points, whole group`, summary.periodChange > 0 ? 'up' : summary.periodChange < 0 ? 'down' : '')}
      ${tile(`Events · ${periodLabel()}`, num(summary.periodEvents), `${ratingTypes[ratingType]}-rated tournaments`)}
      ${tile('On a Top 100 list', String(onTop100), 'US Chess, this month')}
    </div>
    ${pending ? `<p class="muted small loading-line"><span class="spinner" aria-hidden="true"></span> Loading ${pending} of ${group.memberIDs.length} players…</p>` : ''}
    <section class="card chart-card-wide">
      <div class="chart-head">
        <h2 class="section-label">${ratingTypes[chartType]} rating · ${periodLabel()}</h2>
        <span class="muted small">Each dot is a tournament. Click a dot for the player, click a name to hide or show them.</span>
      </div>
      <div class="group-legend"></div>
      <div class="group-chart"></div>
    </section>
    <div class="coach-grid">
      <section class="card roster-card">${rosterTable(group, rows)}</section>
      <aside class="coach-side"><section class="card side-card">${resultsHTML(ready)}</section></aside>
    </div>`

  disposeChart = renderGroupChart(
    host.querySelector<HTMLElement>('.group-chart')!,
    host.querySelector<HTMLElement>('.group-legend')!,
    chartSeries(ready, chartType, period),
    (id, anchor) => openPlayerCard(id, anchor),
  )
}

function tile(title: string, value: string, caption: string, tint = ''): string {
  return `<div class="card coach-tile"><span class="tile-title">${esc(title)}</span><span class="tile-value ${tint}">${esc(value)}</span><span class="tile-caption">${esc(caption)}</span></div>`
}

const playerButton = (id: string, name: string) => `<button class="player-link" type="button" data-player="${esc(id)}">${esc(name)}</button>`

function rosterTable(group: Group, rows: PlayerRow[]): string {
  const columns: { key: SortKey; label: string; numeric?: boolean; title?: string }[] = [
    { key: 'name', label: 'Player' },
    { key: 'published', label: 'Published', numeric: true, title: 'The official rating from the latest monthly supplement' },
    { key: 'live', label: 'Live', numeric: true, title: 'Includes tournaments rated since the monthly supplement' },
    { key: 'lastChange', label: 'Last event', numeric: true },
    { key: 'periodChange', label: periodLabel(), numeric: true, title: `Net change over ${periodLabel()}` },
    { key: 'periodEvents', label: 'Events', numeric: true, title: `Tournaments in ${periodLabel()}` },
    { key: 'lastRated', label: 'Last rated', numeric: true },
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
  const toggle = `<div class="segmented small-seg" role="radiogroup" aria-label="Group results">
    <button type="button" role="radio" aria-checked="${resultsMode === 'event'}" data-results="event">By event</button>
    <button type="button" role="radio" aria-checked="${resultsMode === 'player'}" data-results="player">By player</button>
  </div>`
  const crosstable = (eventID?: string, section?: number) => (eventID ? `/#/event/${esc(eventID)}${section != null ? `?section=${section}` : ''}` : undefined)
  const change = (pre?: number, post?: number) => (pre != null && post != null ? deltaBadge(post - pre) : '')
  let body: string
  if (resultsMode === 'event') {
    const results = resultsByEvent(ready, ratingType, period)
    body = results.length
      ? `<div class="result-list">${results
          .map(
            (r) => `<div class="result-item">
              <a class="result-head" href="${crosstable(r.eventID, r.section)}" target="_blank" rel="noopener"><strong>${esc(r.name)}</strong><small class="muted">${eventDate(r.date)}</small></a>
              <span class="result-players">${r.players.map((p) => `<span>${playerButton(p.id, p.name.split(' ')[0])}${change(p.pre, p.post)}</span>`).join('')}</span>
            </div>`,
          )
          .join('')}</div>`
      : `<p class="muted small">No rated events in ${periodLabel()}.</p>`
  } else {
    const byPlayer = resultsByPlayer(ready, ratingType, period)
    body = byPlayer.length
      ? `<div class="result-list">${byPlayer
          .map(
            (p) => `<div class="result-item">
              <span class="result-head">${playerButton(p.id, p.name)}</span>
              ${p.events
                .map((e) => {
                  const href = crosstable(e.eventID, e.section)
                  const label = `<span class="player-event-name">${esc(e.name)}</span><small class="muted">${eventDate(e.date)}</small>${change(e.pre, e.post)}`
                  return href ? `<a class="player-event" href="${href}" target="_blank" rel="noopener">${label}</a>` : `<span class="player-event">${label}</span>`
                })
                .join('')}
            </div>`,
          )
          .join('')}</div>`
      : `<p class="muted small">No rated events in ${periodLabel()}.</p>`
  }
  return `<div class="side-head"><h2 class="section-label">Recent results</h2>${toggle}</div>${body}`
}

// MARK: - Player card (tap a name or a chart dot)

function closePlayerCard() {
  document.querySelector('.player-card')?.remove()
}

function openPlayerCard(id: string, anchor: HTMLElement) {
  closePlayerCard()
  const p = loadedPlayer(id)
  if (!p) return
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
      <thead><tr><th></th><th>Published</th><th>Live</th><th>${esc(periodLabel())}</th></tr></thead>
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
    resultsMode = resultsButton.dataset.results as 'event' | 'player'
    saveSetting('coach.results', resultsMode)
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
    case 'export':
      download(`openboard-coach-groups-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportFile(groups.all()), null, 2))
      break
  }
})

document.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement | HTMLSelectElement
  if (target.dataset.control === 'rating') {
    ratingType = target.value as RatingType
    saveSetting('coach.rating', ratingType)
    renderGroup()
  } else if (target.dataset.control === 'period') {
    period = Number(target.value) as PeriodDays
    saveSetting('coach.period', String(period))
    renderGroup()
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
  route()
})
startBadges(document.body)
topListsReady().then(redrawSoon)
route()
