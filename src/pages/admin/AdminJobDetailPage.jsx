import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ConfirmationModal from '../../components/ConfirmationModal'
import ErrorMessage from '../../components/ErrorMessage'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import { useToast } from '../../context/ToastContext'
import { adminAction } from '../../services/admin'
import { errorText } from '../../utils/errors'
import { formatBytes, formatDateTime, formatDuration } from '../../utils/format'

export default function AdminJobDetailPage() {
  const { jobId } = useParams()
  const toast = useToast()
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setJob(await adminAction('get-job', { jobId }))
    } catch (err) {
      setError(errorText(err, 'This job could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [jobId])

  async function retry() {
    setBusy(true)
    try {
      const result = await adminAction('retry-job', { jobId })
      toast.push(`Retry queued as ${result.jobId}.`, 'success')
      setConfirm(false)
      await load()
    } catch (err) {
      toast.push(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingSpinner label="Loading job" large />

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Link className="hint" to="/admin/jobs">← Jobs</Link>
          <h1>Job details</h1>
          <p className="lede">Sanitized operational fields only.</p>
        </div>
        {job?.status === 'failed' ? (
          <button className="btn btn-secondary" type="button" onClick={() => setConfirm(true)}>Retry job</button>
        ) : null}
      </header>
      <ErrorMessage message={error} onRetry={load} />
      {job ? (
        <article className="card stack">
          <p><strong>Job ID:</strong> <span className="mono">{job.id}</span></p>
          <p><strong>User ID:</strong> <span className="mono">{job.user_id}</span></p>
          <p><strong>Account:</strong> {job.profiles?.email || '—'}</p>
          <p><strong>Audio file:</strong> {job.fileName || '—'}</p>
          <p><strong>MIME:</strong> {job.audio_files?.mime_type || '—'}</p>
          <p><strong>Size:</strong> {formatBytes(job.audio_files?.file_size)}</p>
          <p><strong>Status:</strong> <StatusBadge value={job.status} /></p>
          <p><strong>Stage:</strong> {String(job.current_stage || '').replaceAll('_', ' ')}</p>
          <p><strong>Retries:</strong> {job.retry_count}</p>
          <p><strong>Created:</strong> {formatDateTime(job.created_at)}</p>
          <p><strong>Completed:</strong> {formatDateTime(job.completed_at)}</p>
          <p><strong>Duration:</strong> {job.durationMs != null ? formatDuration(job.durationMs / 1000) : '—'}</p>
          <p><strong>Error code:</strong> {job.error_code || '—'}</p>
          <p><strong>Error message:</strong> {job.error_message || '—'}</p>
        </article>
      ) : null}
      <ConfirmationModal
        open={confirm}
        title="Retry this job?"
        message="A new queued job will be created for the same audio file."
        confirmLabel="Queue retry"
        busy={busy}
        onConfirm={retry}
        onClose={() => setConfirm(false)}
      />
    </div>
  )
}
