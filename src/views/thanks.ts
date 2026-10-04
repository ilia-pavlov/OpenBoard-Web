// Where Stripe sends a supporter after checkout (the Payment Link's
// "after completion" redirect is https://openboard.online/#/thanks).

import type { View } from '../router'

export const thanksView: View = ({ root }) => {
  document.title = 'Thank you · OpenBoard'
  root.innerHTML = `
    <section class="about-hero thanks">
      <div class="about-crown" aria-hidden="true">♛</div>
      <h1>Thank you!</h1>
      <p class="about-tagline">Your support keeps OpenBoard free for families and helps more kids find their next tournament.</p>
    </section>
    <p class="muted center small">Stripe emails your receipt.</p>
    <div class="about-cta">
      <a class="button prominent big" href="#/events">Find a tournament</a>
      <a class="button big" href="#/">My Card</a>
    </div>`
}
