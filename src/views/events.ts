// Events: US Chess tournaments near you (distance, date and type filters),
// the nationwide list of major events, and tournaments saved for later.
// Port of UpcomingTournamentsSection (EventsView.swift) and the Watching
// tab's saved tournaments.

import { LocationError, currentLocation } from '../location'
import type { View } from '../router'
import { replaceQuery } from '../router'
import {
  type MajorEvent, type Radius, type TournamentKind, type TournamentListing, type UpcomingWindow, fetchMajorEvents,
  fetchUpcoming, kinds, majorEventID, matchesKind, occursIn, radii, windowRange, windows,
} from '../tournaments'
import { type SavedTournament, chevron, dateRange, emptyState, errorCard, esc, prefs, sectionLabel, skeleton } from '../ui'

type Scope = 'near' | 'majors'

/** Search results by "origin|radius": coming back from a tournament keeps the list (and scroll). */
const listingCache = new Map<string, Promise<TournamentListing[]>>()
let majorsCache: Promise<MajorEvent[]> | undefined

export const eventsView: View = ({ root, params, signal }) => {
  const state = {
    scope: (params.get('scope') === 'majors' ? 'majors' : 'near') as Scope,
    when: (params.get('when') ?? 'any') in windows ? (params.get('when') ?? 'any') as UpcomingWindow : 'any',
    kind: (params.get('type') ?? 'any') in kinds ? (params.get('type') ?? 'any') as TournamentKind : 'any',
    editingLocation: !prefs.location,
    locating: false,
    locationError: '',
  }

  const writeURL = () => {
    const next = new URLSearchParams()
    if (state.scope === 'majors') next.set('scope', 'majors')
    if (state.when !== 'any') next.set('when', state.when)
    if (state.kind !== 'any') next.set('type', state.kind)
    replaceQuery(next)
  }

  const render = () => {
    root.innerHTML = `
      <h1 class="screen-title">Events</h1>
      <div class="segmented" role="radiogroup" aria-label="Scope">
        <button type="button" role="radio" aria-checked="${state.scope === 'near'}" data-scope="near">Near me</button>
        <button type="button" role="radio" aria-checked="${state.scope === 'majors'}" data-scope="majors">Major events</button>
      </div>
      <div class="scope-body"></div>`
    if (state.scope === 'near') renderNear()
    else renderMajors()
  }

  const body = () => root.querySelector<HTMLElement>('.scope-body')!

  // MARK: Near me

  const renderNear = () => {
    const location = prefs.location
    const radius = prefs.radius as Radius
    body().innerHTML = `
      ${savedSection()}
      ${state.editingLocation ? locationForm(location?.origin) : locationRow(location?.origin)}
      <div class="chips">
        ${chip('radius', '◎', true, `${radius} mi`, radii.map((r) => [String(r), `Within ${r} mi`]), String(radius))}
        ${chip('when', '◷', state.when !== 'any', state.when === 'any' ? 'When' : windows[state.when], Object.entries(windows), state.when)}
        ${chip('type', '♞', state.kind !== 'any', state.kind === 'any' ? 'Type' : kinds[state.kind], Object.entries(kinds), state.kind)}
      </div>
      <div class="results"></div>`
    if (location) loadListings(location.origin, radius)
  }

  const loadListings = (origin: string, radius: Radius, force = false) => {
    const results = body().querySelector<HTMLElement>('.results')!
    const key = `${origin}|${radius}`
    if (force) listingCache.delete(key)
    let request = listingCache.get(key)
    if (!request) {
      request = fetchUpcoming(origin, radius)
      request.catch(() => listingCache.delete(key))
      listingCache.set(key, request)
    }
    results.innerHTML = skeleton([84, 84, 84])
    request.then(
      (all) => {
        if (!signal.aborted && results.isConnected) results.innerHTML = listingsHTML(all, radius)
      },
      (error: Error) => {
        if (!signal.aborted && results.isConnected) results.innerHTML = errorCard(error.message)
      },
    )
  }

  const listingsHTML = (all: TournamentListing[], radius: Radius) => {
    const range = windowRange(state.when)
    const filtered = all.filter((l) => occursIn(l, range) && matchesKind(state.kind, l))
    const dated = filtered.filter((l) => !l.isRecurring)
    const recurring = filtered.filter((l) => l.isRecurring)
    if (!filtered.length) return emptyState('⌕', 'No tournaments found', 'Try a larger distance or a different date or type.')
    return `
      ${sectionLabel(`${dated.length} ${dated.length === 1 ? 'tournament' : 'tournaments'} within ${radius} mi`)}
      <div class="stack">${dated.map(listingRow).join('')}</div>
      ${recurring.length ? `${sectionLabel('Weekly & recurring')}<div class="stack">${recurring.map(listingRow).join('')}</div>` : ''}
      <p class="footnote center">Listings from US Chess Tournament Life Announcements.</p>`
  }

  // MARK: Major events

  const renderMajors = (force = false) => {
    if (force) majorsCache = undefined
    majorsCache ??= fetchMajorEvents()
    majorsCache.catch(() => (majorsCache = undefined))
    body().innerHTML = skeleton([72, 72, 72, 72])
    majorsCache.then(
      (events) => {
        if (signal.aborted || state.scope !== 'majors') return
        const today = new Date(new Date().toDateString())
        const upcoming = events.filter((e) => !e.startDate || e.startDate >= today)
        body().innerHTML = `
          <p class="muted small">National championships and events with $5,000+ guaranteed prizes, from the US Chess Plan Ahead Calendar.</p>
          ${upcoming.length ? `<div class="stack">${upcoming.map(majorRow).join('')}</div>` : emptyState('🏆', 'No major events listed', 'US Chess has not posted upcoming major events yet.')}`
      },
      (error: Error) => {
        if (!signal.aborted && state.scope === 'majors') body().innerHTML = errorCard(error.message)
      },
    )
  }

  // MARK: Events

  root.onclick = async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-scope], [data-action]')
    if (!target) return
    if (target.dataset.scope) {
      state.scope = target.dataset.scope as Scope
      writeURL()
      render()
      return
    }
    switch (target.dataset.action) {
      case 'edit-location':
        state.editingLocation = true
        state.locationError = ''
        renderNear()
        body().querySelector<HTMLInputElement>('input[name=origin]')?.focus()
        break
      case 'cancel-location':
        state.editingLocation = false
        renderNear()
        break
      case 'use-location':
        state.locating = true
        state.locationError = ''
        renderNear()
        try {
          prefs.location = await currentLocation()
          state.editingLocation = false
        } catch (error) {
          state.locationError = error instanceof LocationError ? error.message : "Couldn't find your location."
        }
        state.locating = false
        if (!signal.aborted) renderNear()
        break
      case 'retry': {
        const location = prefs.location
        if (state.scope === 'majors') renderMajors(true)
        else if (location) loadListings(location.origin, prefs.radius as Radius, true)
        break
      }
    }
  }

  root.onsubmit = (e) => {
    e.preventDefault()
    const input = (e.target as HTMLFormElement).querySelector<HTMLInputElement>('input[name=origin]')!
    const origin = input.value.trim()
    if (!origin) return
    prefs.location = { origin }
    state.editingLocation = false
    renderNear()
  }

  root.onchange = (e) => {
    const select = e.target as HTMLSelectElement
    switch (select.dataset.filter) {
      case 'radius':
        prefs.radius = Number(select.value)
        break
      case 'when':
        state.when = select.value as UpcomingWindow
        break
      case 'type':
        state.kind = select.value as TournamentKind
        break
      default:
        return
    }
    writeURL()
    renderNear()
  }

  render()

  function locationRow(origin?: string) {
    return `<button class="card location-row" type="button" data-action="edit-location">
      <span class="pin" aria-hidden="true">📍</span>
      <span class="location-text"><strong>${origin ? `Near ${esc(origin)}` : 'Choose a location'}</strong></span>
      <span class="link-button">Change</span>
    </button>`
  }

  function locationForm(origin?: string) {
    return `<form class="card location-form">
      <label for="origin-input"><strong>Search near</strong></label>
      <div class="location-inputs">
        <input id="origin-input" name="origin" type="text" placeholder="City (Princeton, NJ) or ZIP" value="${esc(origin ?? '')}"
          autocomplete="postal-code" enterkeyhint="search" required>
        <button class="button prominent small" type="submit">Search</button>
      </div>
      <div class="location-actions">
        <button class="link-button" type="button" data-action="use-location" ${state.locating ? 'disabled' : ''}>
          ${state.locating ? 'Finding your location…' : '📍 Use my location'}
        </button>
        ${origin ? '<button class="link-button muted-link" type="button" data-action="cancel-location">Cancel</button>' : ''}
      </div>
      ${state.locationError ? `<p class="text-down small" role="alert">${esc(state.locationError)}</p>` : ''}
      <p class="muted small">“Use my location” asks your browser for your location and looks up the city with OpenStreetMap.</p>
    </form>`
  }
}

