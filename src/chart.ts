// Rating history chart: a gold line of post-event ratings where each event is
// a marker colored AND shaped by direction (▲ gained, ▼ lost, ● no change), so
// red/green is never the only cue. Hover or arrow keys show a crosshair and
// tooltip; click/Enter selects an event. Port of RatingHistoryView's chart.

import { esc, eventDate, signed } from './ui'

export interface ChartEntry {
  id: string
  name: string
  date: Date | null
  pre: number
  post: number
  /** False when the result filter hides this direction: drawn faded. */
  matches: boolean
}

interface Options {
  selectedID: string | null
  onSelect: (id: string | null) => void
}

const height = 240
const pad = { top: 22, right: 14, bottom: 28, left: 46 }

const directionOf = (e: ChartEntry) => (e.post > e.pre ? 'up' : e.post < e.pre ? 'down' : 'even')

/** Y range with a little headroom; never flat. */
function yDomain(entries: ChartEntry[]): [number, number] {
  const values = entries.flatMap((e) => [e.pre, e.post])
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  if (lo === hi) return [lo - 50, hi + 50]
  const p = Math.max(10, Math.floor((hi - lo) / 6))
  return [lo - p, hi + p]
}

/** Round tick values (~4) inside the domain. */
function ticks([lo, hi]: [number, number]): number[] {
  const raw = (hi - lo) / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Math.round(v))
  return out
}

/** Up to four evenly spaced labelled ticks, always including the oldest and newest event. */
function axisIndices(n: number): number[] {
  if (n <= 4) return [...Array(n).keys()]
  return [0, 1, 2, 3].map((i) => Math.round((i * (n - 1)) / 3))
}

/** Monotone cubic path through the points (no overshoot between events). */
function monotonePath(xs: number[], ys: number[]): string {
  const n = xs.length
  if (n === 1) return `M${xs[0]},${ys[0]}`
  const dx = xs.slice(1).map((x, i) => x - xs[i])
  const m = dx.map((d, i) => (ys[i + 1] - ys[i]) / d)
  const t = xs.map((_, i) => {
    if (i === 0) return m[0]
    if (i === n - 1) return m[n - 2]
    if (m[i - 1] * m[i] <= 0) return 0
    return (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i])
  })
  let d = `M${xs[0]},${ys[0]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${xs[i] + h},${ys[i] + t[i] * h},${xs[i + 1] - h},${ys[i + 1] - t[i + 1] * h},${xs[i + 1]},${ys[i + 1]}`
  }
  return d
}

function marker(kind: string, x: number, y: number, r: number): string {
  if (kind === 'up') return `<path d="M${x},${y - r * 1.15}L${x + r},${y + r * 0.7}L${x - r},${y + r * 0.7}Z"/>`
  if (kind === 'down') return `<path d="M${x},${y + r * 1.15}L${x + r},${y - r * 0.7}L${x - r},${y - r * 0.7}Z"/>`
  return `<circle cx="${x}" cy="${y}" r="${r * 0.85}"/>`
}

const shortDate = (d: Date | null) =>
  d ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', " '") : ''

