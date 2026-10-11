// Suggestions and problem reports from the "Send feedback" form (#/feedback).
// Only what the person typed is kept: no IP address, no browser details, in
// keeping with "no tracking". Kept free of Workers globals so it can be
// unit-tested; the Worker stores the result in D1.

export const feedbackKinds = ['idea', 'problem', 'other'] as const
export type FeedbackKind = (typeof feedbackKinds)[number]

export const limits = { message: 2000, contact: 200 } as const

export interface Feedback {
  kind: FeedbackKind
  message: string
  contact: string
}

/** A form to save, `'spam'` to accept silently and drop, or a reason to show the person. */
export type Parsed = { feedback: Feedback } | { spam: true } | { error: string }

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function parseFeedback(body: unknown): Parsed {
  if (!body || typeof body !== 'object') return { error: 'Send the form as JSON.' }
  const b = body as Record<string, unknown>
  // A field people never see: bots fill it in, people leave it empty.
  if (text(b.website)) return { spam: true }

  const kind = feedbackKinds.includes(b.kind as FeedbackKind) ? (b.kind as FeedbackKind) : 'other'
  const message = text(b.message)
  const contact = text(b.contact)
  if (message.length < 3) return { error: 'Please write a few words.' }
  if (message.length > limits.message) return { error: `Please keep it under ${limits.message} characters.` }
  if (contact.length > limits.contact) return { error: 'That contact is too long.' }
  return { feedback: { kind, message, contact } }
}

/** Created on first use, so a new database needs no migration step. */
export const createTable = `CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT ''
)`

export const insertFeedback = 'INSERT INTO feedback (kind, message, contact) VALUES (?, ?, ?)'