function savedSection(): string {
  const saved = prefs.savedTournaments.filter((t) => !t.endDate || t.endDate >= new Date().toISOString().slice(0, 10))
  if (!saved.length) return ''
  return `${sectionLabel('Saved')}<div class="card list">${saved.map(savedRow).join('')}</div>`
}

function savedRow(t: SavedTournament): string {
  const start = t.startDate ? new Date(`${t.startDate}T00:00`) : null
  const end = t.endDate ? new Date(`${t.endDate}T00:00`) : null
  const when = start ? (end && end > start ? dateRange(start, end) : start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })) : ''
  return `<a class="list-row" href="#/tournament${esc(t.id)}">
    <span class="bookmark" aria-hidden="true">🔖</span>
    <span class="player-text"><strong>${esc(t.name)}</strong><small>${esc([when, t.location].filter(Boolean).join(' · '))}</small></span>
    ${chevron}
  </a>`
}

function chip(key: string, icon: string, active: boolean, title: string, options: [string, string][], value: string): string {
  return `<label class="chip${active ? ' active' : ''}">
    <span aria-hidden="true">${icon}</span><span class="chip-text">${esc(title)}</span>
    <select data-filter="${key}" aria-label="${key === 'radius' ? 'Distance' : key === 'when' ? 'When' : 'Type'}">
      ${options.map(([k, label]) => `<option value="${esc(k)}"${k === value ? ' selected' : ''}>${esc(label)}</option>`).join('')}
    </select>
  </label>`
}

