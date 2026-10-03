// My Card and the player profile: the same card, plus onboarding when no
// player is followed yet. Port of MyCardView / PlayerProfileView.

import { fetchPlayer } from '../api'
import {
  type Player, type Rating, type RankSlot, classTitle, delta, firstName, hasHistory, isProvisional, peakRegular,
  topPercent,
} from '../models'
import {
  chevron, clockDigits, daysAgo, deltaBadge, emptyState, errorCard, esc, eventRow, num, prefs, sectionLabel,
  signed, skeleton, sparkline,
} from '../ui'
import type { View } from '../router'
import { mountBestWins } from './bestwins-card'

export const myCardView: View = (ctx) => {
  const id = prefs.primary
  if (!id) {
    ctx.root.innerHTML = `<h1 class="screen-title">My Card</h1>
      <div class="onboarding">
        <div class="crown" aria-hidden="true">♛</div>
        <h2>Welcome to OpenBoard</h2>
        <p>Follow a US Chess player to build your card. Search by name or enter an 8-digit member ID.</p>
        <a class="button prominent" href="#/search">Find a player</a>
      </div>`
    return
  }
  loadPlayer(ctx, id, 'mycard')
}

export const profileView: View = (ctx, [id]) => loadPlayer(ctx, id, 'profile')

function loadPlayer(ctx: Parameters<View>[0], id: string, mode: 'mycard' | 'profile', force = false) {
  const { root, signal } = ctx
  root.innerHTML = `<h1 class="screen-title">${mode === 'mycard' ? 'My Card' : 'Player'}</h1>${skeleton([28, 300, 130, 90, 72, 72, 72])}`

  fetchPlayer(id, { force }).then(
    (player) => {
      if (signal.aborted) return
      document.title = `${player.name} · OpenBoard`
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
      case 'follow':
        prefs.primary = id
        target.outerHTML = followButton(id)
        break
      case 'unfollow':
        prefs.primary = null
        location.hash = '#/search'
        break
    }
  }
}

function followButton(id: string): string {
  return prefs.primary === id
    ? `<a class="button subtle" href="#/">✓ On My Card</a>`
    : `<button class="button" type="button" data-action="follow">Show on My Card</button>`
}

function playerPage(player: Player, mode: 'mycard' | 'profile'): string {
  const lastEvent = player.events[0]
  const regular = player.ratings.regular
  const lastDelta = delta(lastEvent?.regular)
  const title = mode === 'mycard' ? firstName(player) : player.name

  return `
    <div class="title-row">
      <h1 class="screen-title">${esc(title)}</h1>
      ${mode === 'profile' ? followButton(player.id) : `<button class="link-button" type="button" data-action="unfollow">Change player</button>`}
    </div>
    <div class="id-row">
      <button class="copy-id" type="button" data-action="copy-id" aria-label="Copy member ID ${player.id}">ID ${player.id}</button>
      ${classChip(regular?.value, player.ranking?.stateName ?? player.state)}
    </div>

    ${historyLink(player, 'regular', heroCard(regular, lastDelta, player.ratingHistory, peakRegular(player), hasHistory(player, 'regular')), 'hero')}
    <div class="mini-row">
      ${historyLink(player, 'quick', miniCard('Quick', player.ratings.quick, hasHistory(player, 'quick')), 'mini')}
      ${miniCard('Blitz', player.ratings.blitz, false)}
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

function heroCard(rating: Rating | undefined, d: number | undefined, spark: number[], peak: number | undefined, disclosure: boolean): string {
  let footer = 'UNRATED — PLAY A RATED EVENT TO GET ON THE BOARD'
  if (rating?.value != null) {
    const parts: string[] = []
    if (rating.floor != null) parts.push(`FLOOR ${rating.floor}`)
    if (rating.games != null) parts.push(`${rating.games} GAMES`)
    if (isProvisional(rating)) parts.push('PROVISIONAL (<26 GAMES)')
    if (peak != null) parts.push(`PEAK ${peak}`)
    footer = parts.join(' · ')
  }
  return `<div class="glass hero-card">
    <div class="card-head">${sectionLabel('Regular')}<span class="spacer"></span>${d ? deltaBadge(d, true) : ''}${disclosure ? chevron : ''}</div>
    ${clockDigits(rating?.value, { size: 'hero' })}
    ${spark.length > 1 ? `<div class="spark-box">${sparkline(spark)}</div>` : ''}
    <div class="card-foot mono">${footer}</div>
  </div>`
}

function miniCard(label: string, rating: Rating | undefined, disclosure: boolean): string {
  let foot = 'UNRATED'
  if (rating?.value != null) {
    const parts: string[] = []
    if (rating.games != null) parts.push(`${rating.games} GAMES`)
    if (rating.floor != null) parts.push(`FLOOR ${rating.floor}`)
    foot = parts.join(' · ') || '&nbsp;'
  }
  return `<div class="glass mini-card">
    <div class="card-head">${sectionLabel(label)}<span class="spacer"></span>${disclosure ? chevron : ''}</div>
    ${clockDigits(rating?.value, { tint: 'teal', size: 'lg' })}
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
    <div class="stat-caption mono">${caption}</div>
  </div>`
}

function rankingCards(ranking: Player['ranking']): string {
  if (!ranking?.overall && !ranking?.state) return ''
  return `<div class="mini-row">
    ${ranking.overall ? statCard('National', ranking.overall, '⚑', 'gold') : ''}
    ${ranking.state ? statCard(ranking.stateName ?? 'State', ranking.state, '⌖', 'teal') : ''}
  </div>`
}
