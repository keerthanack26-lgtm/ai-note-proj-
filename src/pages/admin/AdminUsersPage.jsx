import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ConfirmationModal from '../../components/ConfirmationModal'
import DataTable from '../../components/DataTable'
import ErrorMessage from '../../components/ErrorMessage'
import LoadingSpinner from '../../components/LoadingSpinner'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import { useToast } from '../../context/ToastContext'
import { adminAction } from '../../services/admin'
import { errorText } from '../../utils/errors'
import { formatDateTime } from '../../utils/format'

export default function AdminUsersPage() {
  const toast = useToast()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') || '')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('created_at')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load(nextPage = page) {
    setLoading(true)
    setError('')
    try {
      setData(await adminAction('list-users', { query, status, sort, page: nextPage }))
    } catch (err) {
      setError(errorText(err, 'Users could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1)
    setPage(1)
  }, [status, sort])

  useEffect(() => {
    if (params.get('q')) setQuery(params.get('q') || '')
  }, [params])

  async function confirmStatus() {
    if (!pending) return
    setBusy(true)
    try {
      await adminAction('set-status', { userId: pending.id, accountStatus: pending.next })
      toast.push(`Account ${pending.next}.`, 'success')
      setPending(null)
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
        <h1>User management</h1>
        <p className="lede">Account metadata only. Private notes and recordings stay hidden.</p>
      </header>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          load(1)
        }}
      >
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" />
        <select className="select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
        </select>
        <select className="select" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="created_at">Sort by registration</option>
          <option value="name">Sort by name</option>
        </select>
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      {loading ? <LoadingSpinner label="Loading users" /> : null}
      <ErrorMessage message={error} onRetry={() => load(page)} />
      {!loading ? (
        <>
          <DataTable
            rows={data?.rows}
            columns={[
              { key: 'full_name', label: 'Name', render: (row) => <Link to={`/admin/users/${row.id}`}>{row.full_name || 'Unnamed'}</Link> },
              { key: 'email', label: 'Email' },
              { key: 'id', label: 'User ID', render: (row) => <span className="mono">{String(row.id).slice(0, 8)}…</span> },
              { key: 'account_status', label: 'Status', render: (row) => <StatusBadge value={row.account_status} /> },
              { key: 'created_at', label: 'Registered', render: (row) => formatDateTime(row.created_at) },
              { key: 'lastSignInAt', label: 'Last sign-in', render: (row) => formatDateTime(row.lastSignInAt) },
              { key: 'recordings', label: 'Recordings' },
              { key: 'notes', label: 'Notes' },
              { key: 'tasks', label: 'Tasks' },
              {
                key: 'actions',
                label: '',
                render: (row) => (
                  <button
                    className={`btn btn-small ${row.account_status === 'active' ? 'btn-danger' : 'btn-secondary'}`}
                    type="button"
                    onClick={() => setPending({ id: row.id, next: row.account_status === 'active' ? 'deactivated' : 'active', email: row.email })}
                  >
                    {row.account_status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                ),
              },
            ]}
          />
          {data ? <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onPage={(next) => { setPage(next); load(next) }} /> : null}
        </>
      ) : null}
      <ConfirmationModal
        open={Boolean(pending)}
        title={pending?.next === 'deactivated' ? 'Deactivate account?' : 'Activate account?'}
        message={pending?.next === 'deactivated'
          ? `Deactivate ${pending?.email}? Their sessions are banned until you activate them again.`
          : `Activate ${pending?.email}? Access is restored after the ban is cleared.`}
        confirmLabel={pending?.next === 'deactivated' ? 'Deactivate' : 'Activate'}
        danger={pending?.next === 'deactivated'}
        busy={busy}
        onConfirm={confirmStatus}
        onClose={() => setPending(null)}
      />
    </div>
  )
}
