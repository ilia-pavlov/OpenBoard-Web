// A club or school (a US Chess affiliate): its name, state and ID, whether its
// membership is current, the tournaments it has announced, and every rated
// event it ran, newest first.

import { fetchClub, fetchClubEvents } from '../api'
import type { Club, EventSummary } from '../models'
import type { View } from '../router'
import { replaceQuery } from '../router'
import { chevron, emptyState, errorCard, esc, prefs, skeleton, stateChip } from '../ui'
import { type TournamentListing, fetchClubUpcoming } from '../tournaments'
import { dateBlock, listingRow } from './events'

const pageSize = 50

type Tab = 'upcoming' | 'past'

export const clubView: View = ({ root, params, signal }, [clubID]) => {
  const backLink = `<a class="back-link" href="#/search?scope=clubs">‹ Search</a>`
  let club: Club | undefined
  let events: EventSummary[] = []
  let more = false
  let loadingMore = false
  /** Undefined while loading; announcements come from a different US Chess source, matched by name. */
  let upcoming: TournamentListing[] | undefined
  let upcomingFailed = false
  /** Upcoming unless the reader picked a tab; switches to Past when nothing is announced. */
  let tab: Tab = params.get('tab') === 'past' ? 'past' : 'upcoming'
  let tabChosen = params.has('tab')

  const load = () => {
    root.innerHTML = `${backLink}<h1 class="screen-title small-title">Club</h1>${skeleton([90, 72, 72, 72, 72])}`
    Promise.all([fetchClub(clubID), fetchClubEvents(clubID, 0, pageSize)]).then(
      ([loadedClub, page]) => {
        if (signal.aborted) return
        club = loadedClub
        events = page.events
        more = page.more
        document.title = `${club.name} · OpenBoard`
        render()
        fetchClubUpcoming(club.name).then(
          (found) => {
            if (signal.aborted) return
            upcoming = found
            if (!found.length && !tabChosen) tab = 'past'
            renderUpcoming()
          },
          () => {
            if (signal.aborted) return
            upcomingFailed = true
            if (!tabChosen) tab = 'past'
            renderUpcoming()
          },
        )
      },
      (error: Error) => {
        if (!signal.aborted) root.innerHTML = `${backLink}<h1 class="screen-title small-title">Club</h1>${errorCard(error.message)}`
      },
    )
  }

  const render = () => {
    if (!club) return
    root.innerHTML = `
      ${backLink}
      <header class="event-header">
        <h1 class="event-title">${esc(club.name)}</h1>
        <p class="muted small club-meta">${stateChip(club.state)}<span class="mono">ID ${esc(club.id)}</span></p>
        <div class="tags"><span class="tag${club.isCurrent ? '' : ' lapsed'}">${esc(membership(club))}</span></div>
        <div class="header-actions">
          ${actionButtons(club.id)}
        </div>
      </header>
      <div class="segmented club-tabs" role="radiogroup" aria-label="Events">${tabButtons()}</div>
      <div class="club-upcoming"${tab === 'upcoming' ? '' : ' hidden'}>${upcomingList()}</div>
      <div class="club-events"${tab === 'past' ? '' : ' hidden'}>${eventsList()}</div>`
  }

  const tabButtons = () => {
    const count = upcoming?.length ? ` · ${upcoming.length}` : ''
    return `<button type="button" role="radio" aria-checked="${tab === 'upcoming'}" data-tab="upcoming">Upcoming${count}</button>
      <button type="button" role="radio" aria-checked="${tab === 'past'}" data-tab="past">Past</button>`
  }

  const showTab = () => {
    root.querySelector<HTMLElement>('.club-tabs')!.innerHTML = tabButtons()
    root.querySelector<HTMLElement>('.club-upcoming')!.hidden = tab !== 'upcoming'
    root.querySelector<HTMLElement>('.club-events')!.hidden = tab !== 'past'
  }

  const upcomingList = () => {
    if (upcomingFailed) return `<p class="muted small section-note">Couldn't load upcoming tournaments from US Chess right now.</p>`
    if (!upcoming) return skeleton([72])
    if (!upcoming.length) return `<p class="muted small section-note">No upcoming tournaments announced on US Chess.</p>`
    return `<div class="stack">${upcoming.map((l) => listingRow(l, `club/${clubID}`)).join('')}</div>`
  }

  const renderUpcoming = () => {
    const slot = root.querySelector<HTMLElement>('.club-upcoming')
    if (!slot) return
    slot.innerHTML = upcomingList()
    showTab()
  }

  const eventsList = () => {
    if (!events.length) return emptyState('♜', 'No rated events', 'US Chess has no rated events from this club or school.')
    return `<div class="stack">${events.map((e) => eventSummaryRow(e, { showClub: false })).join('')}</div>
      ${more ? `<button class="button subtle more-button" type="button" data-action="more"${loadingMore ? ' disabled' : ''}>${loadingMore ? 'Loading…' : 'Show more'}</button>` : ''}`
  }

  const loadMore = async () => {
    if (loadingMore) return
    loadingMore = true
    const list = root.querySelector<HTMLElement>('.club-events')!
    list.innerHTML = eventsList()
    try {
      const page = await fetchClubEvents(clubID, events.length, pageSize)
      if (signal.aborted) return
      events = [...events, ...page.events]
      more = page.more
    } catch (error) {
      if (signal.aborted) return
      more = true
      list.insertAdjacentHTML('beforeend', errorCard((error as Error).message))
      loadingMore = false
      return
    }
    loadingMore = false
    list.innerHTML = eventsList()
  }

  root.onclick = (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], [data-tab]')
    if (!target) return
    if (target.dataset.tab) {
      tab = target.dataset.tab as Tab
      tabChosen = true
      replaceQuery(new URLSearchParams(tab === 'past' ? { tab } : {}))
      showTab()
    } else if ((target.dataset.action === 'save-club' || target.dataset.action === 'my-club') && club) {
      const saved = { id: club.id, name: club.name, state: club.state }
      if (target.dataset.action === 'save-club') prefs.toggleSavedClub(saved)
      else prefs.setMyClub(prefs.myClub?.id === club.id ? null : saved)
      root.querySelector('.header-actions')!.innerHTML = actionButtons(club.id)
    } else if (target.dataset.action === 'more') loadMore()
    else if (target.dataset.action === 'retry') {
      if (club) {
        target.closest('.error-card')?.remove()
        loadMore()
      } else load()
    }
  }

  load()
}

