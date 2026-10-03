// Formatting helpers, small reusable components (as HTML strings) and the
// per-browser preferences the app keeps in UserDefaults/SwiftData.

import type { EventResult, PrePost, RatingSystem } from './models'
import { delta as prePostDelta, resultFor } from './models'

// MARK: - Escaping & formatting

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => entities[c])

/** Chess-clock display: zero-padded to 4 digits ("0383"). */
export const clock = (n: number) => String(n).padStart(4, '0')
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
export const num = (n: number) => n.toLocaleString('en-US')

export const eventDate = (d: Date | null) =>
  d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export function daysAgo(d: Date | null): string {
  if (!d) return 'not yet rated'
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  return days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

// MARK: - Components

export const chevron = `<svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

export function deltaBadge(d: number, prominent = false): string {
  const kind = d > 0 ? 'up' : d < 0 ? 'down' : 'even'
  const text = d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '= 0'
  const label = d > 0 ? `up ${d}` : d < 0 ? `down ${-d}` : 'no change'
  return `<span class="delta ${kind}${prominent ? ' prominent' : ''}" aria-label="${label}">${text}</span>`
}

export function clockDigits(value: number | undefined, { tint = 'gold', size = 'md' } = {}): string {
  return value == null
    ? `<span class="digits ${size} unrated" aria-label="unrated">– – – –</span>`
    : `<span class="digits ${size} ${tint}" aria-label="rating ${value}">${clock(value)}</span>`
}

export const sectionLabel = (text: string) => `<h2 class="section-label">${esc(text)}</h2>`

export function avatar(name: string): string {
  const initials = name.split(' ').slice(0, 2).map((w) => w.charAt(0)).join('')
  return `<span class="avatar" aria-hidden="true">${esc(initials)}</span>`
}

export const stateChip = (state?: string) => (state ? `<span class="state-chip">${esc(state)}</span>` : '')

/** Small area sparkline, oldest → newest. Stretches to its box. */
export function sparkline(values: number[]): string {
  if (values.length < 2) return ''
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 4 + (1 - (v - lo) / span) * 56])
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  return `<svg class="sparkline" viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="var(--gold)" stop-opacity=".3"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="0,64 ${line} 100,64" fill="url(#spark-fill)"/>
    <polyline points="${line}" fill="none" stroke="var(--gold)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`
}

function prePostText(p?: PrePost): string {
  if (p?.pre == null || p.post == null) return ''
  const d = prePostDelta(p)!
  return `<span class="event-change"><span class="mono">${p.pre} → ${p.post}</span>${deltaBadge(d)}</span>`
}

/** An event result row; links to the crosstable when the event ID is known. */
export function eventRow(
  event: EventResult,
  { system = 'regular', highlight, selected = false }: { system?: RatingSystem; highlight?: string; selected?: boolean } = {},
): string {
  const body = `
    <div class="event-main">
      <div class="event-name">${esc(event.name)}</div>
      <div class="event-date">${eventDate(event.date)}</div>
    </div>
    ${prePostText(resultFor(event, system))}`
  const className = `card event-row${selected ? ' selected' : ''}`
  if (!event.id) return `<div class="${className}">${body}</div>`
  const params = new URLSearchParams()
  if (highlight) params.set('highlight', highlight)
  if (event.section != null) params.set('section', String(event.section))
  const qs = params.toString()
  return `<a class="${className}" href="#/event/${esc(event.id)}${qs ? `?${qs}` : ''}">${body}${chevron}</a>`
}

export function skeleton(heights: number[]): string {
  return `<div class="skeleton-list" aria-busy="true" aria-label="Loading">${heights
    .map((h) => `<div class="skeleton" style="height:${h}px"></div>`)
    .join('')}</div>`
}

export function errorCard(message: string): string {
  return `<div class="card error-card" role="alert">
    <div><strong>Couldn't load from US Chess</strong><p>${esc(message)}</p></div>
    <button class="button" type="button" data-action="retry">Try again</button>
  </div>`
}

export function emptyState(icon: string, title: string, message: string): string {
  return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon}</div><h2>${esc(title)}</h2><p>${esc(message)}</p></div>`
}

// MARK: - Preferences (this browser only)

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked (private mode): the preference just won't persist.
  }
}

export const prefs = {
  /** The member shown on My Card. */
  get primary(): string | null {
    return read<string | null>('primaryMemberID', null)
  },
  set primary(id: string | null) {
    write('primaryMemberID', id)
  },
  get recents(): string[] {
    return read<string[]>('recentSearches', [])
  },
  remember(query: string) {
    write('recentSearches', [query, ...this.recents.filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, 8))
  },
  clearRecents() {
    write('recentSearches', null)
  },
  /** Members whose best-wins scan the user paused; stays paused until Resume. */
  isBestWinsPaused(memberID: string): boolean {
    return read<string[]>('bestWins.paused', []).includes(memberID)
  },
  setBestWinsPaused(memberID: string, paused: boolean) {
    const others = read<string[]>('bestWins.paused', []).filter((id) => id !== memberID)
    write('bestWins.paused', paused ? [...others, memberID] : others)
  },
}
