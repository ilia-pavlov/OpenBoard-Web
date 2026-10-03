// Top 100: every US Chess Top 100 list, filtered by rating type, open/girls,
// age group, and (optionally) the followed player's state; plus a single list
// opened from a badge, scrolled to the player. Port of TopListsView.swift.

import { fetchPlayer, fetchTopList, fetchTopListDefinitions } from '../api'
import { type TopList, type TopListDefinition, type TopListRating, ageGroup, sortKey, topListRatingTitle } from '../models'
import type { View, ViewContext } from '../router'
import { replaceQuery } from '../router'
import { chevron, emptyState, errorCard, esc, prefs, skeleton, stateChip } from '../ui'

type Group = 'open' | 'women'

export const top100BrowseView: View = (ctx) => {
  const { root, params, signal } = ctx
  const filters = {
    rating: (['R', 'Q', 'B'].includes(params.get('rating') ?? '') ? params.get('rating') : 'R') as TopListRating,
    group: (params.get('group') === 'women' ? 'women' : 'open') as Group,
    list: params.get('list'),
    stateOnly: params.get('state') === '1',
  }
  let all: TopListDefinition[] = []
  let homeState: string | undefined

  const options = () =>
    all.filter((d) => d.rating === filters.rating && d.isWomen === (filters.group === 'women')).sort((a, b) => sortKey(a) - sortKey(b))
  const selected = () => options().find((d) => d.id === filters.list) ?? options().find((d) => ageGroup(d) === 'Overall') ?? options()[0]

  /** Switching rating type or open/girls keeps the same age group when it exists. */
  const keepAgeGroup = (previous?: TopListDefinition) => {
    const age = previous && ageGroup(previous)
    filters.list = options().find((d) => ageGroup(d) === age)?.id ?? null
  }

  const writeURL = () => {
    const next = new URLSearchParams({ rating: filters.rating })
    if (filters.group === 'women') next.set('group', 'women')
    if (filters.list) next.set('list', filters.list)
    if (filters.stateOnly) next.set('state', '1')
    replaceQuery(next)
  }

  const render = () => {
    const current = selected()
    root.innerHTML = `
      <a class="back-link" href="#/search">‹ Search</a>
      <h1 class="screen-title">Top 100</h1>
      <div class="segmented three" role="radiogroup" aria-label="Rating">
        ${(['R', 'Q', 'B'] as const)
          .map((r) => `<button type="button" role="radio" aria-checked="${filters.rating === r}" data-rating="${r}">${topListRatingTitle[r]}</button>`)
          .join('')}
      </div>
      <div class="chips${homeState ? '' : ' two'}">
        <label class="chip${current && ageGroup(current) !== 'Overall' ? ' active' : ''}">
          <span aria-hidden="true">◔</span><span class="chip-text">${esc(current ? ageGroup(current) : 'Age')}</span>
          <select data-filter="list" aria-label="Age group">
            ${options().map((d) => `<option value="${esc(d.id)}"${d.id === current?.id ? ' selected' : ''}>${esc(ageGroup(d))}</option>`).join('')}
          </select>
        </label>
        <label class="chip${filters.group === 'women' ? ' active' : ''}">
          <span aria-hidden="true">♙</span><span class="chip-text">${filters.group === 'women' ? 'Girls' : 'Open'}</span>
          <select data-filter="group" aria-label="List">
            <option value="open"${filters.group === 'open' ? ' selected' : ''}>Open</option>
            <option value="women"${filters.group === 'women' ? ' selected' : ''}>Girls &amp; Women</option>
          </select>
        </label>
        ${
          homeState
            ? `<label class="chip${filters.stateOnly ? ' active' : ''}">
                <span aria-hidden="true">⌖</span><span class="chip-text">${filters.stateOnly ? esc(homeState) : 'All states'}</span>
                <select data-filter="state" aria-label="State">
                  <option value="all"${filters.stateOnly ? '' : ' selected'}>All states</option>
                  <option value="home"${filters.stateOnly ? ' selected' : ''}>${esc(homeState)} only</option>
                </select>
              </label>`
            : ''
        }
      </div>
      <div class="list-host"></div>`
    if (current) showList(ctx, root.querySelector<HTMLElement>('.list-host')!, current, { stateFilter: filters.stateOnly ? homeState : undefined })
  }

  root.onclick = (e) => {
    const target = e.target as HTMLElement
    const button = target.closest<HTMLElement>('[data-rating]')
    if (button) {
      const previous = selected()
      filters.rating = button.dataset.rating as TopListRating
      keepAgeGroup(previous)
      writeURL()
      render()
    } else if (target.closest('[data-action="retry"]')) {
      start()
    }
  }
  root.onchange = (e) => {
    const select = e.target as HTMLSelectElement
    const previous = selected()
    if (select.dataset.filter === 'list') filters.list = select.value
    else if (select.dataset.filter === 'group') {
      filters.group = select.value as Group
      keepAgeGroup(previous)
    } else if (select.dataset.filter === 'state') filters.stateOnly = select.value === 'home'
    else return
    writeURL()
    render()
  }

  const start = () => {
    root.innerHTML = `<h1 class="screen-title">Top 100</h1>${skeleton([36, 40, 60, 56, 56, 56, 56])}`
    const primary = prefs.primary
    Promise.all([fetchTopListDefinitions(), primary ? fetchPlayer(primary).catch(() => undefined) : undefined]).then(
      ([definitions, player]) => {
        if (signal.aborted) return
        all = definitions
        homeState = player?.state
        render()
      },
      (error: Error) => {
        if (!signal.aborted) root.innerHTML = `<h1 class="screen-title">Top 100</h1>${errorCard(error.message)}`
      },
    )
  }
  start()
}

