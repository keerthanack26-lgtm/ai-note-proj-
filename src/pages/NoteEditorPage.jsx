import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmationModal from '../components/ConfirmationModal'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import SummaryCard from '../components/SummaryCard'
import TranscriptViewer from '../components/TranscriptViewer'
import { useToast } from '../context/ToastContext'
import { invokeFunction } from '../services/api'
import { getSignedAudioUrl } from '../services/audio'
import { createTasksFromItems, deleteNote, getNote, updateNote } from '../services/records'
import { CATEGORIES } from '../utils/constants'
import { errorText } from '../utils/errors'
import { buildNoteText, downloadTextFile, exportNotePdf, noteExportFilename } from '../utils/exportNote'
const EMPTY = {
  title: '',
  transcript: '',
  short_summary: '',
  detailed_summary: '',
  key_points: [],
  decisions: [],
  action_items: [],
  deadlines: [],
  language: '',
  category: 'general',
  segments: [],
  speaker_labels_supported: false,
}

function linesToList(value) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean)
}

export default function NoteEditorPage() {
  const { noteId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [note, setNote] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [audioUrl, setAudioUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await getNote(noteId)
      setNote(data)
      setForm({
        ...EMPTY,
        ...data,
        key_points: data.key_points || [],
        decisions: data.decisions || [],
        action_items: data.action_items || [],
        deadlines: data.deadlines || [],
        segments: data.segments || [],
      })
      if (data.audio_files?.storage_path && !data.audio_files.removed_at) {
        setAudioUrl(await getSignedAudioUrl(data.audio_files.storage_path))
      }
      setError('')
    } catch (err) {
      setError(errorText(err, 'This note could not be opened.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [noteId])

  function patch(partial) {
    setForm((current) => ({ ...current, ...partial }))
  }

  async function save() {
    setBusy(true)
    try {
      const saved = await updateNote(noteId, {
        ...form,
        processing_status: form.transcript.trim() || form.short_summary.trim() ? 'completed' : 'draft',
      })
      setNote(saved)
      toast.push('Note saved.', 'success')
      return saved
    } catch (err) {
      toast.push(errorText(err, 'The note could not be saved.'), 'error')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text || '')
      toast.push('Copied.', 'success')
    } catch {
      toast.push('Copy failed in this browser.', 'error')
    }
  }

  async function exportAs(kind) {
    try {
      if (kind === 'pdf') await exportNotePdf(form)
      else downloadTextFile(noteExportFilename(form, 'txt'), buildNoteText(form))
    } catch (err) {
      toast.push(errorText(err, 'The export failed.'), 'error')
    }
  }

  async function regenerate() {
    setBusy(true)
    try {
      await updateNote(noteId, form)
      await invokeFunction('process-audio', { noteId, regenerate: true })
      setConfirmRegen(false)
      toast.push('Summary regenerated from the saved transcript.', 'success')
      await load()
    } catch (err) {
      toast.push(errorText(err, 'Regeneration failed.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function addTasks() {
    try {
      const created = await createTasksFromItems(noteId, form.action_items || [])
      toast.push(created.length ? `${created.length} task(s) added.` : 'No action items to add.', created.length ? 'success' : 'info')
    } catch (err) {
      toast.push(errorText(err), 'error')
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await deleteNote(noteId)
      navigate('/notes')
    } catch (err) {
      toast.push(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingSpinner label="Loading note" />

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Note editor</h1>
          <p className="lede">Transcript text is the source. Summaries and tasks are AI interpretations unless you edit them.</p>
        </div>
        <div className="card-actions">
          <Link className="btn btn-ghost" to={`/notes/${noteId}`}>
            Chat
          </Link>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={save}>
            Save
          </button>
        </div>
      </header>
      <ErrorMessage message={error} onRetry={load} />
      {note ? (
        <>
          <div className="callout">The current speech provider does not label speakers. Timestamps are shown only when the transcript includes segments.</div>
          {audioUrl ? <audio className="player" controls src={audioUrl} /> : <p className="hint">No audio is attached to this note.</p>}
          <label className="field">
            <span>Title</span>
            <input className="input" value={form.title} onChange={(event) => patch({ title: event.target.value })} />
          </label>
          <label className="field">
            <span>Category</span>
            <select className="select" value={form.category} onChange={(event) => patch({ category: event.target.value })}>
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <SummaryCard title="Transcript" actions={<button className="btn btn-ghost btn-small" type="button" onClick={() => copy(form.transcript)}>Copy</button>}>
            <TranscriptViewer transcript={form.transcript} segments={form.segments} onChange={(transcript) => patch({ transcript })} />
          </SummaryCard>
          <div className="editor-grid">
            <SummaryCard title="Short summary" actions={<button className="btn btn-ghost btn-small" type="button" onClick={() => copy(form.short_summary)}>Copy</button>}>
              <textarea className="textarea" value={form.short_summary} onChange={(event) => patch({ short_summary: event.target.value })} />
            </SummaryCard>
            <SummaryCard title="Detailed summary">
              <textarea className="textarea" value={form.detailed_summary} onChange={(event) => patch({ detailed_summary: event.target.value })} />
            </SummaryCard>
          </div>
          <SummaryCard title="Key points">
            <textarea className="textarea" value={(form.key_points || []).join('\n')} onChange={(event) => patch({ key_points: linesToList(event.target.value) })} />
          </SummaryCard>
          <SummaryCard title="Decisions">
            {(form.decisions || []).length ? (
              form.decisions.map((item, index) => (
                <p key={`${item.text}-${index}`}>
                  {item.text} <span className="badge">{item.confidence || 'low'} confidence</span>
                </p>
              ))
            ) : (
              <p className="hint">No decisions were identified.</p>
            )}
          </SummaryCard>
          <SummaryCard title="Action items" actions={<button className="btn btn-secondary btn-small" type="button" onClick={addTasks}>Add as tasks</button>}>
            {(form.action_items || []).length ? (
              form.action_items.map((item, index) => (
                <article key={`action-${index}`} className="stack">
                  <input
                    className="input"
                    aria-label={`Action item ${index + 1}`}
                    value={item.title}
                    onChange={(event) => {
                      const action_items = form.action_items.map((entry, entryIndex) => (
                        entryIndex === index ? { ...entry, title: event.target.value } : entry
                      ))
                      patch({ action_items })
                    }}
                  />
                  <textarea
                    className="textarea"
                    aria-label={`Action item ${index + 1} description`}
                    value={item.description || ''}
                    onChange={(event) => {
                      const action_items = form.action_items.map((entry, entryIndex) => (
                        entryIndex === index ? { ...entry, description: event.target.value } : entry
                      ))
                      patch({ action_items })
                    }}
                  />
                  {item.confidence !== 'high' || item.warning ? (
                    <p className="callout callout-warning">{item.warning || 'The AI could not confidently identify this action item.'}</p>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="hint">No action items were identified.</p>
            )}
          </SummaryCard>
          <SummaryCard title="Deadlines">
            {(form.deadlines || []).length ? (
              form.deadlines.map((item, index) => (
                <article key={`${item.label}-${index}`}>
                  <strong>{item.label || 'Deadline'}</strong>
                  <p>{item.date || 'No explicit date was kept.'}</p>
                  {item.confidence !== 'high' || !item.date ? (
                    <p className="callout callout-warning">{item.warning || 'The AI could not confidently identify this deadline.'}</p>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="hint">No deadlines were identified.</p>
            )}
          </SummaryCard>
          <div className="card-actions">
            <button className="btn btn-ghost" type="button" onClick={() => exportAs('txt')}>
              Export TXT
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => exportAs('pdf')}>
              Export PDF
            </button>
            <button className="btn btn-secondary" type="button" disabled={busy || !form.transcript.trim()} onClick={() => setConfirmRegen(true)}>
              Regenerate summary
            </button>
            <button className="btn btn-danger" type="button" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          </div>
        </>
      ) : null}
      <ConfirmationModal
        open={confirmDelete}
        title="Delete this note?"
        message="This removes the note and its chat. Audio in history is kept."
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
      <ConfirmationModal
        open={confirmRegen}
        title="Regenerate AI notes?"
        message="This replaces the summary, key points, decisions, action items, and deadlines using the saved transcript. It does not invent a successful result if the model fails."
        confirmLabel="Regenerate"
        busy={busy}
        onConfirm={regenerate}
        onClose={() => setConfirmRegen(false)}
      />
    </div>
  )
}
