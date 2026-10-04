// Which Top 100 lists each player is on, so any screen can show a badge.
// Port of OpenBoard's TopListsIndex.swift.
//
// Loads every Regular-rating list once in the background (cached 12 h); US
// Chess doesn't publish ages, so being on an age list is the only age signal
// there is. Screens render empty badge slots, e.g.
//   <span data-top-badge="best" data-member="12345678"></span>
// and they fill in whenever the index is ready, including after later renders.

import { fetchTopList, fetchTopListDefinitions } from './api'
import { type TopListDefinition, type TopListRank, badgeLabel, sortKey } from './models'
import { esc } from './ui'

let definitions: TopListDefinition[] = []
let ranksByMember = new Map<string, TopListRank[]>()
let loading: Promise<void> | undefined

/** All lists the player is on, best rank first. */
export const ranksFor = (memberID: string) => ranksByMember.get(memberID) ?? []

export const knownDefinitions = () => definitions

function load(): Promise<void> {
  loading ??= (async () => {
    try {
      definitions = await fetchTopListDefinitions()
    } catch {
      loading = undefined // try again on the next screen
      return
    }
    const badgeLists = definitions.filter((d) => d.rating === 'R')
    const byMember = new Map<string, TopListRank[]>()
    // A few at a time: ~30 small requests, politely.
    const queue = [...badgeLists]
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (let d = queue.shift(); d; d = queue.shift()) {
          const list = await fetchTopList(d).catch(() => undefined)
          for (const entry of list?.entries ?? []) {
            byMember.set(entry.id, [...(byMember.get(entry.id) ?? []), { definition: d, rank: entry.rank }])
          }
        }
      }),
    )
    for (const ranks of byMember.values()) {
      ranks.sort((a, b) => a.rank - b.rank || sortKey(a.definition) - sortKey(b.definition))
    }
    ranksByMember = byMember
  })()
  return loading
}

/** Resolves once the index is loaded (or failed), so counts can use `ranksFor`. */
export const topListsReady = () => load()

/** "🏅 #37 · Age 9" */
export function topRankBadge(rank: TopListRank, compact = false): string {
  const label = badgeLabel(rank.definition)
  return `<span class="top-badge" aria-label="Number ${rank.rank} on the US Chess Top 100, ${esc(label)}">🏅 <span class="mono">#${rank.rank}</span>${compact ? '' : ` · ${esc(label)}`}</span>`
}

/** An empty slot a screen leaves where a badge may go. */
export const badgeSlot = (memberID: string, mode: 'best' | 'compact' | 'all' = 'best') =>
  `<span class="top-badge-slot ${mode}" data-top-badge="${mode}" data-member="${esc(memberID)}"></span>`

function fill(root: ParentNode) {
  for (const slot of root.querySelectorAll<HTMLElement>('[data-top-badge]:not([data-filled])')) {
    const ranks = ranksFor(slot.dataset.member ?? '')
    if (!ranks.length) continue
    slot.dataset.filled = 'true'
    const mode = slot.dataset.topBadge
    slot.innerHTML =
      mode === 'all'
        ? ranks
            .map((r) => `<a href="#/top100/${esc(r.definition.id)}?highlight=${esc(slot.dataset.member ?? '')}">${topRankBadge(r)}</a>`)
            .join('')
        : topRankBadge(ranks[0], mode === 'compact')
  }
}

/** Loads the index in the background and keeps badge slots under `root` filled. */
export function startBadges(root: HTMLElement) {
  new MutationObserver(() => fill(root)).observe(root, { childList: true, subtree: true })
  load().then(() => fill(root))
}
