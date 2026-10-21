import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmationModal from '../../components/ConfirmationModal'
import DataTable from '../../components/DataTable'
import ErrorMessage from '../../components/ErrorMessage'
import FilterControls from '../../components/FilterControls'
import LoadingSpinner from '../../components/LoadingSpinner'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import { useToast } from '../../context/ToastContext'
import { adminAction } from '../../services/admin'
import { errorText } from '../../utils/errors'
import { formatDateTime, formatDuration } from '../../utils/format'

export default function AdminJobsPage() {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retryJob, setRetryJob] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load(nextPage = page) {
    setLoading(true)
    setError('')
    try {
      setData(await adminAction('list-jobs', { query, status, from, to, page: nextPage }))
    } catch (err) {
      setError(errorText(err, 'Jobs could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1)
    setPage(1)
  }, [status])

  async function confirmRetry() {
    if (!retryJob) return
    setBusy(true)
    try {
      const result = await adminAction('retry-job', { jobId: retryJob.id })
      toast.push(`Retry queued as ${result.jobId}.`, 'success')
      setRetryJob(null)
      await load(page)
    } catch (err) {
      toast.push(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header>
        <h1>Processing jobs</h1>
        <p className="lede">Operational job metadata only. Transcripts and note text are not shown.</p>
      </header>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          load(1)
        }}
      >
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Job ID or user ID" />
        <button className="btn btn-primary" type="submit">Search</button>
        <button className="btn btn-ghost" type="button" onClick={() => load(page)}>Refresh</button>
      </form>
      <FilterControls
        filters={[
          {
            label: 'Status',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'all', label: 'All' },
              { value: 'queued', label: 'Pending' },
              { value: 'processing', label: 'Processing' },
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
            ],
          },
          { label: 'From', type: 'date', value: from, onChange: setFrom },
          { label: 'To', type: 'date', value: to, onChange: setTo },
        ]}
      />
      {loading ? <LoadingSpinner label="Loading jobs" /> : null}
      <ErrorMessage message={error} onRetry={() => load(page)} />
      {!loading ? (
        <>
          <DataTable
            rows={data?.rows}
            columns={[
              { key: 'id', label: 'Job', render: (row) => <Link to={`/admin/jobs/${row.id}`}>{String(row.id).slice(0, 8)}…</Link> },
              { key: 'user_id', label: 'User', render: (row) => <span className="mono">{String(row.user_id).slice(0, 8)}…</span> },
              { key: 'fileName', label: 'Audio file', render: (row) => row.fileName || '—' },
              { key: 'created_at', label: 'Created', render: (row) => formatDateTime(row.created_at) },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { key: 'current_stage', label: 'Stage', render: (row) => String(row.current_stage || '').replaceAll('_', ' ') },
              { key: 'retry_count', label: 'Retries' },
              { key: 'completed_at', label: 'Completed', render: (row) => formatDateTime(row.completed_at) },
              { key: 'error_code', label: 'Error', render: (row) => row.error_code || '—' },
              {
                key: 'durationMs',
                label: 'Duration',
                render: (row) => (row.durationMs != null ? formatDuration(row.durationMs / 1000) : '—'),
              },
              {
                key: 'actions',
                label: '',
                render: (row) => (row.status === 'failed' ? (
                  <button className="btn btn-secondary btn-small" type="button" onClick={() => setRetryJob(row)}>Retry</button>
                ) : row.overdue ? <span className="hint">Overdue</span> : null),
              },
            ]}
          />
          {data ? <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onPage={(next) => { setPage(next); load(next) }} /> : null}
        </>
      ) : null}
      <ConfirmationModal
        open={Boolean(retryJob)}
        title="Retry failed job?"
        message="A new queued job is created for the same audio file. Success is only confirmed after the backend accepts the retry."
        confirmLabel="Queue retry"
        busy={busy}
        onConfirm={confirmRetry}
        onClose={() => setRetryJob(null)}
      />
    </div>
  )
}
