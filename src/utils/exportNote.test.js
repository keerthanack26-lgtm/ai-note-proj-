import { describe, expect, it } from 'vitest'
import { buildNoteText, noteExportFilename, noteHasExportableContent } from './exportNote'

const note = {
  title: 'Q3 Plan!',
  created_at: '2026-10-17T12:00:00Z',
  transcript: 'Ship the notes app.',
  short_summary: 'A planning note.',
  detailed_summary: '',
  key_points: ['Ship the app'],
  decisions: [],
  action_items: [],
  deadlines: [],
}

describe('note export', () => {
  it('builds a safe filename', () => {
    expect(noteExportFilename(note, 'txt')).toBe('voicenote-q3-plan-2026-10-17.txt')
  })

  it('refuses an empty export and includes the transcript', () => {
    expect(noteHasExportableContent({ title: 'Empty' })).toBe(false)
    expect(() => buildNoteText({ title: 'Empty', key_points: [] })).toThrow(/nothing to export/)
    expect(buildNoteText(note)).toContain('Ship the notes app.')
  })
})
