// My Card and the player profile: the same card, plus onboarding when no
// player is followed yet. Port of MyCardView / PlayerProfileView.

import { fetchPlayer } from '../api'
import {
  type Player, type ProvisionalStatus, type Rating, type RankSlot, classTitle, delta, establishedAfter, firstName, hasHistory,
  peakRegular, provisionalStatus,
  topPercent,
} from '../models'
import {
  chevron, clockDigits, daysAgo, deltaBadge, emptyState, errorCard, esc, eventRow, num, prefs, sectionLabel,
  signed, skeleton, sparkline,
} from '../ui'
import type { View } from '../router'
import { mountBestWins } from './bestwins-card'
import { snapshot } from '../watchlist'
import { playerShareURL, share, shareButton } from '../share'
import { badgeSlot } from '../toplists'

export const myCardView: View = (ctx) => {
  const id = prefs.primary
  if (!id) {
    ctx.root.innerHTML = `<h1 class="screen-title">My Card</h1>
      <div class="onboarding">
        <div class="crown" aria-hidden="true">♛</div>
        <h2>Welcome to OpenBoard</h2>
        <p>Watch a US Chess player to build your card: search by name or 8-digit member ID, open their profile, and tap ♥ Watch.</p>
        <a class="button prominent" href="#/search">Find a player</a>
      </div>`
    return
  }
  loadPlayer(ctx, id, 'mycard')
}

export const profileView: View = (ctx, [id]) => loadPlayer(ctx, id, 'profile')

function loadPlayer(ctx: Parameters<View>[0], id: string, mode: 'mycard' | 'profile', force = false) {
  const { root, signal } = ctx
  let latest: Player | undefined
  root.innerHTML = `<h1 class="screen-title">${mode === 'mycard' ? 'My Card' : 'Player'}</h1>${skeleton([28, 300, 130, 90, 72, 72, 72])}`

  fetchPlayer(id, { force }).then(
    (player) => {
      if (signal.aborted) return
      document.title = `${player.name} · OpenBoard`
      // Keep the watched row's name and rating current (it may have been added before they loaded).
      if (prefs.isWatching(player.id)) {
        const row = prefs.watched.find((r) => r.memberID === player.id)!
        const fresh = snapshot(player)
        prefs.updateWatched(player.id, { name: fresh.name, state: fresh.state, lastKnownRegular: row.lastKnownRegular ?? fresh.lastKnownRegular, lastRatedDate: row.lastRatedDate ?? fresh.lastRatedDate })
      }
      latest = player
      root.innerHTML = playerPage(player, mode)
      mountBestWins(root.querySelector<HTMLElement>('.best-wins-slot')!, player.id, signal)
    },
    (error: Error) => {
      if (signal.aborted) return
      root.innerHTML = `<h1 class="screen-title">${mode === 'mycard' ? 'My Card' : 'Player'}</h1>${errorCard(error.message)}`
    },
  )

  root.onclick = (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
    switch (target?.dataset.action) {
      case 'retry':
        loadPlayer(ctx, id, mode, true)
        break
      case 'copy-id':
        navigator.clipboard?.writeText(id).then(() => {
          target.dataset.copied = 'true'
          setTimeout(() => delete target.dataset.copied, 1500)
        })
        break
      case 'watch':
        if (!latest) break
        prefs.toggleWatch(snapshot(latest))
        target.outerHTML = watchButton(id)
        break
      case 'share': {
        if (!latest) break
        const regular = latest.ratings.regular?.value
        void share(target, {
          title: `${latest.name} · OpenBoard`,
          text: `${latest.name} on OpenBoard${regular != null ? `: Regular ${regular}` : ''}`,
          url: playerShareURL(id),
        })
        break
      }
    }
  }
}

/** ♥ Watch / ♥ Watching; the first player watched becomes My Card. */
function watchButton(id: string): string {
  const watching = prefs.isWatching(id)
  const label = watching ? (prefs.primary === id ? '♛ My Card · Watching' : '♥ Watching') : '♡ Watch'
  return `<button class="button${watching ? ' subtle' : ''}" type="button" data-action="watch" aria-pressed="${watching}">${label}</button>`
}

function playerPage(player: Player, mode: 'mycard' | 'profile'): string {
  const lastEvent = player.events[0]
  const regular = player.ratings.regular
  const lastDelta = delta(lastEvent?.regular)
  const title = mode === 'mycard' ? firstName(player) : player.name

  return `
    <div class="title-row">
      <h1 class="screen-title">${esc(title)}</h1>
      <div class="title-actions">
        ${mode === 'profile' ? watchButton(player.id) : `<a class="link-button" href="#/watching">Watching</a>`}
        ${shareButton('Share', 'button icon-label')}
      </div>
    </div>
    <div class="id-row">
      <button class="copy-id" type="button" data-action="copy-id" aria-label="Copy member ID ${player.id}">ID ${player.id}</button>
      ${classChip(regular?.value, player.ranking?.stateName ?? player.state)}
    </div>
    ${badgeSlot(player.id, 'all')}

    ${historyLink(player, 'regular', heroCard(regular, lastDelta, player.ratingHistory, peakRegular(player), hasHistory(player, 'regular'), provisionalStatus(player, 'regular')), 'hero')}
    <div class="mini-row">
      ${historyLink(player, 'quick', miniCard('Quick', player.ratings.quick, hasHistory(player, 'quick'), provisionalStatus(player, 'quick')), 'mini')}
      ${miniCard('Blitz', player.ratings.blitz, false, provisionalStatus(player, 'blitz'))}
    </div>

    ${lastEvent && lastDelta ? justRated(player) : ''}
    ${rankingCards(player.ranking)}
    <section class="best-wins-slot" aria-label="Best wins"></section>

    ${
      player.events.length
        ? `${sectionLabel('Recent events')}<div class="stack">${player.events.slice(0, 6).map((e) => eventRow(e, { highlight: player.id })).join('')}</div>`
        : emptyState('♟', 'No rated events yet', 'Events appear here after US Chess rates them.')
    }`
}

