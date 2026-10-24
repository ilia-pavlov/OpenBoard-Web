// Search: players (name or 8-digit member ID), clubs and schools (name or an
// ID like H6043396, optionally in one state; with just a state, the ones
// running rated events there) and events (by name), debounced, with recent
// searches kept in this browser. Port of SearchView.

import { fetchStateEvents, searchClubs, searchEvents, searchPlayers } from '../api'
import { Links } from '../endpoints'
import { type ActiveClub, type Club, type EventSummary, type PlayerSummary, activeClubs, isClubID } from '../models'
import type { View } from '../router'
import { replaceQuery } from '../router'
import { badgeSlot } from '../toplists'
import { states, stateCodeIn } from '../states'
import { type TournamentListing, searchUpcoming } from '../tournaments'
import { eventSummaryRow } from './club'
import { chip, listingRow } from './events'
import { avatar, chevron, clockDigits, emptyState, errorCard, esc, prefs, sectionLabel, skeleton, stateChip } from '../ui'

type Scope = 'players' | 'clubs' | 'events'

const scopes: Record<Scope, { title: string; placeholder: string; label: string }> = {
  players: { title: 'Players', placeholder: 'Name, member ID, or event ID', label: 'Search players' },
  clubs: { title: 'Schools & Clubs', placeholder: 'School or club name, or ID', label: 'Search schools and clubs' },
  events: { title: 'Events', placeholder: 'Tournament or club name, or event ID', label: 'Search upcoming and past events' },
}

