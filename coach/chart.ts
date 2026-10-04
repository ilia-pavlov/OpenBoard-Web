// The group chart: every player's rating over time, one line each, with a dot
// for every tournament. The first eight players get the validated categorical
// palette in fixed order (so a player keeps their color); anyone after that is
// a quiet gray line until pointed at or picked in the legend. Hovering shows
// the nearest tournament; the legend shows and hides players.

import { esc, eventDate, signed } from '../src/ui'
import type { ChartSeries } from './metrics'

const height = 360
const pad = { top: 18, right: 18, bottom: 30, left: 52 }
/** Categorical slots 1–8 (validated for lines in both themes), as CSS variables. */
const slots = 8

interface State {
  hidden: Set<string>
  focus: string | null
}

const state: State = { hidden: new Set(), focus: null }

const colorVar = (index: number) => (index < slots ? `var(--series-${index + 1})` : 'var(--series-other)')

function ticks(lo: number, hi: number, count = 5): number[] {
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Math.round(v))
  return out
}

function timeTicks(from: number, to: number, width: number): { at: number; label: string }[] {
  const count = Math.max(2, Math.min(8, Math.floor(width / 110)))
  const span = to - from
  const showYear = span > 300 * 86_400_000
  return Array.from({ length: count }, (_, i) => {
    const at = from + (span * i) / (count - 1)
    const d = new Date(at)
    return { at, label: d.toLocaleDateString('en-US', showYear ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' }).replace(/ (\d\d)$/, " '$1") }
  })
}

/** Draws the chart into `host` and keeps the legend in `legend`. Returns a cleanup function. */
export function renderGroupChart(host: HTMLElement, legend: HTMLElement, series: ChartSeries[], onPlayer: (id: string, anchor: HTMLElement) => void): () => void {
  const withData = series.filter((s) => s.points.length)
  const colorIndex = new Map(series.map((s, i) => [s.id, i]))

  const drawLegend = () => {
    legend.innerHTML = series
      .map((s) => {
        const i = colorIndex.get(s.id)!
        const off = state.hidden.has(s.id)
        return `<button class="legend-chip${off ? ' off' : ''}${state.focus === s.id ? ' focus' : ''}" type="button" data-series="${esc(s.id)}" aria-pressed="${!off}" ${s.points.length ? '' : 'disabled title="No rated events in this period"'}>
          <i style="background:${colorVar(i)}"></i>${esc(s.name)}</button>`
      })
      .join('')
  }

  const draw = (hover?: { id: string; index: number }) => {
    const width = host.clientWidth
    if (!width) return
    const visible = withData.filter((s) => !state.hidden.has(s.id))
    if (!visible.length) {
      host.innerHTML = `<p class="chart-empty muted">${withData.length ? 'All players are hidden. Pick players in the legend.' : 'No rated events in this period.'}</p>`
      return
    }
    const all = visible.flatMap((s) => s.points)
    const times = all.map((p) => p.date.getTime())
    let from = Math.min(...times)
    let to = Math.max(...times)
    if (from === to) {
      from -= 15 * 86_400_000
      to += 15 * 86_400_000
    }
    const ratings = all.flatMap((p) => [p.rating, ...(p.pre != null ? [p.pre] : [])])
    let lo = Math.min(...ratings)
    let hi = Math.max(...ratings)
    const room = Math.max(20, (hi - lo) * 0.08)
    lo -= room
    hi += room
    const plotW = width - pad.left - pad.right
    const plotH = height - pad.top - pad.bottom
    const x = (t: number) => pad.left + ((t - from) / (to - from)) * plotW
    const y = (v: number) => pad.top + (1 - (v - lo) / (hi - lo)) * plotH

    const emphasized = hover?.id ?? state.focus
    const lines = visible
      .map((s) => {
        const i = colorIndex.get(s.id)!
        const dim = emphasized && emphasized !== s.id
        const pts = s.points.map((p) => `${x(p.date.getTime()).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ')
        const dots = s.points
          .map((p, j) => `<circle cx="${x(p.date.getTime()).toFixed(1)}" cy="${y(p.rating).toFixed(1)}" r="${hover?.id === s.id && hover.index === j ? 6 : 4}" />`)
          .join('')
        return `<g class="series${dim ? ' dim' : ''}${emphasized === s.id ? ' emph' : ''}" style="--c:${colorVar(i)}">
          <polyline points="${pts}" />${dots}</g>`
      })
      .join('')

    const grid = ticks(lo, hi)
      .map((v) => `<line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.left - 8}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${v}</text>`)
      .join('')
    const axis = timeTicks(from, to, plotW)
      .map((t, i, list) => `<text class="axis" x="${x(t.at)}" y="${height - 8}" text-anchor="${i === 0 ? 'start' : i === list.length - 1 ? 'end' : 'middle'}">${t.label}</text>`)
      .join('')

    let tip = ''
    if (hover) {
      const s = visible.find((v) => v.id === hover.id)!
      const p = s.points[hover.index]
      const px = x(p.date.getTime())
      const py = y(p.rating)
      const change = p.pre != null ? p.rating - p.pre : undefined
      tip = `<div class="group-tip" style="left:${Math.min(Math.max(px, 110), width - 110)}px;top:${py}px">
        <strong>${esc(s.name)}</strong>
        <span>${esc(p.event)}</span>
        <span class="muted">${eventDate(p.date)}</span>
        <span class="mono">${p.pre != null ? `${p.pre} → ` : ''}${p.rating}${change != null ? ` <b class="${change > 0 ? 'text-up' : change < 0 ? 'text-down' : 'muted'}">${signed(change)}</b>` : ''}</span>
      </div>`
    }

    host.innerHTML = `<svg width="${width}" height="${height}" role="img" aria-label="Rating after each tournament for ${visible.length} players">${grid}${axis}${lines}</svg>${tip}`
    hostScale = { x, y, visible }
  }

  let hostScale: { x: (t: number) => number; y: (v: number) => number; visible: ChartSeries[] } | undefined

  /** The nearest tournament dot to the pointer, within reach. */
  const nearest = (clientX: number, clientY: number) => {
    if (!hostScale) return undefined
    const rect = host.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    let best: { id: string; index: number; d: number } | undefined
    for (const s of hostScale.visible) {
      s.points.forEach((p, index) => {
        const d = Math.hypot(hostScale!.x(p.date.getTime()) - mx, hostScale!.y(p.rating) - my)
        if (d < 28 && (!best || d < best.d)) best = { id: s.id, index, d }
      })
    }
    return best
  }

  host.onpointermove = (e) => {
    const hit = nearest(e.clientX, e.clientY)
    draw(hit)
  }
  host.onpointerleave = () => draw()
  host.onclick = (e) => {
    const hit = nearest(e.clientX, e.clientY)
    if (hit) onPlayer(hit.id, host)
  }
  legend.onclick = (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-series]')
    if (!chip) return
    const id = chip.dataset.series!
    if (state.hidden.has(id)) state.hidden.delete(id)
    else state.hidden.add(id)
    drawLegend()
    draw()
  }
  legend.onpointerover = (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-series]')?.dataset.series ?? null
    if (id === state.focus) return
    state.focus = id
    draw()
  }
  legend.onpointerleave = () => {
    state.focus = null
    draw()
  }

  drawLegend()
  draw()
  const observer = new ResizeObserver(() => draw())
  observer.observe(host)
  return () => observer.disconnect()
}

/** Show everyone again (a new group starts with all players visible). */
export const resetChart = () => {
  state.hidden.clear()
  state.focus = null
}
