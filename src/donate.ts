// "Support OpenBoard": a link to a Stripe Payment Link. Each gift is $7 and
// the donor picks how many (quantity 1–99). Stripe hosts the checkout (cards,
// Apple Pay, Google Pay), so the site never handles payment details. Kept quiet on purpose: kids use this
// site, so support asks appear only on About and at the end of Events, never as
// pop-ups or on the screens kids use most.

import { Links } from './endpoints'
import { esc } from './ui'

/** Whether a donation link is configured; everything here renders nothing until it is. */
export const canDonate = () => Links.donate.startsWith('https://')

const link = (className: string, text: string) =>
  `<a class="${className}" href="${esc(Links.donate)}" target="_blank" rel="noopener">${text}</a>`

/** The About page card: why support matters, and the button. */
export function supportCard(): string {
  if (!canDonate()) return ''
  return `<section class="card support-card" aria-labelledby="support-title">
    <div class="support-heart" aria-hidden="true">♥</div>
    <h2 id="support-title">Support OpenBoard</h2>
    <p>OpenBoard is free, with no ads and no accounts. If it helps your family, a small gift keeps it that way: it pays for the domain and hosting and gives me time to build new features.</p>
    ${link('button prominent big support-button', '♥ Support OpenBoard')}
    <p class="support-note">Secure checkout by Stripe. Each gift is $7; add more on the next screen to give more. Apple Pay, Google Pay and cards accepted. Gifts aren't tax-deductible.</p>
  </section>`
}

/** A one-line link for footers. */
export function supportLink(): string {
  return canDonate() ? `<p>${link('support-link', '♥ Support OpenBoard')}</p>` : ''
}

/** A quiet line at the end of the Events lists, where parents find tournaments. */
export function supportLine(): string {
  if (!canDonate()) return ''
  return `<p class="support-line">Found a tournament with OpenBoard? ${link('support-link', '♥ Support the project')}</p>`
}