export const searchView: View = ({ root, params, signal }) => {
  const requested = params.get('scope') ?? ''
  let scope: Scope = Object.hasOwn(scopes, requested) ? (requested as Scope) : 'players'
  root.innerHTML = `
    <h1 class="screen-title">Search</h1>
    <div class="search-field">
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" name="q" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
    </div>
    <div class="segmented three search-scopes" role="radiogroup" aria-label="Search for">
      ${(Object.keys(scopes) as Scope[])
        .map((s) => `<button type="button" role="radio" aria-checked="${s === scope}" data-scope="${s}">${esc(scopes[s].title)}</button>`)
        .join('')}
    </div>
    <div class="club-filters"></div>
    <div class="search-results" aria-live="polite"></div>`

  const input = root.querySelector<HTMLInputElement>('input')!
  const applyScope = () => {
    input.placeholder = scopes[scope].placeholder
    input.setAttribute('aria-label', scopes[scope].label)
    for (const b of root.querySelectorAll<HTMLElement>('[data-scope]')) b.setAttribute('aria-checked', String(b.dataset.scope === scope))
    renderFilters()
  }

  /** State filter: the reader's choice, else the state of their Events location. */
  const clubState = () => prefs.clubState ?? stateCodeIn(prefs.location?.origin ?? '') ?? ''

  const renderFilters = () => {
    const slot = root.querySelector<HTMLElement>('.club-filters')!
    if (scope !== 'clubs') {
      slot.innerHTML = ''
      return
    }
    const state = clubState()
    const name = states.find(([code]) => code === state)?.[1]
    slot.innerHTML = `<div class="chips state-filter">
      ${chip('state', stateIcon, !!state, name ?? 'All states', [['', 'All states'], ...states], state)}
    </div>`
  }
  applyScope()
  const results = root.querySelector<HTMLElement>('.search-results')!
  let timer: number | undefined
  let generation = 0

  const recentsBlock = () => {
    const recents = prefs.recents
    return recents.length
      ? `<div class="list-header"><h2 class="section-label">Recent</h2><button class="link-button" type="button" data-action="clear">Clear</button></div>
         <div class="card list">${recents
           .map((q) => `<button class="list-row recent" type="button" data-query="${esc(q)}"><span aria-hidden="true">↺</span>${esc(q)}</button>`)
           .join('')}</div>`
      : ''
  }

  /** Schools & Clubs with nothing typed: the ones running rated events in the chosen state. */
  const showClubsHome = () => {
    const state = clubState()
    const name = states.find(([code]) => code === state)?.[1]
    const current = generation
    if (!state) {
      results.innerHTML = `${emptyState('🏫', homeTitle.clubs, 'Pick a state to see the schools and clubs running rated events there, or type a name or ID.')}${recentsBlock()}`
      return
    }
    results.innerHTML = `${sectionLabel(`Active in ${name}`)}<div class="state-clubs">${skeleton([64, 64, 64, 64])}</div>${recentsBlock()}`
    fetchStateEvents(state).then(
      (events) => {
        if (signal.aborted || current !== generation) return
        results.querySelector('.state-clubs')!.innerHTML = stateClubsHTML(activeClubs(events), events, name ?? state)
      },
      (error: Error) => {
        if (signal.aborted || current !== generation) return
        results.querySelector('.state-clubs')!.innerHTML = errorCard((error as Error).message)
      },
    )
  }

  const showHome = () => {
    if (scope === 'clubs') return showClubsHome()
    const recents = prefs.recents
    results.innerHTML = `
      <a class="card browse-row" href="#/top100">
        <span class="browse-icon" aria-hidden="true">🏅</span>
        <span><strong>Top 100 lists</strong><small>Best US Chess players by age: 7 &amp; under through 18, girls, seniors</small></span>
        ${chevron}
      </a>
      <a class="card browse-row" href="#/about">
        <span class="browse-icon" aria-hidden="true">♛</span>
        <span><strong>About OpenBoard</strong><small>Why it exists, what it can do, and how to support it</small></span>
        ${chevron}
      </a>
      <a class="card browse-row join-row" href="${Links.join}" target="_blank" rel="noopener">
        <span class="browse-icon" aria-hidden="true">♙</span>
        <span><strong>Join or renew US Chess</strong><small>Membership is required to play rated events and get an official rating</small></span>
        <span class="external" aria-hidden="true">↗</span>
      </a>
      ${
        recents.length
          ? `<div class="list-header"><h2 class="section-label">Recent</h2><button class="link-button" type="button" data-action="clear">Clear</button></div>
             <div class="card list">${recents
               .map((q) => `<button class="list-row recent" type="button" data-query="${esc(q)}"><span aria-hidden="true">↺</span>${esc(q)}</button>`)
               .join('')}</div>`
          : emptyState('⌕', homeTitle[scope], homeHint[scope])
      }`
  }

  const run = (query: string, debounce: boolean) => {
    clearTimeout(timer)
    const trimmed = query.trim()
    const next = new URLSearchParams(trimmed ? { q: trimmed } : {})
    if (scope !== 'players') next.set('scope', scope)
    replaceQuery(next)
    const current = ++generation
    if (!trimmed) return showHome()
    if (/^\d{12}$/.test(trimmed)) {
      // A 12-digit US Chess event ID (year, month, day, then a sequence number).
      prefs.remember(trimmed)
      results.innerHTML = `<div class="card list"><a class="list-row" href="#/event/${trimmed}">
        <span class="browse-icon" aria-hidden="true">♜</span>
        <span class="player-text"><strong>Open crosstable</strong><small class="mono">Event ${trimmed}</small></span>
        ${chevron}
      </a></div>`
      return
    }
    if (scope !== 'clubs' && isClubID(trimmed)) {
      // A club or school ID typed in another scope: offer it directly.
      const id = trimmed.toUpperCase()
      prefs.remember(id)
      results.innerHTML = `<div class="card list"><a class="list-row" href="#/club/${id}">
        <span class="browse-icon" aria-hidden="true">🏫</span>
        <span class="player-text"><strong>Open school or club</strong><small class="mono">ID ${id}</small></span>
        ${chevron}
      </a></div>`
      return
    }

    results.innerHTML = skeleton([64, 64, 64, 64])
    const searching = scope
    timer = window.setTimeout(async () => {
      try {
        const html =
          searching === 'clubs' ? clubResults(await searchClubs(trimmed, clubState() || undefined), trimmed, clubState())
          : searching === 'events' ? await bothEventResults(trimmed)
          : playerResults(await searchPlayers(trimmed), trimmed)
        if (signal.aborted || current !== generation) return
        results.innerHTML = html
      } catch (error) {
        if (signal.aborted || current !== generation) return
        results.innerHTML = errorCard((error as Error).message)
      }
    }, debounce ? 300 : 0)
  }

  input.addEventListener('input', () => run(input.value, true))
  // Keep a search in Recent once it's used (a result opened, or Search pressed), not every pause while typing.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      prefs.remember(input.value.trim())
      input.blur()
    }
  })
  results.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a[href^="#/"]') && input.value.trim()) prefs.remember(input.value.trim())
  })
  root.onclick = (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], [data-query], [data-scope]')
    if (!target) return
    if (target.dataset.scope) {
      if (target.dataset.scope === scope) return
      scope = target.dataset.scope as Scope
      applyScope()
      run(input.value, false)
    } else if (target.dataset.query != null) {
      input.value = target.dataset.query
      run(input.value, false)
    } else if (target.dataset.action === 'all-upcoming') {
      target.closest('.upcoming-results')?.classList.add('expanded')
      target.remove()
    } else if (target.dataset.action === 'clear') {
      prefs.clearRecents()
      showHome()
    } else if (target.dataset.action === 'retry') {
      run(input.value, false)
    }
  }

  root.onchange = (e) => {
    const select = e.target as HTMLSelectElement
    if (select.dataset.filter !== 'state') return
    prefs.clubState = select.value
    renderFilters()
    run(input.value, false)
  }

  input.value = params.get('q') ?? ''
  run(input.value, false)
  if (!input.value && matchMedia('(hover: hover)').matches) input.focus()
}