/** Calendar-page style "SEP / 20 / SUN" block; a repeat symbol when there's no single date. */
export function dateBlock(date: Date | null): string {
  if (!date) return `<span class="date-block" aria-hidden="true"><span class="repeat">↻</span></span>`
  const weekend = date.getDay() === 0 || date.getDay() === 6
  return `<span class="date-block" aria-hidden="true">
    <span class="db-month">${date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
    <span class="db-day">${date.getDate()}</span>
    <span class="db-weekday${weekend ? ' weekend' : ''}">${date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span>
  </span>`
}

function listingRow(l: TournamentListing): string {
  const parts = [l.location]
  if (l.isRecurring) parts.unshift('Recurring')
  else if (l.startDate && l.endDate && l.endDate > l.startDate) parts.unshift(dateRange(l.startDate, l.endDate))
  else if (l.startDate) parts.unshift(l.startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }))
  if (l.organizer) parts.push(l.organizer)
  return `<a class="card tournament-row" href="#/tournament${esc(l.id)}">
    ${dateBlock(l.isRecurring ? null : l.startDate)}
    <span class="tournament-main">
      <strong>${esc(l.name)}</strong>
      <small>${esc(parts.filter(Boolean).join(' · '))}</small>
      ${l.banner ? `<span class="tag">${esc(l.banner)}</span>` : ''}
    </span>
    ${chevron}
  </a>`
}

function majorRow(e: MajorEvent): string {
  const q = new URLSearchParams({ year: String(e.year), dates: e.dates, name: e.name, city: e.city, state: e.state })
  if (e.isNationalChampionship) q.set('n', '1')
  return `<a class="card tournament-row" href="#/major?${esc(q.toString())}" data-id="${esc(majorEventID(e))}">
    ${dateBlock(e.startDate)}
    <span class="tournament-main">
      <strong>${esc(e.name)}</strong>
      <small>${esc(`${e.dates}, ${e.year} · ${e.city}, ${e.state}`)}</small>
      ${e.isNationalChampionship ? '<span class="tag">★ National Championship</span>' : ''}
    </span>
    ${chevron}
  </a>`
}
