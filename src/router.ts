// Hash router: #/path?query. Each view renders into the main element and gets
// a signal that aborts when the user navigates away, so late responses from
// an old screen never overwrite the new one.

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

export function startRouter(root: HTMLElement, routes: Route[], notFound: View) {
  let controller: AbortController | undefined
  let lastPath = ''

  const render = () => {
    const [path, query = ''] = location.hash.replace(/^#/, '').split('?')
    controller?.abort()
    controller = new AbortController()
    root.onclick = null
    root.oninput = null
    root.onchange = null
    root.onsubmit = null
    document.title = 'OpenBoard'

    const normalized = path || '/'
    const route = routes.find((r) => r.pattern.test(normalized))
    const captures = route ? normalized.match(route.pattern)!.slice(1) : []
    for (const link of document.querySelectorAll<HTMLElement>('[data-tab]')) {
      link.toggleAttribute('aria-current', link.dataset.tab === route?.tab)
    }

    ;(route?.view ?? notFound)({ root, params: new URLSearchParams(query), signal: controller.signal }, captures)

    // New screen: start at the top. Same screen with new filters: stay put.
    if (normalized !== lastPath) {
      window.scrollTo(0, 0)
      // Move focus to the new screen: screen readers start there, and the
      // clicked tab doesn't keep a focus ring.
      if (lastPath) root.focus({ preventScroll: true })
    }
    lastPath = normalized
  }

  window.addEventListener('hashchange', render)
  render()
}

/** Replace the query string without adding a history entry or re-rendering. */
export function replaceQuery(params: URLSearchParams) {
  const [path] = location.hash.split('?')
  const qs = params.toString()
  history.replaceState(null, '', `${path}${qs ? `?${qs}` : ''}`)
}
