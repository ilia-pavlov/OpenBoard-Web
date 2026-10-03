// One upcoming tournament: when, where (map, directions, distance), Register,
// Save, the full announcement as the organizer formatted it (with Copy), and
// organizer contacts. Port of TournamentDetailView / MajorEventView.

import { copyableText, sanitizeAnnouncement } from '../announcement'
import { milesBetween } from '../location'
import type { View } from '../router'
import {
  type MajorEvent, type TournamentDetail, addressLine, fetchDetail, findAnnouncement, pageURL, searchName, startDate,
} from '../tournaments'
import { dateRange, errorCard, esc, isoDay, phone, prefs, sectionLabel, skeleton } from '../ui'
import { dateBlock } from './events'

const isApple = () => /iPhone|iPad|Macintosh/.test(navigator.userAgent)

export const tournamentView: View = ({ root, signal }, [slug]) => {
  const id = `/${slug}`
  const backLink = `<a class="back-link" href="#/events">‹ Events</a>`

  const load = () => {
    root.innerHTML = `${backLink}<h1 class="screen-title small-title">Tournament</h1>${skeleton([90, 48, 260, 220, 120])}`
    fetchDetail(id).then(
      (detail) => {
        if (signal.aborted) return
        document.title = `${detail.name} · OpenBoard`
        render(detail)
      },
      (error: Error) => {
        if (!signal.aborted) root.innerHTML = `${backLink}<h1 class="screen-title small-title">Tournament</h1>${errorCard(error.message)}`
      },
    )
  }

  const render = (d: TournamentDetail) => {
    const tags = [...d.banner, ...(d.isFIDERated ? ['FIDE rated'] : []), ...(d.isOnline ? ['Online'] : [])]
    root.innerHTML = `
      ${backLink}
      <header class="event-header">
        <h1 class="event-title">${esc(d.name)}</h1>
        ${d.startDate ? `<p class="muted">📅 ${esc(dateText(d))}</p>` : ''}
        ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </header>
      <div class="action-row">
        ${registerButton(d)}
        <button class="button big" type="button" data-action="save" aria-pressed="${prefs.isSaved(d.id)}">${saveLabel(prefs.isSaved(d.id))}</button>
      </div>
      ${d.latitude != null || addressLine(d) ? locationCard(d) : ''}
      ${d.bodyHTML.trim() ? announcementCard() : ''}
      ${organizerCard(d)}
      <a class="external-link" href="${esc(pageURL(d.id))}" target="_blank" rel="noopener">View on US Chess ↗</a>`

    const body = root.querySelector<HTMLElement>('.announcement-body')
    if (body) {
      body.append(sanitizeAnnouncement(d.bodyHTML))
      // Long announcements start clamped, like the app's 12 lines.
      requestAnimationFrame(() => {
        if (body.scrollHeight <= body.clientHeight + 4) root.querySelector('[data-action=more]')?.remove()
      })
    }

    root.onclick = (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
      switch (target?.dataset.action) {
        case 'save': {
          const saved = prefs.toggleSaved({
            id: d.id,
            name: d.name,
            startDate: d.startDate ? isoDay(d.startDate) : undefined,
            endDate: d.endDate ? isoDay(d.endDate) : undefined,
            location: [d.city, d.state].filter(Boolean).join(', ') || undefined,
          })
          target.setAttribute('aria-pressed', String(saved))
          target.innerHTML = saveLabel(saved)
          break
        }
        case 'copy':
          if (!body) break
          navigator.clipboard?.writeText(copyableText(body)).then(() => {
            target.textContent = '✓ Copied'
            target.classList.add('copied')
            setTimeout(() => {
              target.textContent = '⧉ Copy'
              target.classList.remove('copied')
            }, 1500)
          })
          break
        case 'more': {
          const expanded = body?.classList.toggle('expanded')
          target.textContent = expanded ? 'Show less' : 'Show more'
          target.setAttribute('aria-expanded', String(expanded))
          break
        }
        case 'retry':
          load()
          break
      }
    }
  }

  root.onclick = (e) => {
    if ((e.target as HTMLElement).closest('[data-action=retry]')) load()
  }
  load()
}

function dateText(d: TournamentDetail): string {
  const start = d.startDate!
  if (!d.endDate || d.endDate <= start) {
    return start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }
  // Long ranges are weekly/monthly series.
  if (d.endDate.getTime() - start.getTime() > 14 * 86_400_000) return 'Recurring'
  return dateRange(start, d.endDate)
}

const saveLabel = (saved: boolean) => (saved ? '🔖 Saved' : '🏷 Save')

function registerButton(d: TournamentDetail): string {
  const url = d.registrationURL ?? d.organizerWebsite
  if (!url) return ''
  return `<a class="button prominent big" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${d.registrationURL ? '✎ Register' : '↗ Organizer website'}</a>`
}

