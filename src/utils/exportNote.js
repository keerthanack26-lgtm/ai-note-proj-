function listLines(items, map) {
  const rows = Array.isArray(items) ? items : []
  if (!rows.length) return ['None identified.']
  return rows.map((item, index) => `${index + 1}. ${map(item)}`)
}

export function noteHasExportableContent(note) {
  if (!note) return false
  const chunks = [
    note.transcript,
    note.short_summary,
    note.detailed_summary,
    ...(Array.isArray(note.key_points) ? note.key_points : []),
  ]
  return chunks.some((item) => String(item || '').trim())
}

export function buildNoteText(note) {
  if (!noteHasExportableContent(note)) {
    throw new Error('This note is empty, so there is nothing to export.')
  }
  const lines = [
    note.title || 'Untitled note',
    '',
    'Source and interpretation',
    'The transcript is the recorded source. Summaries, key points, decisions, and action items are AI interpretations and can be incomplete.',
    '',
    'Short summary',
    note.short_summary || 'None saved.',
    '',
    'Detailed summary',
    note.detailed_summary || 'None saved.',
    '',
    'Key points',
    ...listLines(note.key_points, (item) => String(item)),
    '',
    'Decisions',
    ...listLines(note.decisions, (item) => `${item.text || ''} (${item.confidence || 'low'} confidence)`),
    '',
    'Action items',
    ...listLines(note.action_items, (item) => {
      const due = item.due_date ? `, due ${item.due_date}` : ''
      const warning = item.warning ? ` Warning: ${item.warning}` : ''
      return `${item.title || 'Untitled'}${due}${warning}`
    }),
    '',
    'Deadlines',
    ...listLines(note.deadlines, (item) => {
      const date = item.date || 'date not identified'
      const warning = item.warning ? ` Warning: ${item.warning}` : ''
      return `${item.label || 'Deadline'}: ${date}${warning}`
    }),
    '',
    'Transcript',
    note.transcript || 'No transcript saved.',
  ]
  return lines.join('\n')
}

export function noteExportFilename(note, extension) {
  const raw = String(note?.title || 'note').toLowerCase()
  const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'note'
  const date = String(note?.created_at || '').slice(0, 10)
  return `voicenote-${slug}${date ? `-${date}` : ''}.${extension}`
}

export function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function exportNotePdf(note) {
  const text = buildNoteText(note)
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 16
  const width = doc.internal.pageSize.getWidth() - margin * 2
  let y = 18
  const write = (value, size = 11, style = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(String(value || ''), width)
    lines.forEach((line) => {
      if (y > 282) {
        doc.addPage()
        y = 18
      }
      doc.text(line, margin, y)
      y += size * 0.42 + 2.2
    })
    y += 1.5
  }
  text.split('\n').forEach((line, index) => {
    if (index === 0) write(line, 18, 'bold')
    else if (/^(Short summary|Detailed summary|Key points|Decisions|Action items|Deadlines|Transcript|Source and interpretation)$/.test(line)) {
      write(line, 13, 'bold')
    } else write(line || ' ')
  })
  doc.save(noteExportFilename(note, 'pdf'))
}
