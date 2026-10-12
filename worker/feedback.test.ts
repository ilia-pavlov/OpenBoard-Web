import { describe, expect, it } from 'vitest'
import { limits, parseFeedback } from './feedback'

describe('parseFeedback', () => {
  it('keeps the kind, message and contact, trimmed', () => {
    expect(parseFeedback({ kind: 'idea', message: '  Add blitz ratings to My Card  ', contact: ' mom@example.com ' })).toEqual({
      feedback: { kind: 'idea', message: 'Add blitz ratings to My Card', contact: 'mom@example.com' },
    })
  })

  it('files an unknown kind under other, and contact is optional', () => {
    expect(parseFeedback({ kind: 'hack', message: 'Love it' })).toEqual({ feedback: { kind: 'other', message: 'Love it', contact: '' } })
  })

  it('turns away empty, too long and malformed forms', () => {
    expect(parseFeedback({ message: '  ' })).toHaveProperty('error')
    expect(parseFeedback({ message: 'x'.repeat(limits.message + 1) })).toHaveProperty('error')
    expect(parseFeedback({ message: 'Hello', contact: 'x'.repeat(limits.contact + 1) })).toHaveProperty('error')
    expect(parseFeedback(null)).toHaveProperty('error')
    expect(parseFeedback('hello')).toHaveProperty('error')
  })

  it('drops forms that fill in the hidden field', () => {
    expect(parseFeedback({ message: 'Buy now', website: 'http://spam.example' })).toEqual({ spam: true })
  })
})
