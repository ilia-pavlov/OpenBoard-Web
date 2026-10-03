// Checks watched players for rating changes. Port of RefreshScheduler /
// WatchlistChecker. A web page can't run in the background like the app's
// twice-daily refresh, so the check runs when the site is opened (at most every
// 12 hours) and on demand from Watching. Changes raise a browser notification
// only when the user turned alerts on.

import { fetchPlayer } from './api'
import type { Player } from './models'
import { isoDay, prefs } from './ui'

const checkInterval = 12 * 60 * 60 * 1000

/** Best-available regular rating: the published value, or the latest event's post rating. */
export const currentRegular = (p: Player) => p.ratings.regular?.value ?? p.events[0]?.regular?.post
export const currentQuick = (p: Player) => p.ratings.quick?.value ?? p.events[0]?.quick?.post

/** What to store about a player when they're watched or checked. */
export function snapshot(p: Player) {
  return {
    memberID: p.id,
    name: p.name,
    state: p.state,
    lastKnownRegular: currentRegular(p),
    lastKnownQuick: currentQuick(p),
    lastRatedDate: p.events[0]?.date ? isoDay(p.events[0].date) : undefined,
  }
}

export interface RatingChange {
  memberID: string
  name: string
  old?: number
  new: number
}

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0
  } catch {
    return 0
  }
}

function writeNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Not persisted; the next visit checks again.
  }
}

export const lastChecked = () => readNumber('watchlist.lastChecked')

export const alertsEnabled = () =>
  'Notification' in window && Notification.permission === 'granted' && readNumber('watchlist.alerts') === 1

/** Asks for notification permission (only ever from a click). Returns whether alerts are on. */
export async function enableAlerts(on: boolean): Promise<boolean> {
  if (!on) {
    writeNumber('watchlist.alerts', 0)
    return false
  }
  if (!('Notification' in window)) return false
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  writeNumber('watchlist.alerts', permission === 'granted' ? 1 : 0)
  return permission === 'granted'
}

function notify(change: RatingChange) {
  if (!alertsEnabled()) return
  const delta = change.old != null ? change.new - change.old : undefined
  const deltaText = delta != null ? (delta >= 0 ? ` (+${delta})` : ` (${delta})`) : ''
  const cheer = (delta ?? 0) >= 0 ? ' 🎉' : ''
  const first = change.name.split(' ')[0] || change.name
  new Notification('Rating update', { body: `${first}'s new rating: ${change.new}${deltaText}${cheer}`, icon: '/favicon.svg', tag: `rating-${change.memberID}` })
}

/** Fired on window after every check, so an open Watching screen can redraw. */
export const watchlistChecked = 'openboard:watchlist-checked'

let running: Promise<RatingChange[]> | undefined

/**
 * Compares stored vs fetched ratings for every watched player, one at a time
 * (politely), updates the store, and notifies. Never notifies on a player's
 * first fill-in.
 */
export function checkWatchlist(): Promise<RatingChange[]> {
  running ??= (async () => {
    const changes: RatingChange[] = []
    for (const row of prefs.watched) {
      const player = await fetchPlayer(row.memberID, { force: true }).catch(() => undefined)
      if (!player) continue
      const fresh = snapshot(player)
      if (fresh.lastKnownRegular != null && fresh.lastKnownRegular !== row.lastKnownRegular) {
        const change = { memberID: row.memberID, name: fresh.name, old: row.lastKnownRegular, new: fresh.lastKnownRegular }
        if (row.lastKnownRegular != null) {
          changes.push(change)
          notify(change)
        }
      }
      prefs.updateWatched(row.memberID, {
        name: fresh.name,
        state: fresh.state,
        lastKnownRegular: fresh.lastKnownRegular ?? row.lastKnownRegular,
        lastKnownQuick: fresh.lastKnownQuick ?? row.lastKnownQuick,
        lastRatedDate: fresh.lastRatedDate ?? row.lastRatedDate,
      })
    }
    writeNumber('watchlist.lastChecked', Date.now())
    window.dispatchEvent(new CustomEvent<RatingChange[]>(watchlistChecked, { detail: changes }))
    return changes
  })().finally(() => (running = undefined))
  return running
}

/** On opening the site: check if the last check is over 12 hours old. */
export function checkIfDue() {
  if (prefs.watched.length && Date.now() - lastChecked() > checkInterval) checkWatchlist().catch(() => {})
}
