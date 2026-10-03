// Rating History: every rated event as a chart plus a list, filterable by
// rating system, event count, period, and result. Filters live in the URL so
// a filtered view can be bookmarked or shared. Port of RatingHistoryView.

import { fetchPlayer } from '../api'
import { type ChartEntry, renderHistoryChart } from '../chart'
import { type EventResult, type Player, type RatingSystem, resultFor } from '../models'
import type { View } from '../router'
import { replaceQuery } from '../router'
import { deltaBadge, emptyState, errorCard, esc, eventRow, prefs, sectionLabel, skeleton } from '../ui'

const counts = { all: 'All events', '5': 'Last 5', '10': 'Last 10', '20': 'Last 20' } as const
const periods = { all: 'All time', '3m': '3 months', '1y': '1 year' } as const
const directions = { all: 'Any result', up: 'Gained', down: 'Lost', even: 'No change' } as const
const chipTitles = { count: 'Events', period: 'Time', result: 'Result' }

type Filters = {
  system: RatingSystem
  count: keyof typeof counts
  period: keyof typeof periods
  result: keyof typeof directions
}

function readFilters(params: URLSearchParams): Filters {
  const pick = <T extends object>(key: string, options: T, fallback: keyof T) =>
    ((params.get(key) ?? '') in options ? params.get(key) : fallback) as keyof T
  return {
    system: params.get('system') === 'quick' ? 'quick' : 'regular',
    count: pick('count', counts, 'all'),
    period: pick('period', periods, 'all'),
    result: pick('result', directions, 'all'),
  }
}

function writeFilters(f: Filters) {
  const params = new URLSearchParams({ system: f.system })
  if (f.count !== 'all') params.set('count', f.count)
  if (f.period !== 'all') params.set('period', f.period)
  if (f.result !== 'all') params.set('result', f.result)
  replaceQuery(params)
}

interface Entry extends ChartEntry {
  event: EventResult
}

/** Chart window: rated events for the system, oldest → newest, cut by period then count. */
function entriesFor(player: Player, f: Filters): Entry[] {
  let events = player.events.filter((e) => resultFor(e, f.system)?.post != null).reverse()
  if (f.period !== 'all') {
    const cutoff = new Date()
    if (f.period === '3m') cutoff.setMonth(cutoff.getMonth() - 3)
    else cutoff.setFullYear(cutoff.getFullYear() - 1)
    events = events.filter((e) => (e.date?.getTime() ?? 0) >= cutoff.getTime())
  }
  if (f.count !== 'all') events = events.slice(-Number(f.count))
  return events.map((event) => {
    const r = resultFor(event, f.system)!
    const post = r.post!
    const pre = r.pre ?? post
    const d = post - pre
    const matches =
      f.result === 'all' || (f.result === 'up' && d > 0) || (f.result === 'down' && d < 0) || (f.result === 'even' && d === 0)
    return { id: event.key, name: event.name, date: event.date, pre, post, matches, event }
  })
}