function historyLink(player: Player, system: 'regular' | 'quick', card: string, kind: string): string {
  return hasHistory(player, system)
    ? `<a class="card-link ${kind}" href="#/player/${player.id}/history?system=${system}" aria-label="${system === 'regular' ? 'Regular' : 'Quick'} rating history">${card}</a>`
    : `<div class="${kind}">${card}</div>`
}

function classChip(rating?: number, stateName?: string): string {
  const parts = [rating != null ? classTitle(rating) : null, stateName].filter(Boolean)
  return parts.length ? `<span class="class-chip"><i></i>${esc(parts.join(' · '))}</span>` : ''
}

/**
 * How close a provisional rating is to established: a progress bar with the
 * live count (tournaments rated since the official list included), and the
 * official list's count when it differs.
 */
function provisionalMeter(status?: ProvisionalStatus): string {
  if (!status) return ''
  if (!status.provisional) {
    return status.officialProvisional
      ? `<div class="provisional established"><span>✓ Established: 26 games reached. Official from the next monthly list.</span></div>`
      : ''
  }
  const games = status.liveGames ?? 0
  const left = status.liveRemaining ?? establishedAfter - games
  const official =
    status.officialRemaining != null && status.officialRemaining !== left
      ? `<span class="muted">Official list: ${status.officialGames} games, ${status.officialRemaining} to go</span>`
      : ''
  return `<div class="provisional" role="group" aria-label="Provisional rating: ${games} of ${establishedAfter} games, ${left} to go">
    <div class="provisional-text"><strong>Provisional · ${left} ${left === 1 ? 'game' : 'games'} to go</strong><span class="mono muted">${games} / ${establishedAfter}</span></div>
    <div class="provisional-bar" aria-hidden="true"><i style="width:${Math.min(100, (games / establishedAfter) * 100).toFixed(1)}%"></i></div>
    ${official}
  </div>`
}

function heroCard(
  rating: Rating | undefined,
  d: number | undefined,
  spark: number[],
  peak: number | undefined,
  disclosure: boolean,
  status: ProvisionalStatus | undefined,
): string {
  let footer = 'UNRATED — PLAY A RATED EVENT TO GET ON THE BOARD'
  if (rating?.value != null) {
    const parts: string[] = []
    if (rating.floor != null) parts.push(`FLOOR ${rating.floor}`)
    if (!status?.provisional && rating.games != null) parts.push(`${rating.games} GAMES`)
    if (peak != null) parts.push(`PEAK ${peak}`)
    footer = parts.join(' · ')
  }
  return `<div class="glass hero-card">
    <div class="card-head">${sectionLabel('Regular')}<span class="spacer"></span>${d ? deltaBadge(d, true) : ''}${disclosure ? chevron : ''}</div>
    ${clockDigits(rating?.value, { size: 'hero' })}
    ${spark.length > 1 ? `<div class="spark-box">${sparkline(spark)}</div>` : ''}
    ${provisionalMeter(status)}
    <div class="card-foot mono">${footer}</div>
  </div>`
}

function miniCard(label: string, rating: Rating | undefined, disclosure: boolean, status: ProvisionalStatus | undefined): string {
  let foot = 'UNRATED'
  const provisional = rating?.value != null && status?.provisional && status.liveRemaining != null
  if (rating?.value != null) {
    const parts: string[] = []
    if (!provisional && rating.games != null) parts.push(`${rating.games} GAMES`)
    if (rating.floor != null) parts.push(`FLOOR ${rating.floor}`)
    foot = parts.join(' · ') || '&nbsp;'
  }
  return `<div class="glass mini-card">
    <div class="card-head">${sectionLabel(label)}<span class="spacer"></span>${disclosure ? chevron : ''}</div>
    ${clockDigits(rating?.value, { tint: 'teal', size: 'lg' })}
    ${provisional ? `<div class="mini-provisional" title="${status!.liveRemaining} more games until the rating is established">Provisional · ${status!.liveRemaining} left</div>` : ''}
    <div class="card-foot small mono">${foot}</div>
  </div>`
}

function justRated(player: Player): string {
  const event = player.events[0]
  const { pre, post } = event.regular!
  const up = post! >= pre!
  return `<div class="card banner">
    <span class="bell" aria-hidden="true">🔔</span>
    <div>
      <div class="banner-title">${esc(event.name)} was rated ${daysAgo(event.date)}</div>
      <div class="mono ${up ? 'text-up' : 'text-down'}">${pre} → ${post} (${signed(post! - pre!)})</div>
    </div>
  </div>`
}

function statCard(title: string, slot: RankSlot, icon: string, tint: string): string {
  const caption = slot.total ? `of ${num(slot.total)} · top ${topPercent(slot)}%` : '&nbsp;'
  return `<div class="card stat-card">
    <div class="stat-title ${tint}"><span aria-hidden="true">${icon}</span>${esc(title)}</div>
    <div class="stat-value">№ ${num(slot.rank)}</div>
    <div class="stat-caption">${caption}</div>
  </div>`
}

function rankingCards(ranking: Player['ranking']): string {
  if (!ranking?.overall && !ranking?.state) return ''
  return `<div class="mini-row">
    ${ranking.overall ? statCard('National', ranking.overall, '⚑', 'gold') : ''}
    ${ranking.state ? statCard(ranking.stateName ?? 'State', ranking.state, '⌖', 'teal') : ''}
  </div>`
}
