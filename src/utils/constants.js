export const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'lecture', label: 'Lecture' },
  { value: 'interview', label: 'Interview' },
  { value: 'idea', label: 'Idea' },
  { value: 'personal', label: 'Personal' },
]

export const PROCESSING_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

export const TASK_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
]

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export const PROCESS_STAGES = [
  { id: 'uploading', label: 'Uploading audio' },
  { id: 'preparing', label: 'Preparing audio' },
  { id: 'transcribing', label: 'Transcribing speech' },
  { id: 'generating_notes', label: 'Generating AI notes' },
  { id: 'extracting_actions', label: 'Extracting action items' },
  { id: 'saving', label: 'Saving results' },
  { id: 'completed', label: 'Completed' },
]

export const SUMMARY_STYLES = [
  { value: 'concise', label: 'Concise' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'detailed', label: 'Detailed' },
]

export const LANGUAGE_HINTS = {
  en: 'en-US',
  es: 'es-US',
  fr: 'fr-FR',
  de: 'de-DE',
  hi: 'hi-IN',
  pt: 'pt-BR',
}

export const LANGUAGES = [
  { value: 'en-US', label: 'English' },
  { value: 'es-US', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'pt-BR', label: 'Portuguese' },
]

export function geminiPreferenceLanguage(value) {
  const raw = String(value || '').trim()
  if (LANGUAGE_HINTS[raw]) return LANGUAGE_HINTS[raw]
  if (/^[a-z]{2}-[A-Za-z]{2}$/.test(raw)) return raw
  return 'en-US'
}

export const PAGE_SIZE = 9

export const SUGGESTED_QUESTIONS = [
  'What are the main points?',
  'What tasks were discussed?',
  'What deadlines were mentioned?',
  'Summarize this in five bullet points.',
]