export const historyView: View = (ctx, [id]) => {
  const { root, params, signal } = ctx
  const filters = readFilters(params)
  let selectedID: string | null = null
  let disposeChart: (() => void) | undefined
  signal.addEventListener('abort', () => disposeChart?.())

  root.innerHTML = `<a class="back-link" href="#/player/${id}">‹ Player</a><h1 class="screen-title">Rating History</h1>${skeleton([40, 40, 80, 260, 72, 72])}`

  const load = (force = false) =>
    fetchPlayer(id, { force }).then(
      (player) => {
        if (signal.aborted) return
        document.title = `Rating History · ${player.name} · OpenBoard`
        render(player)
      },
      (error: Error) => {
        if (!signal.aborted) root.innerHTML = `<h1 class="screen-title">Rating History</h1>${errorCard(error.message)}`
      },
    )

  const render = (player: Player) => {
    disposeChart?.()
    disposeChart = undefined
    const entries = entriesFor(player, filters)
    const visible = entries.filter((e) => e.matches)
    const backHref = id === prefs.primary ? '#/' : `#/player/${id}`

    root.innerHTML = `
      <a class="back-link" href="${backHref}">‹ ${esc(player.name)}</a>
      <h1 class="screen-title">Rating History</h1>
      <div class="segmented" role="radiogroup" aria-label="Rating">
        ${(['regular', 'quick'] as const)
          .map((s) => `<button type="button" role="radio" aria-checked="${filters.system === s}" data-system="${s}">${s === 'regular' ? 'Regular' : 'Quick'}</button>`)
          .join('')}
      </div>
      <div class="chips">
        ${chip('count', '#', counts, filters.count)}
        ${chip('period', '◷', periods, filters.period)}
        ${chip('result', filters.result === 'up' ? '↗' : filters.result === 'down' ? '↘' : filters.result === 'even' ? '=' : '≡', directions, filters.result)}
      </div>
      ${
        entries.length
          ? `${summary(entries)}
             <div class="glass chart-card">
               <div class="chart-host"></div>
               <div class="legend">
                 <span><i class="lg up">▲</i>Gained</span><span><i class="lg down">▼</i>Lost</span><span><i class="lg even">●</i>No change</span>
                 <span class="spacer"></span><span class="hint">Tap a point</span>
               </div>
             </div>
             <div class="selected-slot"></div>
             ${sectionLabel(`Events · ${visible.length}`)}
             ${
               visible.length
                 ? `<div class="stack">${[...visible].reverse().map((e) => eventRow(e.event, { system: filters.system, highlight: id })).join('')}</div>`
                 : `<p class="muted">No events match “${directions[filters.result]}” in this range.</p>`
             }`
          : emptyState('📈', `No ${filters.system} events`, 'Try a longer period or another rating type.')
      }`

    const host = root.querySelector<HTMLElement>('.chart-host')
    if (host) {
      const slot = root.querySelector<HTMLElement>('.selected-slot')!
      const showSelected = (picked: string | null) => {
        selectedID = picked
        const entry = entries.find((e) => e.id === picked)
        slot.innerHTML = entry ? `${sectionLabel('Selected event')}${eventRow(entry.event, { system: filters.system, highlight: id, selected: true })}` : ''
      }
      disposeChart = renderHistoryChart(host, entries, { selectedID, onSelect: showSelected })
      showSelected(selectedID)
    }
  }

  root.onclick = (e) => {
    const target = e.target as HTMLElement
    const systemButton = target.closest<HTMLElement>('[data-system]')
    if (systemButton) {
      filters.system = systemButton.dataset.system as RatingSystem
      selectedID = null
      writeFilters(filters)
      fetchPlayer(id).then((p) => !signal.aborted && render(p))
    } else if (target.closest('[data-action="retry"]')) {
      load(true)
    }
  }
  root.onchange = (e) => {
    const select = e.target as HTMLSelectElement
    const key = select.dataset.filter as 'count' | 'period' | 'result' | undefined
    if (!key) return
    ;(filters as Record<string, string>)[key] = select.value
    writeFilters(filters)
    fetchPlayer(id).then((p) => !signal.aborted && render(p))
  }

  load()
}

/** A filter chip: shows the filter's name while unfiltered, else the choice. */
function chip(key: keyof typeof chipTitles, icon: string, options: Record<string, string>, value: string): string {
  const active = value !== 'all'
  return `<label class="chip${active ? ' active' : ''}">
    <span aria-hidden="true">${icon}</span><span class="chip-text">${active ? options[value] : chipTitles[key]}</span>
    <select data-filter="${key}" aria-label="${chipTitles[key]}">
      ${Object.entries(options).map(([k, label]) => `<option value="${k}"${k === value ? ' selected' : ''}>${label}</option>`).join('')}
    </select>
  </label>`
}

function summary(entries: Entry[]): string {
  const first = entries[0]
  const last = entries[entries.length - 1]
  const ups = entries.filter((e) => e.post > e.pre).length
  const downs = entries.filter((e) => e.post < e.pre).length
  const evens = entries.length - ups - downs
  const peak = Math.max(...entries.map((e) => e.post))
  return `<div class="card summary">
    <div>
      <div class="summary-range mono">${first.pre} → ${last.post}</div>
      <div class="muted small mono">${entries.length === 1 ? '1 event' : `${entries.length} events`} · peak ${peak}</div>
    </div>
    <div class="summary-right">
      ${deltaBadge(last.post - first.pre, true)}
      <div class="tally mono"><span class="text-up">▲ ${ups}</span><span class="text-down">▼ ${downs}</span><span class="muted">= ${evens}</span></div>
    </div>
  </div>`
}
