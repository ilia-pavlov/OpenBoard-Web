// About: why OpenBoard exists and what it does, opened from the ♛ OpenBoard
// brand in the header.

import type { View } from '../router'
import { chevron, prefs } from '../ui'

const features: { icon: string; title: string; text: string; href: string }[] = [
  { icon: '▦', title: 'Find tournaments near you', text: 'Rated events within 10 to 500 miles, this weekend or months ahead, plus national championships.', href: '#/events' },
  { icon: '♥', title: 'Follow friends and rivals', text: 'Watch any player and see the moment their rating changes.', href: '#/watching' },
  { icon: '📈', title: 'Track every point', text: 'Ratings as chess-clock digits, a full rating history, and each round of every tournament.', href: '#/' },
  { icon: '🏆', title: 'Celebrate the best wins', text: 'The strongest opponents a player has beaten, rated as they were that day.', href: '#/' },
  { icon: '🏅', title: 'See the Top 100', text: "US Chess's monthly lists by age, from 7 and under through 18, girls and seniors.", href: '#/top100' },
  { icon: '⌕', title: 'Look anyone up', text: 'Search any US Chess player by name or member ID, or a tournament by event ID.', href: '#/search' },
]

export const aboutView: View = ({ root }) => {
  document.title = 'About · OpenBoard'
  const myCard = prefs.primary ? `#/player/${prefs.primary}` : '#/search'
  root.innerHTML = `
    <section class="about-hero">
      <div class="about-crown" aria-hidden="true">♛</div>
      <h1>OpenBoard</h1>
      <p class="about-tagline">US Chess ratings and tournaments, made for families.</p>
    </section>

    <section class="card about-mission">
      <h2 class="section-label">Why I built this</h2>
      <p>I built OpenBoard to help <strong>parents find tournaments</strong> for their kids, to let <strong>kids follow their friends and rivals</strong> and <strong>track their points</strong>, and overall to help <strong>make chess more popular in the US</strong>.</p>
      <p class="muted">The official tools are built for organizers and run slowly on phones. OpenBoard puts what families actually check — the next tournament, the new rating, how a friend did — one tap away.</p>
    </section>

    <div class="about-audiences">
      <div class="card audience">
        <span class="audience-icon" aria-hidden="true">👪</span>
        <h3>For parents</h3>
        <p>Find rated tournaments nearby, see dates, maps and entry links, and save the ones you're planning for.</p>
      </div>
      <div class="card audience">
        <span class="audience-icon" aria-hidden="true">♟</span>
        <h3>For players</h3>
        <p>Watch your rating climb, check every round, and keep an eye on friends and rivals.</p>
      </div>
    </div>

    <h2 class="section-label">What you can do</h2>
    <div class="card list">
      ${features
        .map(
          (f) => `<a class="list-row feature-row" href="${f.href === '#/' ? myCard : f.href}">
            <span class="browse-icon" aria-hidden="true">${f.icon}</span>
            <span class="player-text"><strong>${f.title}</strong><small>${f.text}</small></span>
            ${chevron}
          </a>`,
        )
        .join('')}
    </div>

    <div class="about-cta">
      <a class="button prominent big" href="#/events">Find a tournament</a>
      <a class="button big" href="#/search">Find a player</a>
    </div>

    <section class="about-footer">
      <p>Ratings come from US Chess's <a href="https://ratings.uschess.org" target="_blank" rel="noopener">ratings site (MUIR)</a>. Tournaments come from US Chess's <a href="https://new.uschess.org/upcoming-tournaments" target="_blank" rel="noopener">Tournament Life Announcements</a> and Plan Ahead Calendar.</p>
      <p>Also on iPhone and iPad: <a href="https://github.com/ilia-pavlov/OpenBoard" target="_blank" rel="noopener">OpenBoard for iOS</a>.</p>
      <p class="muted">Not affiliated with or endorsed by the US Chess Federation. Want to play rated games? <a href="https://www.uschess.org/join" target="_blank" rel="noopener">Join US Chess</a>.</p>
    </section>`
}