const homeTitle: Record<Scope, string> = {
  players: 'Find anyone rated by US Chess',
  clubs: 'Find a school or club',
  events: 'Find a tournament',
}

const homeHint: Record<Scope, string> = {
  players: 'Type a name ("pavlov"), an 8-digit member ID, or a 12-digit event ID.',
  clubs: 'Type a name ("oak hall") or a US Chess affiliate ID like H6043396 to see every rated event it ran.',
  events: 'Type part of a tournament or club name ("marshall") to see upcoming tournaments and past results, or a 12-digit event ID.',
}

function playerResults(found: PlayerSummary[], query: string): string {
  return found.length
    ? `<div class="card list">${found.map(resultRow).join('')}</div>`
    : emptyState('⌕', `No results for “${query}”`, 'Check the spelling, try just the last name, or use the 8-digit member ID.')
}

function clubResults(found: Club[], query: string, state: string): string {
  return found.length
    ? `<div class="card list">${found.map(clubRow).join('')}</div>`
    : emptyState(
        '🏫',
        `No schools or clubs match “${query}”${state ? ` in ${state}` : ''}`,
        state ? 'Try fewer words, or set the state filter to All states.' : 'Try fewer words ("oak hall" rather than "Oak Hall School Chess Club"), or the ID.',
      )
}

/** Map pin for the state filter. */
const stateIcon = `<svg class="chip-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>`

/** Upcoming tournaments shown before "Show all". */
const upcomingPreview = 5

