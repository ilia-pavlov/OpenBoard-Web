// Crosstable: full event and section names, a section picker for big events,
// rating changes on every row, and each player's rounds with an estimated
// rating change for both players. Port of CrosstableView.

import { fetchEvent } from '../api'
import { type Estimates, entryRating, estimate } from '../estimator'
import type { ChessEvent, EventSection, PrePost, RoundOutcome, Standing } from '../models'
import { delta } from '../models'
import type { View } from '../router'
import { replaceQuery } from '../router'
import { badgeSlot } from '../toplists'
import { chevron, emptyState, errorCard, esc, eventDate, prefs, signed, skeleton, stateChip } from '../ui'

export const crosstableView: View = ({ root, params, signal }, [eventID]) => {
  const highlight = params.get('highlight') ?? undefined
  const expanded = new Set<string>(highlight ? [highlight] : [])
  let event: ChessEvent | undefined
  let sectionIndex = 0

  const backLink = () =>
    history.length > 1
      ? `<button class="back-link link-button" type="button" data-action="back">‹ Back</button>`
      : `<a class="back-link" href="#/">‹ My Card</a>`

  const load = (force = false) => {
    root.innerHTML = `${backLink()}<h1 class="screen-title small-title">Tournament</h1>${skeleton([48, 60, 72, 72, 72, 72, 72])}`
    fetchEvent(eventID, { force }).then(
      (loaded) => {
        if (signal.aborted) return
        event = loaded
        document.title = `${loaded.name} · OpenBoard`
        sectionIndex = initialSection(loaded)
        render(true)
      },
      (error: Error) => {
        if (!signal.aborted) root.innerHTML = `${backLink()}<h1 class="screen-title small-title">Tournament</h1>${errorCard(error.message)}`
      },
    )
  }

  /** The section from the URL, else the one with the highlighted player, else the first. */
  const initialSection = (e: ChessEvent) => {
    const fromURL = e.sections.findIndex((s) => String(s.number) === params.get('section'))
    if (fromURL >= 0) return fromURL
    const withPlayer = e.sections.findIndex((s) => s.players.some((p) => p.id === highlight))
    return Math.max(withPlayer, 0)
  }

  const render = (scrollToHighlight = false) => {
    if (!event) return
    const section = event.sections[sectionIndex]
    const playerCount = event.sections.reduce((n, s) => n + s.players.length, 0)
    const meta = [event.date ? `Rated ${eventDate(event.date)}` : null, `${playerCount} ${playerCount === 1 ? 'player' : 'players'}`]
      .filter(Boolean)
      .join(' · ')

    root.innerHTML = `
      ${backLink()}
      <header class="event-header">
        <h1 class="event-title">${esc(event.name)}</h1>
        <p class="muted small">${meta} · <button class="copy-id inline" type="button" data-action="copy-id">Event ${esc(event.id)}</button></p>
      </header>
      ${event.sections.length > 1 ? sectionPicker(event, sectionIndex, highlight) : ''}
      ${section ? standingsList(section) : emptyState('♜', 'No sections', 'US Chess has no standings for this event yet.')}`

    if (scrollToHighlight && highlight) {
      root.querySelector(`[data-member="${CSS.escape(highlight)}"]`)?.scrollIntoView({ block: 'center' })
    }
  }

  const standingsList = (section: EventSection) => {
    if (!section.players.length) return emptyState('♜', 'No standings', 'US Chess has not published standings for this section.')
    const estimates = estimate(section)
    const byRank = new Map(section.players.map((p) => [p.rank, p]))
    return `<div class="stack standings">${section.players
      .map((p) => standingRow(p, { estimates, byRank, highlight, expanded: expanded.has(p.id) }))
      .join('')}</div>`
  }

  root.onclick = (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], [data-toggle]')
    if (!target) return
    if (target.dataset.action === 'back') return history.back()
    if (target.dataset.action === 'retry') return load(true)
    if (!event) return
    if (target.dataset.toggle) {
      const id = target.dataset.toggle
      if (expanded.has(id)) expanded.delete(id)
      else expanded.add(id)
      const section = event.sections[sectionIndex]
      const row = target.closest<HTMLElement>('.standing')!
      row.outerHTML = standingRow(section.players.find((p) => p.id === id)!, {
        estimates: estimate(section),
        byRank: new Map(section.players.map((p) => [p.rank, p])),
        highlight,
        expanded: expanded.has(id),
      })
      return
    }
    if (target.dataset.action === 'copy-id') {
      navigator.clipboard?.writeText(event.id).then(() => {
        target.dataset.copied = 'true'
        setTimeout(() => delete target.dataset.copied, 1500)
      })
    }
  }

  root.onchange = (e) => {
    const select = e.target as HTMLSelectElement
    if (select.dataset.action !== 'section' || !event) return
    sectionIndex = Number(select.value)
    const next = new URLSearchParams(params)
    next.set('section', String(event.sections[sectionIndex].number))
    replaceQuery(next)
    render()
    window.scrollTo(0, 0)
  }

  load()
}

// MARK: - Section picker

function sectionPicker(event: ChessEvent, index: number, highlight?: string): string {
  const current = event.sections[index]
  const highlightIndex = event.sections.findIndex((s) => s.players.some((p) => p.id === highlight))
  return `<label class="card section-picker">
    <span class="picker-text">
      <span class="picker-count">Section ${index + 1} of ${event.sections.length}</span>
      <span class="picker-name">${esc(current.name)}${index === highlightIndex ? ' <span class="star" aria-label="Followed player’s section">★</span>' : ''}</span>
    </span>
    <span class="muted small mono">${current.players.length} players</span>
    <span class="updown" aria-hidden="true">⇅</span>
    <select data-action="section" aria-label="Choose a section">
      ${event.sections
        .map((s, i) => `<option value="${i}"${i === index ? ' selected' : ''}>${esc(s.name)} · ${s.players.length} players${i === highlightIndex ? ' ★' : ''}</option>`)
        .join('')}
    </select>
  </label>`
}