export function renderHistoryChart(container: HTMLElement, entries: ChartEntry[], options: Options): () => void {
  let hoverIndex: number | null = null
  let selectedIndex = entries.findIndex((e) => e.id === options.selectedID)

  container.classList.add('chart')
  container.tabIndex = 0
  container.setAttribute('role', 'img')
  container.setAttribute('aria-label', `Rating after each of ${entries.length} events. Use arrow keys to step through events.`)

  const draw = () => {
    const width = container.clientWidth
    if (!width) return
    const n = entries.length
    const plotW = width - pad.left - pad.right
    const plotH = height - pad.top - pad.bottom
    const [lo, hi] = yDomain(entries)
    const x = (i: number) => pad.left + ((i + 0.5) / n) * plotW
    const y = (v: number) => pad.top + (1 - (v - lo) / (hi - lo)) * plotH
    const xs = entries.map((_, i) => x(i))
    const ys = entries.map((e) => y(e.post))
    const line = monotonePath(xs, ys)
    const baseline = pad.top + plotH
    const r = n > 150 ? 3 : n > 60 ? 4 : 5
    const focus = hoverIndex ?? (selectedIndex >= 0 ? selectedIndex : null)

    const yGrid = ticks([lo, hi])
      .map((v) => `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}"/>
        <text class="axis" x="${pad.left - 8}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${v}</text>`)
      .join('')
    const xLabels = axisIndices(n)
      .map((i) => {
        const anchor = n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'
        const lx = anchor === 'start' ? Math.max(x(i) - 6, pad.left) : anchor === 'end' ? Math.min(x(i) + 6, width - pad.right) : x(i)
        return `<text class="axis" x="${lx}" y="${height - 8}" text-anchor="${anchor}">${shortDate(entries[i].date)}</text>`
      })
      .join('')

    const markers = entries
      .map((e, i) => {
        const kind = directionOf(e)
        const big = i === selectedIndex || i === hoverIndex
        return `<g class="marker ${kind}${e.matches ? '' : ' faded'}">${marker(kind, xs[i], ys[i], big ? r + 2.5 : r)}</g>`
      })
      .join('')

    const rule =
      focus != null
        ? `<line class="rule" x1="${xs[focus]}" x2="${xs[focus]}" y1="${pad.top}" y2="${baseline}"/>`
        : ''
    const selectedLabel =
      selectedIndex >= 0
        ? `<text class="point-label ${directionOf(entries[selectedIndex])}" x="${xs[selectedIndex]}" y="${ys[selectedIndex] - r - 9}" text-anchor="middle">${signed(entries[selectedIndex].post - entries[selectedIndex].pre)}</text>`
        : ''

    container.innerHTML = `<svg width="${width}" height="${height}" aria-hidden="true">
      <defs><linearGradient id="history-fill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="var(--gold)" stop-opacity=".28"/><stop offset="1" stop-color="var(--gold)" stop-opacity=".02"/>
      </linearGradient></defs>
      ${yGrid}${xLabels}
      <path d="${line}L${xs[n - 1]},${baseline}L${xs[0]},${baseline}Z" fill="url(#history-fill)"/>
      <path class="line" d="${line}"/>
      ${rule}${markers}${selectedLabel}
    </svg>${focus != null ? tooltip(entries[focus], xs[focus], ys[focus], width) : ''}`
  }

  const indexAt = (clientX: number) => {
    const rect = container.getBoundingClientRect()
    const plotW = rect.width - pad.left - pad.right
    const i = Math.floor(((clientX - rect.left - pad.left) / plotW) * entries.length)
    return Math.min(Math.max(i, 0), entries.length - 1)
  }

  const select = (i: number | null) => {
    selectedIndex = i == null || i === selectedIndex ? -1 : i
    options.onSelect(selectedIndex >= 0 ? entries[selectedIndex].id : null)
    draw()
  }

  container.onpointermove = (e) => {
    if (e.pointerType !== 'mouse') return
    const i = indexAt(e.clientX)
    if (i !== hoverIndex) {
      hoverIndex = i
      draw()
    }
  }
  container.onpointerleave = () => {
    hoverIndex = null
    draw()
  }
  container.onclick = (e) => select(indexAt(e.clientX))
  container.onkeydown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const from = selectedIndex >= 0 ? selectedIndex : e.key === 'ArrowLeft' ? entries.length : -1
    const next = Math.min(Math.max(from + (e.key === 'ArrowLeft' ? -1 : 1), 0), entries.length - 1)
    selectedIndex = -1
    select(next)
  }

  const observer = new ResizeObserver(draw)
  observer.observe(container)
  draw()
  return () => observer.disconnect()
}

function tooltip(e: ChartEntry, px: number, py: number, width: number): string {
  const d = e.post - e.pre
  const kind = directionOf(e)
  const left = Math.min(Math.max(px, 90), width - 90)
  const above = py > 110
  return `<div class="chart-tip ${above ? 'above' : 'below'}" style="left:${left}px;top:${py}px">
    <div class="tip-name">${esc(e.name)}</div>
    <div class="tip-date">${eventDate(e.date)}</div>
    <div class="tip-value mono">${e.pre} → ${e.post} <span class="text-${kind}">${kind === 'up' ? '▲' : kind === 'down' ? '▼' : '='} ${signed(d)}</span></div>
  </div>`
}