/** Upcoming announcements and past rated events for one query; one source failing still shows the other. */
async function bothEventResults(query: string): Promise<string> {
  const [upcoming, past] = await Promise.allSettled([searchUpcoming(query, 1), searchEvents(query)])
  if (upcoming.status === 'rejected' && past.status === 'rejected') throw past.reason
  const upcomingList = upcoming.status === 'fulfilled' ? upcoming.value : []
  const pastList = past.status === 'fulfilled' ? past.value : []
  if (!upcomingList.length && !pastList.length && upcoming.status === 'fulfilled' && past.status === 'fulfilled') {
    return emptyState('♜', `No events match “${query}”`, 'Try one distinctive word from the tournament or club name.')
  }
  const unavailable = (what: string) => `<p class="muted small section-note">Couldn't load ${what} from US Chess right now.</p>`
  return `
    ${sectionLabel('Upcoming')}
    ${upcoming.status === 'rejected' ? unavailable('upcoming tournaments') : upcomingResults(upcomingList)}
    ${sectionLabel('Past results')}
    ${past.status === 'rejected' ? unavailable('past results') : pastResults(pastList)}`
}

function upcomingResults(list: TournamentListing[]): string {
  if (!list.length) return `<p class="muted small section-note">No upcoming tournaments announced.</p>`
  const hidden = list.length - upcomingPreview
  return `<div class="stack upcoming-results">
    ${list.slice(0, upcomingPreview).map((l) => listingRow(l, 'search')).join('')}
    ${hidden > 0 ? `<div class="stack upcoming-more">${list.slice(upcomingPreview).map((l) => listingRow(l, 'search')).join('')}</div>
      <button class="button subtle more-button" type="button" data-action="all-upcoming">Show all ${list.length} upcoming</button>` : ''}
  </div>`
}

function pastResults(list: EventSummary[]): string {
  if (!list.length) return `<p class="muted small section-note">No rated events found.</p>`
  return `<div class="stack">${list.map((e) => eventSummaryRow(e)).join('')}</div>`
}

function stateClubsHTML(clubs: ActiveClub[], events: EventSummary[], stateName: string): string {
  if (!clubs.length) return `<p class="muted small section-note">No rated events in ${esc(stateName)} recently.</p>`
  const since = events.at(-1)?.start?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `<div class="card list">${clubs.map(activeClubRow).join('')}</div>
    <p class="muted small section-note">Schools and clubs that ran rated events in ${esc(stateName)}${since ? ` since ${since}` : ''}, busiest first. Type a name to find any other.</p>`
}

function activeClubRow(c: ActiveClub): string {
  const last = c.last?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const line = [`${c.events} rated ${c.events === 1 ? 'event' : 'events'}`, last && `last ${last}`].filter(Boolean).join(' · ')
  return `<a class="list-row player-row club-row" href="#/club/${esc(c.id)}">
    <span class="browse-icon" aria-hidden="true">🏫</span>
    <span class="player-text">
      <span class="player-name"><strong>${esc(c.name)}</strong></span>
      <small><span class="mono">ID ${esc(c.id)}</span> · ${esc(line)}</small>
    </span>
    ${chevron}
  </a>`
}

function clubRow(c: Club): string {
  const status = c.isCurrent ? 'Current affiliate' : c.expires ? `Lapsed ${c.expires.getFullYear()}` : 'Lapsed'
  return `<a class="list-row player-row club-row${c.isCurrent ? '' : ' lapsed-row'}" href="#/club/${esc(c.id)}">
    <span class="browse-icon" aria-hidden="true">🏫</span>
    <span class="player-text">
      <span class="player-name"><strong>${esc(c.name)}</strong></span>
      <small class="club-line">${stateChip(c.state)}<span class="mono">ID ${esc(c.id)}</span> · ${status}</small>
    </span>
    ${chevron}
  </a>`
}

function resultRow(p: PlayerSummary): string {
  return `<a class="list-row player-row" href="#/player/${p.id}">
    ${avatar(p.name)}
    <span class="player-text">
      <span class="player-name"><strong>${esc(p.name)}</strong>${stateChip(p.state)}</span>
      <span class="player-meta"><small class="mono">ID ${p.id}</small>${badgeSlot(p.id)}</span>
    </span>
    ${clockDigits(p.regular, { size: 'sm' })}
    ${chevron}
  </a>`
}
