// Player search: debounced name search or an 8-digit member ID, with recent
// searches kept in this browser. Port of SearchView (players scope).

import { searchPlayers } from '../api'
import { Links } from '../endpoints'
import type { PlayerSummary } from '../models'
import type { View } from '../router'
import { replaceQuery } from '../router'
import { avatar, chevron, clockDigits, emptyState, errorCard, esc, prefs, skeleton, stateChip } from '../ui'

export const searchView: View = ({ root, params, signal }) => {
  root.innerHTML = `
    <h1 class="screen-title">Search</h1>
    <div class="search-field">
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 13l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" name="q" placeholder="Name or 8-digit member ID" aria-label="Search players"
        autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
    </div>
    <div class="search-results" aria-live="polite"></div>`

  const input = root.querySelector<HTMLInputElement>('input')!
  const results = root.querySelector<HTMLElement>('.search-results')!
  let timer: number | undefined
  let generation = 0

  const showHome = () => {
    const recents = prefs.recents
    results.innerHTML = `
      <a class="card browse-row" href="${Links.join}" target="_blank" rel="noopener">
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
          : emptyState('⌕', 'Find anyone rated by US Chess', 'Type a name ("pavlov") or an 8-digit member ID.')
      }`
  }

  const run = (query: string, debounce: boolean) => {
    clearTimeout(timer)
    const trimmed = query.trim()
    replaceQuery(new URLSearchParams(trimmed ? { q: trimmed } : {}))
    const current = ++generation
    if (!trimmed) return showHome()

    results.innerHTML = skeleton([64, 64, 64, 64])
    timer = window.setTimeout(async () => {
      try {
        const found = await searchPlayers(trimmed)
        if (signal.aborted || current !== generation) return
        prefs.remember(trimmed)
        results.innerHTML = found.length
          ? `<div class="card list">${found.map(resultRow).join('')}</div>`
          : emptyState('⌕', `No results for “${trimmed}”`, 'Check the spelling, try just the last name, or use the 8-digit member ID.')
      } catch (error) {
        if (signal.aborted || current !== generation) return
        results.innerHTML = errorCard((error as Error).message)
      }
    }, debounce ? 300 : 0)
  }

  input.addEventListener('input', () => run(input.value, true))
  root.onclick = (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], [data-query]')
    if (!target) return
    if (target.dataset.query != null) {
      input.value = target.dataset.query
      run(input.value, false)
    } else if (target.dataset.action === 'clear') {
      prefs.clearRecents()
      showHome()
    } else if (target.dataset.action === 'retry') {
      run(input.value, false)
    }
  }

  input.value = params.get('q') ?? ''
  run(input.value, false)
  if (!input.value && matchMedia('(hover: hover)').matches) input.focus()
}

function resultRow(p: PlayerSummary): string {
  return `<a class="list-row player-row" href="#/player/${p.id}">
    ${avatar(p.name)}
    <span class="player-text">
      <span class="player-name"><strong>${esc(p.name)}</strong>${stateChip(p.state)}</span>
      <small class="mono">ID ${p.id}</small>
    </span>
    ${clockDigits(p.regular, { size: 'sm' })}
    ${chevron}
  </a>`
}
