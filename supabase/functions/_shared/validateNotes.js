const CONFIDENCE = new Set(['high', 'low'])
const PRIORITY = new Set(['low', 'medium', 'high'])
const DATE = /^\d{4}-\d{2}-\d{2}$/

function text(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max)
}

function asArray(value, errors, label) {
  if (value == null) return []
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`)
    return []
  }
  return value.slice(0, 30)
}

export function validateAiNotes(input) {
  const errors = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Response was not an object'] }
  }
  const title = text(input.title, 160)
  const shortSummary = text(input.short_summary, 800)
  const detailedSummary = text(input.detailed_summary, 6000)
  if (!title) errors.push('Missing title')
  if (!shortSummary) errors.push('Missing short summary')

  const keyPoints = asArray(input.key_points, errors, 'key_points')
    .map((item) => text(item, 400))
    .filter(Boolean)
  const decisions = asArray(input.decisions, errors, 'decisions').map((item, index) => {
    const line = text(item?.text, 500)
    if (!line) errors.push(`decisions[${index}] missing text`)
    return { text: line, confidence: CONFIDENCE.has(item?.confidence) ? item.confidence : 'low' }
  }).filter((item) => item.text)
  const actionItems = asArray(input.action_items, errors, 'action_items').map((item, index) => {
    const itemTitle = text(item?.title, 200)
    if (!itemTitle) errors.push(`action_items[${index}] missing title`)
    const due = item?.due_date == null || item.due_date === '' ? null : text(item.due_date, 20)
    return {
      title: itemTitle,
      description: text(item?.description, 800),
      priority: PRIORITY.has(item?.priority) ? item.priority : 'medium',
      due_date: due && DATE.test(due) ? due : null,
      confidence: CONFIDENCE.has(item?.confidence) ? item.confidence : 'low',
      evidence: text(item?.evidence, 400),
    }
  }).filter((item) => item.title)
  const deadlines = asArray(input.deadlines, errors, 'deadlines').map((item) => {
    const date = item?.date == null || item.date === '' ? null : text(item.date, 20)
    return {
      label: text(item?.label, 200) || 'Deadline',
      date: date && DATE.test(date) ? date : null,
      confidence: CONFIDENCE.has(item?.confidence) ? item.confidence : 'low',
      evidence: text(item?.evidence, 400),
    }
  })

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      title,
      short_summary: shortSummary,
      detailed_summary: detailedSummary,
      key_points: keyPoints,
      decisions,
      action_items: actionItems,
      deadlines,
      language: text(input.language, 40) || null,
    },
  }
}

function compact(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function groundExtractions(note, transcript) {
  const source = compact(transcript)
  const deadlines = (note.deadlines || []).map((item) => {
    const evidence = compact(item.evidence)
    const evidenceOk = evidence.length > 8 && source.includes(evidence)
    if (!evidenceOk || item.confidence !== 'high' || !item.date) {
      return {
        ...item,
        date: null,
        confidence: 'low',
        warning: 'This deadline was not confidently identified in the transcript.',
      }
    }
    return { ...item, warning: null }
  })
  const actionItems = (note.action_items || []).map((item) => {
    const evidence = compact(item.evidence)
    const evidenceOk = evidence.length > 8 && source.includes(evidence)
    const dueDate = item.confidence === 'high' && evidenceOk ? item.due_date : null
    const warning = item.confidence === 'high' && evidenceOk
      ? null
      : 'This action item was not confidently identified. Review it before relying on it.'
    return { ...item, due_date: dueDate, warning }
  })
  return { ...note, deadlines, action_items: actionItems }
}

export function validateChatAnswer(input) {
  if (!input || typeof input !== 'object' || !text(input.answer, 4000)) {
    return { ok: false, errors: ['Missing answer'] }
  }
  return {
    ok: true,
    value: {
      answer: text(input.answer, 4000),
      grounded: input.grounded !== false,
      missing_information: Boolean(input.missing_information),
    },
  }
}
