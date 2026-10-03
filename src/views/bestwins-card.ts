// The "Best wins" card on My Card and profiles. Port of BestWinsCard.swift.
//
// The first scan of an active player takes a while (one paced request per
// event), so wins appear as they're found, above a progress line with Pause.
// A paused scan stays paused (across visits) until Resume, which picks up
// where it stopped: checked sections are cached. Hidden when the finished
// scan finds no wins over rated opponents, or fails with none.

import { type Progress, scan } from '../bestwins'
import type { NotableWin } from '../models'
import { badgeSlot } from '../toplists'
import { chevron, esc, eventDate, num, prefs } from '../ui'

export function mountBestWins(slot: HTMLElement, memberID: string, pageSignal: AbortSignal) {
  let progress: Progress | undefined
  let stopped = false
  let openRow: string | null = null
  let scanController: AbortController | undefined
  const paused = () => prefs.isBestWinsPaused(memberID)

  // The header and ⓘ popover are drawn once, so an open popover survives progress updates.
  slot.innerHTML = `
    <div class="best-wins-head">
      <h2 class="section-label">Best wins</h2>
      <button class="info-button" type="button" popovertarget="best-wins-info" aria-label="About best wins">ⓘ</button>
    </div>
    ${infoPopover}
    <div class="card best-wins"></div>`
  const body = slot.querySelector<HTMLElement>('.best-wins')!

  const render = () => {
    const ended = stopped || progress?.isFinished === true
    slot.hidden = !paused() && ended && !progress?.wins.length
    const wins = progress?.wins ?? []
    body.innerHTML = `
      ${wins.map((w, i) => winRow(w, i === 0, openRow === w.opponentID, memberID)).join('')}
      ${progress?.isFinished ? '' : statusRow()}`
  }

  const statusRow = () => {
    const isPaused = paused()
    let text: string
    if (isPaused) {
      text = progress?.eventsTotal ? `Paused · ${progress.eventsChecked} of ${progress.eventsTotal} events checked` : 'Paused'
    } else if (!progress) {
      text = 'Loading rated games…'
    } else if (stopped) {
      text = "Couldn't finish: US Chess is busy. Showing wins found so far."
    } else {
      text = `Analyzing ${num(progress.gameCount)} games · ${progress.eventsChecked} of ${progress.eventsTotal} events`
    }
    const bar =
      !stopped && progress && progress.eventsTotal > 0
        ? `<progress class="${isPaused ? 'paused' : ''}" max="${progress.eventsTotal}" value="${progress.eventsChecked}"></progress>`
        : ''
    return `<div class="best-wins-status">
      <div class="status-line">
        ${isPaused ? '<span class="paused-icon" aria-hidden="true">⏸</span>' : stopped ? '' : '<span class="spinner" aria-hidden="true"></span>'}
        <span class="status-text mono" role="status">${text}</span>
        ${stopped ? '' : `<button class="pill-button" type="button" data-action="toggle-scan" aria-label="${isPaused ? 'Resume checking best wins' : 'Pause checking best wins'}">${isPaused ? '▶ Resume' : '❚❚ Pause'}</button>`}
      </div>
      ${bar}
    </div>`
  }

  const start = () => {
    scanController?.abort()
    const controller = new AbortController()
    scanController = controller
    pageSignal.addEventListener('abort', () => controller.abort(), { once: true })
    stopped = false
    const cachedOnly = paused()
    scan(
      memberID,
      (step) => {
        if (controller.signal.aborted) return
        // Resuming midway: cached sections replay in a moment. Keep the wins on
        // screen until it catches up, so the card never shrinks.
        if (progress && step.wins.length < progress.wins.length && !step.isFinished) {
          progress = { ...progress, gameCount: step.gameCount, eventsChecked: step.eventsChecked, eventsTotal: step.eventsTotal }
        } else {
          progress = step
        }
        render()
      },
      { signal: controller.signal, cachedOnly },
    ).catch(() => {
      if (controller.signal.aborted || paused()) return
      stopped = true
      render()
    })
  }

  slot.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], [data-win]')
    if (!target) return
    if (target.dataset.win) {
      openRow = openRow === target.dataset.win ? null : target.dataset.win
      render()
    } else if (target.dataset.action === 'toggle-scan') {
      prefs.setBestWinsPaused(memberID, !paused())
      start()
      render()
    }
  })

  render()
  start()
}

const infoPopover = `<div id="best-wins-info" class="info-popover card" popover>
  <h3>Best wins</h3>
  <p>The strongest players this player has beaten in rated games.</p>
  <ul>
    <li>📅 The rating is the opponent's rating on the day of the game, not today.</li>
    <li>↗ “+150 above” means the opponent was rated 150 points higher at the time.</li>
    <li>👆 Tap a win to open the opponent's profile or that tournament.</li>
  </ul>
  <p class="muted small">The first check can take a few minutes for players with lots of games. Pause stops it and Resume picks up where it left off; after that it's instant.</p>
  <button class="button" type="button" popovertarget="best-wins-info" popovertargetaction="hide">Got it</button>
</div>`

function winRow(win: NotableWin, featured: boolean, open: boolean, memberID: string): string {
  const gap = win.playerRating != null ? win.opponentRating - win.playerRating : undefined
  const first = win.opponentName.split(' ')[0] || win.opponentName
  let label = `Beat ${win.opponentName}, rated ${win.opponentRating}, at ${win.eventName}`
  if (gap != null && gap > 0) label += `, ${gap} points above`
  return `<div class="win${featured ? ' featured' : ''}">
    <button class="win-row" type="button" data-win="${esc(win.opponentID)}" aria-expanded="${open}" aria-label="${esc(label)}">
      ${featured ? '<span class="trophy" aria-hidden="true">🏆</span>' : ''}
      <span class="win-main">
        <span class="win-name">${esc(win.opponentName)}</span>
        ${badgeSlot(win.opponentID)}
        <span class="win-event">${esc([win.eventName, eventDate(win.date)].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="win-rating">
        <span class="win-value mono">${win.opponentRating}</span>
        ${gap != null && gap > 0 ? `<small class="text-up mono">+${gap} above</small>` : ''}
      </span>
      ${chevron}
    </button>
    ${
      open
        ? `<div class="win-actions">
            <a class="button" href="#/player/${esc(win.opponentID)}">View ${esc(first)}'s profile</a>
            <a class="button" href="#/event/${esc(win.eventID)}?highlight=${esc(memberID)}&section=${win.section}">Open tournament</a>
          </div>`
        : ''
    }
  </div>`
}
