// About: why OpenBoard exists and what it does, opened from the ♛ OpenBoard
// brand in the header.

import type { View } from '../router'
import { replaceQuery } from '../router'
import { supportCard, supportLink } from '../donate'
import { chevron, prefs } from '../ui'

const features: { icon: string; title: string; text: string; href: string }[] = [
  { icon: '▦', title: 'Find tournaments near you', text: 'Rated events within 10 to 500 miles, this weekend or months ahead, plus national championships.', href: '#/events' },
  { icon: '♥', title: 'Follow friends and rivals', text: 'Watch any player and see the moment their rating changes.', href: '#/watching' },
  { icon: '📈', title: 'Track every point', text: 'Ratings as chess-clock digits, a full rating history, and each round of every tournament.', href: '#/' },
  { icon: '🏆', title: 'Celebrate the best wins', text: 'The strongest opponents a player has beaten, rated as they were that day.', href: '#/' },
  { icon: '🏅', title: 'See the Top 100', text: "US Chess's monthly lists by age, from 7 and under through 18, girls and seniors.", href: '#/top100' },
  { icon: '⌕', title: 'Look anyone up', text: 'Search any US Chess player by name or member ID, or a tournament by event ID.', href: '#/search' },
]

export const aboutView: View = ({ root, params }) => {
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

    ${supportCard()}

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

    <section class="card coach-invite-card" aria-labelledby="coach-invite-title">
      <div class="coach-invite-head">
        <span class="coach-invite-icon" aria-hidden="true">🏫</span>
        <h2 id="coach-invite-title">For schools and coaches</h2>
        <span class="wip-badge">Work in progress</span>
      </div>
      <p>If you're a school or a coach, try <strong>OpenBoard for Coaches</strong>. You'll like it: your whole team on one computer screen, with every kid's rating, progress and recent results.</p>
      <p class="wip-note">It's still being built and changes often. Free while it's in progress.</p>
      <a class="button prominent big" href="/coach/">Try OpenBoard for Coaches →</a>
    </section>

    <section class="about-footer">
      <p>Ratings come from US Chess's <a href="https://ratings.uschess.org" target="_blank" rel="noopener">ratings site (MUIR)</a>. Tournaments come from US Chess's <a href="https://new.uschess.org/upcoming-tournaments" target="_blank" rel="noopener">Tournament Life Announcements</a> and Plan Ahead Calendar.</p>
      <p>Also on iPhone and iPad: <a href="https://github.com/ilia-pavlov/OpenBoard" target="_blank" rel="noopener">OpenBoard for iOS</a>.</p>
      ${supportLink()}
      <p class="muted">Not affiliated with or endorsed by the US Chess Federation. Want to play rated games? <a href="https://www.uschess.org/join" target="_blank" rel="noopener">Join US Chess</a>.</p>
    </section>

    <details class="ideology">
      <summary class="button big">♛ Our ideology</summary>
      <div class="card ideology-body">
        <h2>What OpenBoard stands for</h2>
        <ul>
          <li><strong>Free for families.</strong> Parents and kids never pay to follow ratings, find tournaments or track friends and rivals.</li>
          <li><strong>No ads, no accounts, no tracking.</strong> Who you watch and what you save stays on your own device.</li>
          <li><strong>Kids first.</strong> Nothing pushy: no pop-ups, no ads, and support requests only where parents look.</li>
          <li><strong>Honest numbers.</strong> Ratings come straight from US Chess, and anything estimated is labeled as an estimate.</li>
          <li><strong>More kids playing chess.</strong> Making the next tournament easy to find and every bit of progress easy to see, so kids keep playing and chess keeps growing in the US.</li>
        </ul>
      </div>
    </details>`

  // From the header button: open the ideology section (and, for older links,
  // bring it into view). The query is dropped so the button works again.
  const ideologyParam = params.get('ideology')
  if (ideologyParam) {
    const ideology = root.querySelector<HTMLDetailsElement>('.ideology')!
    ideology.open = true
    if (ideologyParam !== 'open') requestAnimationFrame(() => ideology.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    replaceQuery(new URLSearchParams())
  }
}