// MARK: - Standing row

interface RowContext {
  estimates: Estimates
  byRank: Map<number, Standing>
  highlight?: string
  expanded: boolean
}

function standingRow(s: Standing, ctx: RowContext): string {
  const canExpand = s.rounds.length > 0
  const watched = s.id === prefs.primary
  const classes = ['card', 'standing', s.id === ctx.highlight ? 'highlight' : watched ? 'watched' : '', ctx.expanded ? 'expanded' : '']
  const header = `
    <span class="rank${s.rank <= 3 ? ' podium' : ''}">${s.rank}</span>
    <span class="standing-main">
      <span class="standing-name"><strong>${esc(s.name)}</strong>${stateChip(s.state)}${watched ? '<span class="heart" aria-label="On My Card">♥</span>' : ''}</span>
      <span class="standing-ratings">${prePostText('R', s.regular)}${prePostText('Q', s.quick)}</span>
      ${badgeSlot(s.id)}
    </span>
    <span class="points">${esc(s.points)}</span>
    ${canExpand ? `<svg class="toggle-chev" viewBox="0 0 14 8" aria-hidden="true"><path d="M1 1l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}`

  return `<div class="${classes.filter(Boolean).join(' ')}" data-member="${esc(s.id)}">
    ${
      canExpand
        ? `<button class="standing-header" type="button" data-toggle="${esc(s.id)}" aria-expanded="${ctx.expanded}">${header}</button>`
        : `<div class="standing-header">${header}</div>`
    }
    ${ctx.expanded ? games(s, ctx) : ''}
  </div>`
}

function prePostText(label: string, p?: PrePost): string {
  if (p?.post == null) return ''
  const d = delta(p)
  return `<span class="prepost"><b>${label}</b><span class="mono">${p.pre ?? 'new'} → ${p.post}</span>${
    d != null ? `<span class="${d >= 0 ? 'text-up' : 'text-down'}">${d >= 0 ? '▲' : '▼'}${Math.abs(d)}</span>` : ''
  }</span>`
}

function games(s: Standing, ctx: RowContext): string {
  const { estimates } = ctx
  const total = delta(estimates.system === 'regular' ? s.regular : s.quick)
  const hasEstimates = estimates.byMember.has(s.id)
  const systemTitle = estimates.system === 'regular' ? 'Regular' : 'Quick'
  return `<div class="games">
    ${s.rounds.map((r) => gameRow(s, r, ctx)).join('')}
    ${
      total != null && hasEstimates
        ? `<p class="footnote">≈ Estimated per game from the official ${systemTitle} change (${signed(total)}). US Chess only publishes the event total.</p>`
        : ''
    }
    <a class="profile-link" href="#/player/${esc(s.id)}">View full profile ${chevron}</a>
  </div>`
}

const firstName = (name: string) => name.split(' ')[0] || name
const resultWord = { W: 'beat', L: 'lost to', D: 'drew', B: 'bye', '–': 'played' } as const

function gameRow(s: Standing, r: RoundOutcome, ctx: RowContext): string {
  const opponent = r.opponentRank != null ? ctx.byRank.get(r.opponentRank) : undefined
  const mine = ctx.estimates.byMember.get(s.id)?.get(r.round)
  const theirs = opponent ? ctx.estimates.byMember.get(opponent.id)?.get(r.round) : undefined
  const rating = opponent ? entryRating(opponent, ctx.estimates.system) : undefined
  const name = r.opponentName ?? opponent?.name
  const opponentText = r.symbol === 'B' ? 'Bye' : name ? `vs ${name}` : 'vs opponent'
  const color = r.color && r.color !== 'Unknown' && r.symbol !== 'B' ? r.color.toUpperCase() : ''

  let label = `Round ${r.round}, ${resultWord[r.symbol]} ${opponentText}`
  if (mine != null) label += `, about ${signed(mine)} for ${firstName(s.name)}`
  if (theirs != null && opponent) label += `, about ${signed(theirs)} for ${firstName(opponent.name)}`

  return `<div class="game">
    <span class="sr-only">${esc(label)}</span>
    <span class="result-chip ${r.symbol === '–' ? 'none' : r.symbol}" aria-hidden="true">${r.symbol}</span>
    <span class="game-main">
      <span class="game-round" aria-hidden="true">Round ${r.round}${color ? `<i>${color}</i>` : ''}</span>
      <span class="game-opponent">${
        opponent && r.symbol !== 'B'
          ? `<a href="#/player/${esc(opponent.id)}">${esc(opponentText)}</a>`
          : `<span aria-hidden="true">${esc(opponentText)}</span>`
      }${rating != null ? ` <span class="muted mono" aria-hidden="true">(${rating})</span>` : ''}</span>
    </span>
    ${
      mine != null || theirs != null
        ? `<span class="game-estimates" aria-hidden="true">
            ${mine != null ? `<span class="estimate mine ${tint(mine)}">≈ ${signed(mine)}</span>` : ''}
            ${theirs != null && opponent ? `<span class="estimate theirs"><span class="muted">${esc(firstName(opponent.name))}</span> <span class="${tint(theirs)}">≈ ${signed(theirs)}</span></span>` : ''}
          </span>`
        : ''
    }
  </div>`
}

const tint = (n: number) => (n > 0 ? 'text-up' : n < 0 ? 'text-down' : 'text-even')
