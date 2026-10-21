import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ConfirmationModal from '../components/ConfirmationModal'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import Pagination from '../components/Pagination'
import StatusBadge from '../components/StatusBadge'
import { useToast } from '../context/ToastContext'
import { createRetryJob, deleteRecording, ensureTranscribeLanguage, listAudioHistory } from '../services/records'
import { errorText } from '../utils/errors'
import { formatDateTime, formatDuration } from '../utils/format'

function latestJob(jobs) {
  const list = Array.isArray(jobs) ? jobs : jobs ? [jobs] : []
  return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
}

function firstNote(notes) {
  if (Array.isArray(notes)) return notes[0]
  return notes || null
}

export default function HistoryPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(null)
  const [deleteNoteToo, setDeleteNoteToo] = useState(true)
  const [busy, setBusy] = useState(false)

  function load(nextPage = page) {
    setLoading(true)
    listAudioHistory(nextPage)
      .then((data) => {
        setResult(data)
        setError('')
      })
      .catch((err) => setError(errorText(err, 'Audio history could not be loaded.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1)
  }, [])

  async function retry(job, audio) {
    try {
      await ensureTranscribeLanguage()
      const next = await createRetryJob(audio.id)
      navigate(`/processing/${next.id}`)
    } catch (err) {
      toast.push(errorText(err, 'The retry failed.'), 'error')
    }
  }

  async function confirmDelete() {
    setBusy(true)
    try {
      await deleteRecording(pending, { deleteNote: deleteNoteToo })
      setPending(null)
      toast.push('Recording deleted.', 'success')
      load(page)
    } catch (err) {
      toast.push(errorText(err, 'The recording could not be deleted.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Audio history</h1>
        <p className="lede">Previous recordings and uploads, with their processing status.</p>
      </header>
      {loading ? <LoadingSpinner label="Loading history" /> : null}
      <ErrorMessage message={error} onRetry={() => load(page)} />
      {!loading && result && !result.rows.length ? <EmptyState title="No audio yet" message="Record or upload audio to see it here." /> : null}
      <div className="list">
        {result?.rows.map((audio) => {
          const job = latestJob(audio.processing_jobs)
          const note = firstNote(audio.notes)
          return (
            <article className="card" key={audio.id}>
              <div className="page-header">
                <div>
                  <h2>{audio.file_name}</h2>
                  <p className="hint">
                    {audio.source} · {formatDuration(audio.duration_seconds)} · {formatDateTime(audio.created_at)}
                  </p>
                </div>
                <StatusBadge value={job?.status || 'queued'} />
              </div>
              {job?.error_message ? <p className="form-error">{job.error_message}</p> : null}
              <div className="card-actions">
                {note ? (
                  <Link className="btn btn-primary btn-small" to={`/notes/${note.id}`}>
                    Open note
                  </Link>
                ) : null}
                {job ? (
                  <Link className="btn btn-ghost btn-small" to={`/processing/${job.id}`}>
                    Processing
                  </Link>
                ) : null}
                {job?.status === 'failed' ? (
                  <button className="btn btn-secondary btn-small" type="button" onClick={() => retry(job, audio)}>
                    Retry
                  </button>
                ) : null}
                <button
                  className="btn btn-danger btn-small"
                  type="button"
                  onClick={() => {
                    setDeleteNoteToo(Boolean(note))
                    setPending(audio)
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          )
        })}
      </div>
      {result ? (
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          count={result.count}
          onPage={(next) => {
            setPage(next)
            load(next)
          }}
        />
      ) : null}
      <ConfirmationModal
        open={Boolean(pending)}
        title="Delete this recording?"
        message={
          deleteNoteToo
            ? 'This deletes the audio file, its processing job, and the associated note.'
            : 'This deletes the audio file and processing job. The note text stays without audio.'
        }
        confirmLabel="Delete recording"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setPending(null)}
      >
        <label className="meta">
          <input type="checkbox" checked={deleteNoteToo} onChange={(event) => setDeleteNoteToo(event.target.checked)} />
          Also delete the associated note
        </label>
      </ConfirmationModal>
    </div>
  )
}
