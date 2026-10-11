// Send feedback: ideas, problems or anything else, saved by the Worker
// (POST /api/feedback, kept in D1). No account needed, and the only things
// sent are what the person types.

import type { View } from '../router'
import { esc } from '../ui'

const kinds = [
  { value: 'idea', label: '💡 Idea', prompt: 'What would make OpenBoard better for your family?' },
  { value: 'problem', label: '🐞 Something’s wrong', prompt: 'What happened, and on which screen? A player or tournament name helps.' },
  { value: 'other', label: '💬 Other', prompt: 'What’s on your mind?' },
] as const

const maxMessage = 2000

export const feedbackView: View = ({ root, params, signal }) => {
  document.title = 'Send feedback · OpenBoard'
  const initial = kinds.find((k) => k.value === params.get('kind')) ?? kinds[0]
  root.innerHTML = `
    <a class="back-link" href="#/about">‹ About</a>
    <section class="about-hero feedback-hero">
      <div class="about-crown" aria-hidden="true">💡</div>
      <h1>Send feedback</h1>
      <p class="about-tagline">Ideas, problems, wishes: I read every message.</p>
    </section>

    <form class="card feedback-form" novalidate>
      <fieldset class="feedback-kinds">
        <legend class="section-label">What is it?</legend>
        ${kinds
          .map(
            (k) => `<label class="feedback-kind">
              <input type="radio" name="kind" value="${k.value}"${k === initial ? ' checked' : ''}>
              <span>${esc(k.label)}</span>
            </label>`,
          )
          .join('')}
      </fieldset>

      <label class="feedback-field">
        <span class="feedback-label">Your message</span>
        <textarea name="message" rows="6" maxlength="${maxMessage}" required placeholder="${esc(initial.prompt)}"></textarea>
        <small class="feedback-count" aria-live="polite"></small>
      </label>

      <label class="feedback-field">
        <span class="feedback-label">Email <span class="muted">(optional, if you’d like a reply)</span></span>
        <input type="email" name="contact" maxlength="200" autocomplete="email" inputmode="email" placeholder="you@example.com">
        <small class="muted">Kids: ask a parent before sharing an email.</small>
      </label>

      <!-- Left empty by people; bots that fill it in are ignored. -->
      <input class="feedback-trap" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">

      <p class="feedback-error" role="alert" hidden></p>
      <button class="button prominent big" type="submit">Send</button>
    </form>`

  const form = root.querySelector<HTMLFormElement>('.feedback-form')!
  const message = form.elements.namedItem('message') as HTMLTextAreaElement
  const count = form.querySelector<HTMLElement>('.feedback-count')!
  const errorLine = form.querySelector<HTMLElement>('.feedback-error')!
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!

  const showError = (text: string) => {
    errorLine.textContent = text
    errorLine.hidden = !text
  }

  root.onchange = (e) => {
    const input = e.target as HTMLInputElement
    if (input.name === 'kind') message.placeholder = kinds.find((k) => k.value === input.value)?.prompt ?? ''
  }
  root.oninput = () => {
    const left = maxMessage - message.value.length
    count.textContent = left < 200 ? `${left} characters left` : ''
  }

  root.onclick = (e) => {
    if ((e.target as HTMLElement).closest('.send-another')) feedbackView({ root, params, signal }, [])
  }

  root.onsubmit = async (e) => {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(form))
    if (String(data.message ?? '').trim().length < 3) {
      showError('Please write a few words.')
      message.focus()
      return
    }
    showError('')
    submit.disabled = true
    submit.textContent = 'Sending…'
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal,
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? "Couldn't send your message.")
      }
      form.outerHTML = `<section class="card feedback-sent" role="status">
          <div class="support-heart" aria-hidden="true">✓</div>
          <h2>Thank you!</h2>
          <p>Your message is on its way.${data.contact ? ' If you asked a question, I’ll reply by email.' : ''}</p>
          <div class="about-cta">
            <button class="button big send-another" type="button">Send another</button>
            <a class="button prominent big" href="#/about">Done</a>
          </div>
        </section>`
    } catch (err) {
      if (signal.aborted) return
      showError(err instanceof TypeError ? 'No connection. Check your internet and try again.' : (err as Error).message)
      submit.disabled = false
      submit.textContent = 'Send'
    }
  }
}
