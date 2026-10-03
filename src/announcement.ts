// The organizer's announcement, as they formatted it, made safe to show:
// the HTML is parsed inertly and rebuilt from an allowlist (formatting, lists,
// tables and http/mailto/tel links only; no scripts, styles, images, frames or
// attributes). Bare web addresses, emails and phone numbers become links.
// The browser counterpart of the app's markdown(fromHTML:) + data detectors.

const blockTags = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'BLOCKQUOTE'])
const keptTags: Record<string, string> = {
  P: 'p', DIV: 'p', BR: 'br', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u',
  UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote',
  TABLE: 'table', THEAD: 'thead', TBODY: 'tbody', TR: 'tr', TD: 'td', TH: 'th',
  H1: 'h4', H2: 'h4', H3: 'h4', H4: 'h4', H5: 'h4', H6: 'h4',
}
const droppedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'NOSCRIPT', 'TEMPLATE', 'VIDEO', 'AUDIO', 'LINK', 'META'])

/** Only web, email and phone links survive; everything else (javascript:, data:, relative) is dropped. */
export function safeHref(href: string | null): string | undefined {
  const value = href?.trim() ?? ''
  return /^(https?:|mailto:|tel:)/i.test(value) ? value : undefined
}

function link(href: string, children: Node[] | string): HTMLAnchorElement {
  const a = document.createElement('a')
  a.href = href
  if (/^https?:/i.test(href)) {
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
  }
  if (typeof children === 'string') a.textContent = children
  else a.append(...children)
  return a
}

// Web addresses, emails, and US-style phone numbers in plain text.
const detector = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])|(www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"]*[^\s<>".,;:!?)\]'])?)|([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})|((?<![\d\w])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d))/gi

/** Text with detected addresses, emails and phone numbers turned into links. */
function linkify(text: string): Node[] {
  const out: Node[] = []
  let last = 0
  for (const m of text.matchAll(detector)) {
    const [match, url, www, email, phone] = m
    const href = url ?? (www ? `https://${www}` : email ? `mailto:${email}` : `tel:${phone.replace(/[^\d+]/g, '')}`)
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)))
    out.push(link(href, match))
    last = m.index + match.length
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)))
  return out
}

function rebuild(node: Node, insideLink: boolean): Node[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    return insideLink ? [document.createTextNode(text)] : linkify(text)
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const el = node as Element
  const tag = el.tagName.toUpperCase()
  if (droppedTags.has(tag)) return []
  const children = (inLink: boolean) => [...el.childNodes].flatMap((c) => rebuild(c, inLink))

  if (tag === 'A') {
    const href = safeHref(el.getAttribute('href'))
    return href && !insideLink ? [link(href, children(true))] : children(insideLink)
  }
  const kept = keptTags[tag]
  if (!kept) return children(insideLink) // unknown tags are unwrapped, keeping their text
  const out = document.createElement(kept)
  out.append(...children(insideLink))
  return [out]
}

/** A detached, safe fragment of the announcement. */
export function sanitizeAnnouncement(html: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(html, 'text/html') // inert: nothing runs or loads
  const fragment = document.createDocumentFragment()
  fragment.append(...[...parsed.body.childNodes].flatMap((n) => rebuild(n, false)))
  // Organizers pad with empty paragraphs (&nbsp;); drop them.
  for (const p of fragment.querySelectorAll('p')) {
    if (!p.textContent?.trim() && !p.querySelector('a, br')) p.remove()
  }
  return fragment
}

/**
 * Plain text for the clipboard: paragraphs on their own lines, "• " bullets,
 * and named links keep their address in parentheses ("Register here
 * (https://…)") so pasting loses nothing.
 */
export function copyableText(root: Node): string {
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? '').replace(/\s+/g, ' ')
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return
    const el = node as Element
    const tag = el.tagName?.toUpperCase()
    if (tag === 'BR') {
      out += '\n'
      return
    }
    if (tag === 'LI') out += '• '
    node.childNodes.forEach(walk)
    if (tag === 'A') {
      const href = el.getAttribute('href') ?? ''
      const label = el.textContent ?? ''
      if (/^https?:/i.test(href)) {
        const host = new URL(href).host.replace(/^www\./, '')
        if (!label.includes(host)) out += ` (${href})`
      }
    }
    if (tag === 'TD' || tag === 'TH') out += '\t'
    if (tag && (blockTags.has(tag) || tag === 'H4') && !out.endsWith('\n')) out += '\n'
  }
  walk(root)
  return out
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n[ \t ]+/g, '\n')
    .replace(/[  ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