function locationCard(d: TournamentDetail): string {
  const address = addressLine(d)
  const hasPoint = d.latitude != null && d.longitude != null
  const here = prefs.location
  const miles =
    hasPoint && here?.latitude != null && here.longitude != null
      ? Math.round(milesBetween({ latitude: here.latitude, longitude: here.longitude }, { latitude: d.latitude!, longitude: d.longitude! }))
      : undefined
  const destination = hasPoint ? `${d.latitude},${d.longitude}` : address
  const directions = destination
    ? isApple()
      ? `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    : undefined
  const map = hasPoint
    ? (() => {
        const [lat, lon] = [d.latitude!, d.longitude!]
        const bbox = [lon - 0.008, lat - 0.005, lon + 0.008, lat + 0.005].map((n) => n.toFixed(5)).join(',')
        return `<iframe class="venue-map" title="Map of ${esc(d.venueName ?? d.name)}" loading="lazy" referrerpolicy="no-referrer"
          src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)},${lon.toFixed(5)}"></iframe>`
      })()
    : ''
  return `<section class="card detail-card">
    ${sectionLabel('Location')}
    ${map}
    <div class="venue">
      ${d.venueName ? `<strong>${esc(d.venueName)}</strong>` : ''}
      ${address ? `<span class="muted selectable">${esc(address)}</span>` : ''}
      ${miles != null ? `<small class="muted">About ${miles} mi from you</small>` : ''}
    </div>
    ${directions ? `<a class="button" href="${esc(directions)}" target="_blank" rel="noopener">➜ Directions</a>` : ''}
  </section>`
}

function announcementCard(): string {
  return `<section class="card detail-card">
    <div class="card-head">${sectionLabel('Announcement')}<span class="spacer"></span><button class="link-button copy-button" type="button" data-action="copy" aria-label="Copy announcement">⧉ Copy</button></div>
    <div class="announcement-body"></div>
    <button class="link-button" type="button" data-action="more" aria-expanded="false">Show more</button>
  </section>`
}

function organizerCard(d: TournamentDetail): string {
  const rows: string[] = []
  if (d.organizerEmail) rows.push(`<a href="mailto:${esc(d.organizerEmail)}">✉ ${esc(d.organizerEmail)}</a>`)
  if (d.organizerPhone) {
    const digits = d.organizerPhone.replace(/\D/g, '')
    rows.push(`<a href="tel:${digits}">☎ ${esc(phone(digits))}</a>`)
  }
  if (d.organizerWebsite) {
    rows.push(`<a href="${esc(d.organizerWebsite)}" target="_blank" rel="noopener noreferrer">🌐 ${esc(new URL(d.organizerWebsite).host)}</a>`)
  }
  if (!d.organizerName && !rows.length) return ''
  return `<section class="card detail-card">
    ${sectionLabel('Organizer')}
    ${d.organizerName ? `<strong>${esc(d.organizerName)}</strong>` : ''}
    <div class="contact-links">${rows.join('')}</div>
  </section>`
}

/** A Plan Ahead entry: opens the organizer's announcement when one can be found, else the calendar entry. */
export const majorEventView: View = ({ root, params, signal }) => {
  const year = Number(params.get('year'))
  const dates = params.get('dates') ?? ''
  const event: MajorEvent = {
    year,
    dates,
    name: params.get('name') ?? '',
    city: params.get('city') ?? '',
    state: params.get('state') ?? '',
    isNationalChampionship: params.get('n') === '1',
    startDate: startDate(dates, year),
  }
  root.innerHTML = `<a class="back-link" href="#/events?scope=majors">‹ Major events</a><h1 class="screen-title small-title">Tournament</h1>${skeleton([90, 48, 200])}`
  const fallback = () => {
    const web = `https://duckduckgo.com/?q=${encodeURIComponent(`${searchName(event)} ${event.year} chess ${event.city}`)}`
    const map = isApple()
      ? `https://maps.apple.com/?q=${encodeURIComponent(`${event.city}, ${event.state}`)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.city}, ${event.state}`)}`
    root.innerHTML = `
      <a class="back-link" href="#/events?scope=majors">‹ Major events</a>
      <div class="card tournament-row static">
        ${dateBlock(event.startDate)}
        <span class="tournament-main">
          <strong>${esc(event.name)}</strong>
          <small>${esc(`${event.dates}, ${event.year} · ${event.city}, ${event.state}`)}</small>
          ${event.isNationalChampionship ? '<span class="tag">★ National Championship</span>' : ''}
        </span>
      </div>
      <p class="muted">The organizer hasn't posted a full announcement on US Chess yet.</p>
      <a class="button prominent big" href="${esc(web)}" target="_blank" rel="noopener">⌕ Search the web</a>
      <a class="button big" href="${esc(map)}" target="_blank" rel="noopener">🗺 ${esc(`${event.city}, ${event.state}`)} on a map</a>`
  }
  findAnnouncement(event).then(
    (match) => {
      if (signal.aborted) return
      if (match) location.replace(`#/tournament${match.id}`)
      else fallback()
    },
    () => !signal.aborted && fallback(),
  )
}
