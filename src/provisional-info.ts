// The ⓘ next to "Provisional · N games to go": a short, plain explanation for
// parents and coaches. Shown only where a rating is provisional.
//
// The rating cards are links (to rating history), so the button is a
// span[role=button] that opens the popover itself and stops the link.

import { establishedAfter } from './models'

const id = 'provisional-info'

/** The ⓘ control. `label` names it for screen readers. */
export const provisionalInfoButton = (label = 'What does provisional mean?') =>
  `<span class="info-dot" role="button" tabindex="0" data-provisional-info aria-label="${label}" title="${label}">ⓘ</span>`

const popover = () => `<div id="${id}" class="info-popover card" popover>
  <h3>Provisional rating</h3>
  <p>A US Chess rating is <strong>provisional</strong> until it's based on <strong>${establishedAfter} games</strong>. After that it becomes <strong>established</strong>.</p>
  <ul>
    <li>📈 While it's provisional, the rating moves faster: each result counts for more, so it can jump up or down quickly.</li>
    <li>🔢 “Games to go” counts every rated game played so far, including tournaments rated since the last official list.</li>
    <li>📅 The official list (published monthly) can show a higher number to go, because it only includes games rated before its cutoff.</li>
    <li>🏆 Some tournaments treat provisional players differently for sections or prizes. The tournament announcement says if so.</li>
  </ul>
  <button class="button" type="button" popovertarget="${id}" popovertargetaction="hide">Got it</button>
</div>`

/** Adds the explanation to the page once, the first time it's needed. */
function ensurePopover(): HTMLElement {
  let el = document.getElementById(id)
  if (!el) {
    document.body.insertAdjacentHTML('beforeend', popover())
    el = document.getElementById(id)!
  }
  return el
}

function open(e: Event) {
  e.preventDefault() // the button sits inside a link to rating history
  e.stopPropagation()
  const el = ensurePopover()
  if (el.matches(':popover-open')) el.hidePopover()
  else el.showPopover()
}

/** Wires every ⓘ on the page (now and later), once. */
export function enableProvisionalInfo() {
  document.addEventListener(
    'click',
    (e) => {
      if ((e.target as HTMLElement).closest('[data-provisional-info]')) open(e)
    },
    true,
  )
  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).closest('[data-provisional-info]')) open(e)
    },
    true,
  )
}