export const top100ListView: View = (ctx, [listID]) => {
  const { root, params, signal } = ctx
  const highlight = params.get('highlight') ?? undefined
  const start = () => {
    root.innerHTML = `<a class="back-link" href="#/top100">‹ All lists</a><h1 class="screen-title">Top 100</h1>${skeleton([60, 56, 56, 56, 56])}`
    fetchTopListDefinitions().then(
      (definitions) => {
        if (signal.aborted) return
        const definition = definitions.find((d) => d.id === listID)
        const host = root.querySelector<HTMLElement>('.skeleton-list')!
        if (!definition) {
          host.outerHTML = emptyState('🏅', 'List not found', 'US Chess no longer publishes this list.')
          return
        }
        const wrapper = document.createElement('div')
        wrapper.className = 'list-host'
        host.replaceWith(wrapper)
        showList(ctx, wrapper, definition, { highlight })
      },
      (error: Error) => {
        if (!signal.aborted) root.innerHTML = `<h1 class="screen-title">Top 100</h1>${errorCard(error.message)}`
      },
    )
  }
  root.onclick = (e) => {
    if ((e.target as HTMLElement).closest('[data-action="retry"]')) start()
  }
  start()
}

/** Header + rows for one list, rendered into `host`. */
function showList(
  { signal }: ViewContext,
  host: HTMLElement,
  definition: TopListDefinition,
  { highlight, stateFilter }: { highlight?: string; stateFilter?: string },
) {
  host.innerHTML = skeleton([60, 56, 56, 56, 56, 56])
  fetchTopList(definition).then(
    (list) => {
      if (signal.aborted || !host.isConnected) return
      host.innerHTML = listHTML(list, { highlight, stateFilter })
      if (highlight) host.querySelector(`[data-member="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: 'center' })
    },
    (error: Error) => {
      if (!signal.aborted) host.innerHTML = errorCard(error.message)
    },
  )
}

function listHTML(list: TopList, { highlight, stateFilter }: { highlight?: string; stateFilter?: string }): string {
  const d = list.definition
  const entries = stateFilter ? list.entries.filter((e) => e.state === stateFilter) : list.entries
  const meta = [
    list.reportDate ? `As of ${list.reportDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : null,
    stateFilter ? `${entries.length} from ${stateFilter}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const title = `${d.isWomen && !d.name.startsWith('Girls') ? 'Women · ' : ''}${d.name} · ${topListRatingTitle[d.rating]}`
  const primary = prefs.primary
  return `
    <div class="list-title">
      <h2>${esc(title)}</h2>
      ${meta ? `<p class="muted small">${meta}</p>` : ''}
    </div>
    ${
      entries.length
        ? `<div class="stack top-list">${entries
            .map(
              (e) => `<a class="card top-row${e.id === highlight ? ' highlight' : ''}" href="#/player/${esc(e.id)}" data-member="${esc(e.id)}">
                <span class="rank${e.rank <= 3 ? ' podium' : ''}">${e.rank}</span>
                <span class="top-name"><strong>${esc(e.name)}</strong>${stateChip(e.state)}${e.id === primary ? '<span class="heart" aria-label="On My Card">♥</span>' : ''}</span>
                <span class="top-rating mono">${e.rating}</span>
                ${chevron}
              </a>`,
            )
            .join('')}</div>`
        : emptyState('♟', `No players from ${stateFilter ?? 'here'}`, 'Nobody from this state is on this list right now.')
    }`
}
