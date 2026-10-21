import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, FileAudio, FileText, ListChecks, Mic, Upload } from 'lucide-react'
import DashboardCard from '../components/DashboardCard'
import EmptyState from '../components/EmptyState'
import ErrorMessage from '../components/ErrorMessage'
import LoadingSpinner from '../components/LoadingSpinner'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { createManualNote, getDashboard } from '../services/records'
import { errorText } from '../utils/errors'
import { formatDate, formatDuration, greetingName } from '../utils/format'

export default function DashboardPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    getDashboard(profile.id)
      .then((result) => {
        setData(result)
        setError('')
      })
      .catch((err) => setError(errorText(err, 'The dashboard could not be loaded.')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (profile?.id) load()
  }, [profile?.id])

  async function newNote() {
    try {
      const note = await createManualNote()
      navigate(`/notes/${note.id}/edit`)
    } catch (err) {
      toast.push(errorText(err), 'error')
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Hello, {greetingName(profile?.full_name)}</h1>
          <p className="lede">Your recordings, notes, and tasks in one place.</p>
        </div>
        <div className="card-actions">
          <Link className="btn btn-primary" to="/record">
            <Mic size={16} /> Record
          </Link>
          <Link className="btn btn-secondary" to="/upload">
            <Upload size={16} /> Upload
          </Link>
          <button className="btn btn-ghost" type="button" onClick={newNote}>
            New note
          </button>
        </div>
      </header>
      {loading ? <LoadingSpinner label="Loading your dashboard" /> : null}
      <ErrorMessage message={error} onRetry={load} />
      {data ? (
        <>
          <section className="stat-grid">
            <DashboardCard icon={<FileAudio size={18} />} label="Recordings" value={data.recordings} />
            <DashboardCard icon={<FileText size={18} />} label="Saved notes" value={data.notes} />
            <DashboardCard icon={<ListChecks size={18} />} label="Tasks" value={data.tasks} />
            <DashboardCard icon={<ListChecks size={18} />} label="Pending" value={data.pending} />
            <DashboardCard icon={<CheckCircle2 size={18} />} label="Completed" value={data.completed} />
          </section>
          <section className="editor-grid">
            <div className="stack">
              <h2>Recent recordings</h2>
              {data.recentAudio.length ? (
                data.recentAudio.map((item) => (
                  <article className="card" key={item.id}>
                    <strong>{item.file_name}</strong>
                    <p className="hint">
                      {item.source} · {formatDuration(item.duration_seconds)} · {formatDate(item.created_at)}
                    </p>
                  </article>
                ))
              ) : (
                <EmptyState title="No recordings yet" message="Record or upload audio to start a transcript." />
              )}
              <h2>Recent notes</h2>
              {data.recentNotes.length ? (
                data.recentNotes.map((note) => (
                  <Link className="card" key={note.id} to={`/notes/${note.id}`}>
                    <div className="meta">
                      <StatusBadge value={note.processing_status} />
                      <span>{formatDate(note.created_at)}</span>
                    </div>
                    <strong>{note.title}</strong>
                    <p className="hint">{note.short_summary || 'No summary yet.'}</p>
                  </Link>
                ))
              ) : (
                <EmptyState title="No notes yet" message="Completed transcripts and manual notes will show up here." />
              )}
            </div>
            <div className="stack">
              <h2>Upcoming deadlines</h2>
              {data.deadlines.length ? (
                data.deadlines.map((task) => (
                  <article className="card" key={task.id}>
                    <strong>{task.title}</strong>
                    <p className="hint">
                      {formatDate(task.due_date)} {task.overdue ? '· Overdue' : ''}
                    </p>
                  </article>
                ))
              ) : (
                <EmptyState title="No upcoming deadlines" message="Tasks with due dates in the next week appear here." />
              )}
              <p className="callout">Email and push reminders are not configured. Overdue and upcoming tasks are shown in the app.</p>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
