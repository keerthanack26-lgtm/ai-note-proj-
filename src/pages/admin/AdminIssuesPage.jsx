import { useEffect, useState } from 'react'
import DataTable from '../../components/DataTable'
import ErrorMessage from '../../components/ErrorMessage'
import FilterControls from '../../components/FilterControls'
import LoadingSpinner from '../../components/LoadingSpinner'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import { useToast } from '../../context/ToastContext'
import { adminAction, issueStatusLabel } from '../../services/admin'
import { errorText } from '../../utils/errors'
import { formatDateTime } from '../../utils/format'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Closed' },
]

export default function AdminIssuesPage() {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [notes, setNotes] = useState('')
  const [nextStatus, setNextStatus] = useState('open')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function load(nextPage = page) {
    setLoading(true)
    setError('')
    try {
      setData(await adminAction('list-issues', { query, status, from, to, page: nextPage }))
    } catch (err) {
      setError(errorText(err, 'Issues could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1)
    setPage(1)
  }, [status])

  function openIssue(issue) {
    setSelected(issue)
    setNotes(issue.admin_notes || '')
    setNextStatus(issue.status)
  }

  async function saveIssue(event) {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    try {
      const updated = await adminAction('update-issue', {
        issueId: selected.id,
        status: nextStatus,
        adminNotes: notes,
      })
      toast.push('Issue updated.', 'success')
      setSelected({ ...selected, ...updated, admin_notes: updated.admin_notes ?? notes })
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
        <h1>Reported issues</h1>
        <p className="lede">Review reports without opening private notes or recordings.</p>
      </header>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          load(1)
        }}
      >
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subject or description" />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      <FilterControls
        filters={[
          { label: 'Status', value: status, onChange: setStatus, options: STATUS_OPTIONS },
          { label: 'From', type: 'date', value: from, onChange: setFrom },
          { label: 'To', type: 'date', value: to, onChange: setTo },
        ]}
      />
      {loading ? <LoadingSpinner label="Loading issues" /> : null}
      <ErrorMessage message={error} onRetry={() => load(page)} />
      <div className="admin-grid-2">
        {!loading ? (
          <DataTable
            rows={data?.rows}
            columns={[
              { key: 'id', label: 'Issue', render: (row) => <button className="btn btn-ghost btn-small" type="button" onClick={() => openIssue(row)}>{String(row.id).slice(0, 8)}…</button> },
              { key: 'subject', label: 'Subject' },
              { key: 'user_id', label: 'User', render: (row) => <span className="mono">{row.user_id ? `${String(row.user_id).slice(0, 8)}…` : '—'}</span> },
              { key: 'created_at', label: 'Created', render: (row) => formatDateTime(row.created_at) },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { key: 'updated_at', label: 'Updated', render: (row) => formatDateTime(row.updated_at) },
            ]}
          />
        ) : <div />}
        {selected ? (
          <form className="card stack" onSubmit={saveIssue}>
            <h2>{selected.subject}</h2>
            <p className="hint">{issueStatusLabel(selected.status)} · {formatDateTime(selected.created_at)}</p>
            <p>{selected.description}</p>
            <p className="hint">Reporter: {selected.profiles?.email || selected.user_id || 'Unknown'}</p>
            <label className="field">
              <span>Status</span>
              <select className="select" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                {STATUS_OPTIONS.filter((item) => item.value !== 'all').map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Resolution notes</span>
              <textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save issue'}</button>
          </form>
        ) : (
          <article className="card"><p className="hint">Select an issue to review details.</p></article>
        )}
      </div>
      {data ? <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onPage={(next) => { setPage(next); load(next) }} /> : null}
    </div>
  )
}
