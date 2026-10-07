// Hash router: #/path?query. Each view renders into the main element and gets
// a signal that aborts when the user navigates away, so late responses from
// an old screen never overwrite the new one.
//
// Going back keeps your place, like the iOS app: every history entry gets an
// id; its scroll position and the link opened from it are remembered, and on
// Back the position is restored (once the list has loaded) and the row you
// opened is outlined.

export interface ViewContext {
  root: HTMLElement
  params: URLSearchParams
  signal: AbortSignal
}

export type View = (ctx: ViewContext, captures: string[]) => void

interface Route {
  pattern: RegExp
  view: View
  tab?: string
}

interface EntryState {
  obEntry?: number
}

/** Remembered per history entry for this tab (survives a reload, not a new tab). */
const memory = {
  read<T>(key: string, fallback: T): T {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? fallback
    } catch {
      return fallback
    }
  },
  write(key: string, value: unknown) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Private mode: positions last until the page closes.
    }
  },
}

const scrolls = new Map<number, number>(memory.read<[number, number][]>('ob.scrolls', []))
const opened = new Map<number, string>(memory.read<[number, string][]>('ob.opened', []))
/** Entry id → the entry (and its hash) it was opened from, for in-app back links. */
const from = new Map<number, { entry: number; hash: string }>(memory.read<[number, { entry: number; hash: string }][]>('ob.from', []))
let nextEntry = memory.read<number>('ob.nextEntry', 1)

const entryOf = () => (history.state as EntryState | null)?.obEntry

function save() {
  // Only recent entries matter; keep the stored lists short.
  const recent = <T>(m: Map<number, T>) => [...m].slice(-50)
  memory.write('ob.scrolls', recent(scrolls))
  memory.write('ob.opened', recent(opened))
  memory.write('ob.from', recent(from))
  memory.write('ob.nextEntry', nextEntry)
}

const pathOf = (hash: string) => hash.replace(/^#/, '').split('?')[0] || '/'

export function startRouter(root: HTMLElement, routes: Route[], notFound: View) {
  // We restore positions ourselves, after the list has loaded.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  let controller: AbortController | undefined
  let lastPath = ''
  let current = 0
  let currentHash = ''
  let cancelRestore: (() => void) | undefined
  let openedFrom: { entry: number; hash: string } | undefined

  const render = () => {
    const [path, query = ''] = location.hash.replace(/^#/, '').split('?')
    controller?.abort()
    controller = new AbortController()
    cancelRestore?.()
    root.onclick = null
    root.oninput = null
    root.onchange = null
    root.onsubmit = null
    document.title = 'OpenBoard'

    // A history entry we've seen before is a Back/Forward; a new one gets an id.
    let entry = entryOf()
    const returning = entry != null && (scrolls.has(entry) || opened.has(entry))
    if (entry == null) {
      entry = nextEntry++
      history.replaceState({ ...(history.state as object | null), obEntry: entry } satisfies EntryState, '')
      if (openedFrom) from.set(entry, openedFrom)
      save()
    }
    openedFrom = undefined
    current = entry
    currentHash = location.hash

    const normalized = path || '/'
    const route = routes.find((r) => r.pattern.test(normalized))
    const captures = route ? normalized.match(route.pattern)!.slice(1) : []
    for (const link of document.querySelectorAll<HTMLElement>('[data-tab]')) {
      link.toggleAttribute('aria-current', link.dataset.tab === route?.tab)
    }

    ;(route?.view ?? notFound)({ root, params: new URLSearchParams(query), signal: controller.signal }, captures)

    if (returning) {
      cancelRestore = restore(root, scrolls.get(entry) ?? 0, opened.get(entry))
    } else if (normalized !== lastPath) {
      // New screen: start at the top. Same screen with new filters: stay put.
      window.scrollTo(0, 0)
    }
    if (normalized !== lastPath && lastPath) {
      // Move focus to the new screen: screen readers start there, and the
      // clicked tab doesn't keep a focus ring.
      root.focus({ preventScroll: true })
    }
    lastPath = normalized
  }

  // Remember where each entry is scrolled to…
  let scrollPending = false
  window.addEventListener(
    'scroll',
    () => {
      if (scrollPending) return
      scrollPending = true
      requestAnimationFrame(() => {
        scrollPending = false
        scrolls.set(current, window.scrollY)
      })
    },
    { passive: true },
  )
  window.addEventListener('pagehide', save)

  // …and which in-app link was opened from it.
  root.addEventListener(
    'click',
    (e) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#/"]')
      if (!link) return
      // "‹ Events" on a screen opened from Events is really Back: return to
      // that entry, so the list keeps its position.
      const parent = from.get(current)
      if (link.classList.contains('back-link') && parent && pathOf(parent.hash) === pathOf(link.getAttribute('href')!)) {
        e.preventDefault()
        e.stopPropagation()
        history.back()
        return
      }
      openedFrom = { entry: current, hash: currentHash }
      scrolls.set(current, window.scrollY)
      opened.set(current, link.getAttribute('href')!)
      save()
    },
    true,
  )

  window.addEventListener('hashchange', render)
  render()
}

/**
 * Scrolls back to `y` and outlines the link that was opened, waiting (up to a
 * few seconds) for the list to load. Stops as soon as the reader scrolls.
 */
function restore(root: HTMLElement, y: number, href?: string): () => void {
  let stopped = false
  const started = performance.now()
  const stop = () => {
    stopped = true
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('touchmove', onUser)
    window.removeEventListener('keydown', onUser)
  }
  // A trackpad swipe-back keeps sending (sideways) wheel events after the
  // page changes; only vertical scrolling after a moment means the reader took over.
  const onUser = () => performance.now() - started > 300 && stop()
  const onWheel = (e: WheelEvent) => Math.abs(e.deltaY) > Math.abs(e.deltaX) && onUser()
  window.addEventListener('wheel', onWheel, { passive: true })
  window.addEventListener('touchmove', onUser, { passive: true })
  window.addEventListener('keydown', onUser)

  const step = () => {
    if (stopped) return
    const link = href ? [...root.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) => a.getAttribute('href') === href) : undefined
    if (link && !link.classList.contains('last-opened')) {
      root.querySelectorAll('.last-opened').forEach((el) => el.classList.remove('last-opened'))
      link.classList.add('last-opened')
    }
    const reachable = document.documentElement.scrollHeight - window.innerHeight >= y - 2
    if (reachable) window.scrollTo(0, y)
    const done = reachable && (!href || link)
    if (!done && performance.now() - started < 4000) requestAnimationFrame(step)
    else stop()
  }
  requestAnimationFrame(step)
  return stop
}

/** Replace the query string without adding a history entry or re-rendering. */
export function replaceQuery(params: URLSearchParams) {
  const [path] = location.hash.split('?')
  const qs = params.toString()
  // Keep the entry's id so Back still finds its scroll position.
  history.replaceState(history.state, '', `${path}${qs ? `?${qs}` : ''}`)
}
