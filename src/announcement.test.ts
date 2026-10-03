// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { copyableText, safeHref, sanitizeAnnouncement } from './announcement'

const render = (html: string) => {
  const div = document.createElement('div')
  div.append(sanitizeAnnouncement(html))
  return div
}

describe('sanitizeAnnouncement', () => {
  it('drops scripts, images, frames, handlers and styles', () => {
    const div = render(
      '<p onclick="steal()" style="color:red">Hi<script>alert(1)</script><img src="x" onerror="alert(2)"></p><iframe src="https://evil.example"></iframe><style>body{}</style>',
    )
    expect(div.innerHTML).toBe('<p>Hi</p>')
  })

  it('keeps only web, email and phone links, opening web links in a new tab', () => {
    const div = render('<a href="javascript:alert(1)">bad</a> <a href="https://example.com/register">Register</a> <a href="mailto:td@example.com">TD</a>')
    const links = [...div.querySelectorAll('a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/register', 'mailto:td@example.com'])
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer')
    expect(div.textContent).toContain('bad') // the text stays, the link goes
  })

  it('keeps formatting and turns headings into bold lines', () => {
    const div = render('<h2>Prizes</h2><p><b>$500</b> first, <i>trophies</i></p><ul><li>U1000</li></ul>')
    expect(div.innerHTML).toBe('<h4>Prizes</h4><p><strong>$500</strong> first, <em>trophies</em></p><ul><li>U1000</li></ul>')
  })

  it('links bare addresses, emails and phone numbers but not dates or prizes', () => {
    const div = render('<p>See www.example.com/info or email td@example.com, call (646) 238-5213. Oct 9 2026-10-09, $10,000.</p>')
    expect([...div.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      'https://www.example.com/info',
      'mailto:td@example.com',
      'tel:6462385213',
    ])
  })

  it('removes empty padding paragraphs', () => {
    expect(render('<div>&nbsp;</div><p>Text</p>').innerHTML).toBe('<p>Text</p>')
  })
})

describe('copyableText', () => {
  it('keeps link addresses, bullets and paragraph breaks', () => {
    const text = copyableText(
      sanitizeAnnouncement('<p>Entry: <a href="https://example.com/reg">Register here</a></p><ul><li>Open</li><li>U1200</li></ul><p>Site: https://chess.example.org</p>'),
    )
    expect(text).toBe('Entry: Register here (https://example.com/reg)\n• Open\n• U1200\nSite: https://chess.example.org')
  })
})

describe('safeHref', () => {
  it('rejects anything but http, mailto and tel', () => {
    expect(safeHref('data:text/html,hi')).toBeUndefined()
    expect(safeHref('/relative')).toBeUndefined()
    expect(safeHref(' tel:5555550100')).toBe('tel:5555550100')
  })
})