const saveLabel = (saved: boolean) => (saved ? '🔖 Saved' : '🏷 Save')

/** Save, and "My school" (the one shown first on Watching, like My Player). */
function actionButtons(id: string): string {
  const saved = prefs.isClubSaved(id)
  const mine = prefs.myClub?.id === id
  return `<button class="button icon-label" type="button" data-action="save-club" aria-pressed="${saved}">${saveLabel(saved)}</button>
    <button class="button icon-label${mine ? ' mine' : ''}" type="button" data-action="my-club" aria-pressed="${mine}">${mine ? '♛ My school' : '♛ Make my school'}</button>`
}

function membership(club: Club): string {
  const date = club.expires?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (club.isCurrent) return date ? `US Chess affiliate through ${date}` : 'US Chess affiliate'
  return club.expires ? `Affiliation lapsed in ${club.expires.getFullYear()}` : 'Affiliation lapsed'
}

/** A past rated event: links to its crosstable. */
export function eventSummaryRow(e: EventSummary, { showClub = true } = {}): string {
  const when = e.start?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const players = e.players != null ? `${e.players} ${e.players === 1 ? 'player' : 'players'}` : undefined
  const line = [when, e.place, players].filter(Boolean).join(' · ')
  return `<a class="card tournament-row" href="#/event/${esc(e.id)}">
    ${dateBlock(e.start)}
    <span class="tournament-main">
      <strong>${esc(e.name)}</strong>
      <small>${esc(line)}</small>
      ${showClub && e.club ? `<small class="event-club">🏫 ${esc(e.club.name)}</small>` : ''}
    </span>
    ${chevron}
  </a>`
}
