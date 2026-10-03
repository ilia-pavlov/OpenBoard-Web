// Watching: saved tournaments, My players and Rivals & friends, with each
// player's rating and when they were last rated. Port of WatchlistView.swift.

import type { View } from '../router'
import { badgeSlot } from '../toplists'
import {
  type SavedTournament, type WatchedPlayer, avatar, chevron, clockDigits, daysAgo, dateRange, emptyState, esc, eventDate,
  prefs, sectionLabel,
} from '../ui'
import { type RatingChange, alertSupport, alertsEnabled, checkWatchlist, enableAlerts, lastChecked, sendSampleAlert, watchlistChecked } from '../watchlist'

export const watchingView: View = ({ root, signal }) => {
  let editing = false
  let checking = false
  let openRow: string | null = null
  let changes: RatingChange[] = []
  let message = ''

  const render = () => {
    const watched = prefs.watched
    const primary = watched.filter((r) => r.isPrimary)
    const rivals = watched.filter((r) => !r.isPrimary)
    const saved = prefs.savedTournaments
    const checkedAt = lastChecked()

    root.innerHTML = `
      <div class="title-row">
        <h1 class="screen-title">Watching</h1>
        <div class="title-actions">
          ${rivals.length > 1 ? `<button class="link-button" type="button" data-action="edit">${editing ? 'Done' : 'Edit'}</button>` : ''}
          ${watched.length ? `<button class="icon-button${checking ? ' spinning' : ''}" type="button" data-action="check" aria-label="Check ratings now" ${checking ? 'disabled' : ''}>↻</button>` : ''}
        </div>
      </div>
      ${message ? `<div class="card banner" role="status">${message}</div>` : ''}

      ${
        saved.length
          ? `${sectionLabel('Saved tournaments')}<div class="card list">${saved.map(savedRow).join('')}</div>`
          : ''
      }
      ${
        !watched.length && !saved.length
          ? `${emptyState('♥', 'Nothing on the board yet', 'Open any player and tap ♥ Watch to track their rating, or save a tournament from Events to keep it here.')}
             <p class="center"><a class="button prominent" href="#/search">Find a player</a></p>`
          : ''
      }
      ${primary.length ? `${sectionLabel('My players')}<div class="card list">${primary.map((r) => watchRow(r, 0, 1)).join('')}</div>` : ''}
      ${rivals.length ? `${sectionLabel('Rivals & friends')}<div class="card list">${rivals.map((r, i) => watchRow(r, i, rivals.length)).join('')}</div>` : ''}

      ${
        watched.length
          ? `<div class="card alerts-card">
              <label class="toggle-row">
                <span><strong>Rating alerts</strong><small>A browser notification when a watched player's rating changes. The site checks when you open it (at most every 12 hours) and when you tap ↻.</small></span>
                <input type="checkbox" role="switch" data-action="alerts" aria-describedby="alerts-help" ${alertsEnabled() ? 'checked' : ''} ${alertSupport() === 'available' ? '' : 'disabled'}>
              </label>
              ${alertHelp()}
              ${checkedAt ? `<small class="muted">Last checked ${new Date(checkedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>` : ''}
            </div>`
          : ''
      }`
  }

  const watchRow = (r: WatchedPlayer, index: number, count: number) => {
    const tint = r.isPrimary ? 'gold' : 'teal'
    const change = changes.find((c) => c.memberID === r.memberID)
    const delta = change?.old != null ? change.new - change.old : undefined
    const open = openRow === r.memberID
    return `<div class="watch-item">
      <div class="watch-row">
        <a class="watch-link" href="#/player/${esc(r.memberID)}">
          ${avatar(r.name).replace('class="avatar"', `class="avatar ${tint}"`)}
          <span class="player-text">
            <span class="player-name"><strong>${esc(r.name)}</strong>${r.isPrimary ? '<span class="crown" aria-label="My Card">♛</span>' : ''}</span>
            <span class="player-meta"><small>${esc(r.lastRatedDate ? `rated ${daysAgo(new Date(`${r.lastRatedDate}T00:00`))}` : 'not yet rated')}</small>${badgeSlot(r.memberID)}</span>
          </span>
          ${delta ? `<span class="delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}</span>` : ''}
          ${clockDigits(r.lastKnownRegular, { tint, size: 'sm' })}
        </a>
        ${
          editing && !r.isPrimary
            ? `<span class="reorder">
                <button class="icon-button small" type="button" data-action="up" data-member="${esc(r.memberID)}" aria-label="Move ${esc(r.name)} up" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="icon-button small" type="button" data-action="down" data-member="${esc(r.memberID)}" aria-label="Move ${esc(r.name)} down" ${index === count - 1 ? 'disabled' : ''}>↓</button>
              </span>`
            : `<button class="icon-button small" type="button" data-action="menu" data-member="${esc(r.memberID)}" aria-expanded="${open}" aria-label="Options for ${esc(r.name)}">⋯</button>`
        }
      </div>
      ${
        open
          ? `<div class="win-actions">
              ${r.isPrimary ? '' : `<button class="button" type="button" data-action="primary" data-member="${esc(r.memberID)}">♛ Make primary</button>`}
              <button class="button danger" type="button" data-action="unfollow" data-member="${esc(r.memberID)}">Unfollow</button>
            </div>`
          : ''
      }
    </div>`
  }

  root.onclick = async (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!target || target.dataset.action === 'alerts') return
    const id = target.dataset.member ?? ''
    switch (target.dataset.action) {
      case 'edit':
        editing = !editing
        openRow = null
        break
      case 'menu':
        openRow = openRow === id ? null : id
        break
      case 'primary':
        prefs.setPrimary(id)
        openRow = null
        break
      case 'unfollow': {
        const row = prefs.watched.find((r) => r.memberID === id)
        if (row) prefs.toggleWatch(row)
        openRow = null
        break
      }
      case 'remove-saved':
        e.preventDefault()
        prefs.removeSaved(id)
        break
      case 'up':
      case 'down': {
        const rows = prefs.watched
        const rivals = rows.filter((r) => !r.isPrimary)
        const i = rivals.findIndex((r) => r.memberID === id)
        const j = target.dataset.action === 'up' ? i - 1 : i + 1
        if (i < 0 || j < 0 || j >= rivals.length) return
        ;[rivals[i], rivals[j]] = [rivals[j], rivals[i]]
        // My players stay first; rivals follow in the new order.
        prefs.watched = [...rows.filter((r) => r.isPrimary), ...rivals]
        break
      }
      case 'check':
        checking = true
        message = ''
        render()
        try {
          changes = await checkWatchlist()
          message = changes.length
            ? `🔔 ${changes.length === 1 ? '1 rating changed' : `${changes.length} ratings changed`} since the last check.`
            : 'No rating changes since the last check.'
        } catch {
          message = "Couldn't reach US Chess. Try again in a minute."
        }
        checking = false
        if (signal.aborted) return
        break
      default:
        return
    }
    render()
  }

  root.onchange = async (e) => {
    const input = e.target as HTMLInputElement
    if (input.dataset.action !== 'alerts') return
    const on = await enableAlerts(input.checked)
    if (input.checked && !on) message = 'Notifications are blocked for this site. Allow them in your browser settings to get alerts.'
    // On iPhone the result of the permission prompt is easy to miss: say it, and show a sample.
    if (on) {
      message = '🔔 Rating alerts are on. You should see a sample notification now.'
      void sendSampleAlert()
    }
    render()
  }

  // The check that runs on opening the site may finish while this screen is open.
  window.addEventListener(
    watchlistChecked,
    (e) => {
      if (checking) return // the ↻ handler redraws with its own message
      changes = (e as CustomEvent<RatingChange[]>).detail
      render()
    },
    { signal },
  )

  render()
}

/** Why the switch can't turn on, when it can't. */
function alertHelp(): string {
  switch (alertSupport()) {
    case 'install-on-ios':
      return `<p id="alerts-help" class="alert-help">On iPhone and iPad, alerts work once OpenBoard is on your Home Screen: tap <strong>Share</strong> <svg class="share-icon" viewBox="0 0 16 20" aria-hidden="true"><path d="M8 1v11M4 5l4-4 4 4M3 9H2v10h12V9h-1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>, then <strong>Add to Home Screen</strong>, and open OpenBoard from there.</p>`
    case 'blocked':
      return `<p id="alerts-help" class="alert-help">Notifications are blocked for this site. Allow them in your browser's site settings, then come back.</p>`
    case 'unsupported':
      return `<p id="alerts-help" class="alert-help">This browser can't show notifications.</p>`
    default:
      return ''
  }
}

function savedRow(t: SavedTournament): string {
  const start = t.startDate ? new Date(`${t.startDate}T00:00`) : null
  const end = t.endDate ? new Date(`${t.endDate}T00:00`) : null
  // Most events are one day; don't print a range from a day to itself.
  const when = start ? (end && end.getTime() !== start.getTime() ? dateRange(start, end) : eventDate(start)) : ''
  return `<div class="watch-item"><div class="watch-row">
    <a class="watch-link" href="#/tournament${esc(t.id)}">
      <span class="bookmark" aria-hidden="true">🔖</span>
      <span class="player-text"><strong>${esc(t.name)}</strong><small>${esc([when, t.location].filter(Boolean).join(' · '))}</small></span>
      ${chevron}
    </a>
    <button class="icon-button small" type="button" data-action="remove-saved" data-member="${esc(t.id)}" aria-label="Remove ${esc(t.name)} from saved">✕</button>
  </div></div>`
}
