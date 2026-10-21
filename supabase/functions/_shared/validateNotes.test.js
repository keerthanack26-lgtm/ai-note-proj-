import { describe, expect, it } from 'vitest'
import { groundExtractions, validateAiNotes, validateChatAnswer } from './validateNotes.js'

const transcript = 'Please send the revised budget by Friday the 20th. Alex agreed to review it.'

describe('AI note validation', () => {
  it('rejects a response that is missing required fields', () => {
    expect(validateAiNotes({ short_summary: 'Only a summary' }).ok).toBe(false)
    expect(validateAiNotes([]).ok).toBe(false)
  })

  it('keeps an explicit deadline and drops an unsupported date', () => {
    const validated = validateAiNotes({
      title: 'Budget review',
      short_summary: 'Alex will review the budget.',
      detailed_summary: 'The recording asks for a revised budget.',
      key_points: ['Send the revised budget'],
      decisions: [{ text: 'Alex agreed to review it', confidence: 'high' }],
      action_items: [{
        title: 'Send the revised budget',
        description: 'Send it before the mentioned day',
        priority: 'high',
        due_date: '2026-10-20',
        confidence: 'high',
        evidence: 'send the revised budget by Friday the 20th',
      }],
      deadlines: [
        { label: 'Budget', date: '2026-10-20', confidence: 'high', evidence: 'by Friday the 20th' },
        { label: 'Invented', date: '2026-11-01', confidence: 'high', evidence: 'next quarter launch party' },
      ],
      language: 'english',
    })
    expect(validated.ok).toBe(true)
    const grounded = groundExtractions(validated.value, transcript)
    expect(grounded.deadlines[0].date).toBe('2026-10-20')
    expect(grounded.deadlines[1].date).toBeNull()
    expect(grounded.deadlines[1].warning).toMatch(/not confidently identified/)
    expect(grounded.action_items[0].due_date).toBe('2026-10-20')
  })

  it('requires a chat answer', () => {
    expect(validateChatAnswer({ answer: 'The note does not mention a venue.', missing_information: true }).ok).toBe(true)
    expect(validateChatAnswer({ answer: '   ' }).ok).toBe(false)
  })
})
