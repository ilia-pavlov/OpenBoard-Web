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

/** Whether this browser can show rating alerts, and if not, why. */
export type AlertSupport = 'available' | 'blocked' | 'install-on-ios' | 'unsupported'

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export function alertSupport(): AlertSupport {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    // iPhone and iPad only offer notifications to a site added to the Home Screen.
    return isIOS() && !isStandalone() ? 'install-on-ios' : 'unsupported'
  }
  return Notification.permission === 'denied' ? 'blocked' : 'available'
}

export const alertsEnabled = () =>
  alertSupport() === 'available' && Notification.permission === 'granted' && readNumber('watchlist.alerts') === 1

/** Registers the service worker that shows notifications (required on iPhone and iPad). */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
}

/** Asks for notification permission (only ever from a click). Returns whether alerts are on. */
export async function enableAlerts(on: boolean): Promise<boolean> {
  if (!on) {
    writeNumber('watchlist.alerts', 0)
    return false
  }
  if (alertSupport() !== 'available') return false
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  writeNumber('watchlist.alerts', permission === 'granted' ? 1 : 0)
  return permission === 'granted'
}

async function show(title: string, options: NotificationOptions) {
  try {
    // iPhone and iPad only show notifications through a service worker.
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(title, options)
  } catch {
    new Notification(title, options)
  }
}

/** Confirms alerts work right after they're turned on. */
export function sendSampleAlert() {
  return show('Rating alerts are on', {
    body: "You'll get a notification like this when a watched player's rating changes.",
    icon: '/icon-192.png',
    tag: 'rating-sample',
  })
}

async function notify(change: RatingChange) {
  if (!alertsEnabled()) return
  const delta = change.old != null ? change.new - change.old : undefined
  const deltaText = delta != null ? (delta >= 0 ? ` (+${delta})` : ` (${delta})`) : ''
  const cheer = (delta ?? 0) >= 0 ? ' 🎉' : ''
  const first = change.name.split(' ')[0] || change.name
  await show('Rating update', { body: `${first}'s new rating: ${change.new}${deltaText}${cheer}`, icon: '/icon-192.png', tag: `rating-${change.memberID}` })
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
          void notify(change)
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
