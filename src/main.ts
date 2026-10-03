import './styles.css'
import { startRouter } from './router'
import { emptyState } from './ui'
import { historyView } from './views/history'
import { myCardView, profileView } from './views/player'
import { searchView } from './views/search'

// MARK: - Appearance (System / Light / Dark; dark by default, like the app)

type Appearance = 'system' | 'light' | 'dark'
const appearances: Appearance[] = ['dark', 'light', 'system']
const icons: Record<Appearance, string> = { dark: '☾', light: '☀', system: '◐' }

function currentAppearance(): Appearance {
  try {
    const saved = localStorage.getItem('appearance')
    return appearances.includes(saved as Appearance) ? (saved as Appearance) : 'dark'
  } catch {
    return 'dark'
  }
}

function applyAppearance(a: Appearance) {
  if (a === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = a
  const button = document.querySelector<HTMLButtonElement>('.appearance')!
  button.textContent = icons[a]
  button.title = `Appearance: ${a[0].toUpperCase()}${a.slice(1)}`
  button.setAttribute('aria-label', button.title)
}

document.querySelector('.appearance')!.addEventListener('click', () => {
  const next = appearances[(appearances.indexOf(currentAppearance()) + 1) % appearances.length]
  try {
    localStorage.setItem('appearance', next)
  } catch {
    // Not persisted in private mode; still applies for this visit.
  }
  applyAppearance(next)
})
applyAppearance(currentAppearance())

// MARK: - Routes

startRouter(
  document.getElementById('app')!,
  [
    { pattern: /^\/$/, view: myCardView, tab: 'card' },
    { pattern: /^\/search$/, view: searchView, tab: 'search' },
    { pattern: /^\/player\/(\d{8})$/, view: profileView, tab: 'search' },
    { pattern: /^\/player\/(\d{8})\/history$/, view: historyView, tab: 'search' },
  ],
  ({ root }) => {
    root.innerHTML = emptyState('♞', 'Nothing here', 'That page does not exist.') + `<p class="center"><a class="button" href="#/">Go to My Card</a></p>`
  },
)
