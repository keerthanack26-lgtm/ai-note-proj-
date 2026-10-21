import { useEffect, useState } from 'react'
import DataTable from '../../components/DataTable'
import ErrorMessage from '../../components/ErrorMessage'
import FilterControls from '../../components/FilterControls'
import LoadingSpinner from '../../components/LoadingSpinner'
import Pagination from '../../components/Pagination'
import StatusBadge from '../../components/StatusBadge'
import { adminAction } from '../../services/admin'
import { errorText } from '../../utils/errors'
import { formatDateTime } from '../../utils/format'

export default function AdminAuditLogsPage() {
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load(nextPage = page) {
    setLoading(true)
    setError('')
    try {
      setData(await adminAction('list-audit', { query, from, to, page: nextPage }))
    } catch (err) {
      setError(errorText(err, 'Audit logs could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1)
  }, [])

  return (
    <div className="page">
      <header>
        <h1>Admin audit logs</h1>
        <p className="lede">Server-written administrative actions. These rows cannot be edited from the browser.</p>
      </header>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          load(1)
        }}
      >
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search action or resource" />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      <FilterControls
        filters={[
          { label: 'From', type: 'date', value: from, onChange: setFrom },
          { label: 'To', type: 'date', value: to, onChange: setTo },
        ]}
      />
      {data?.setupRequired ? (
        <ErrorMessage message="Run the admin panel SQL in the Supabase SQL editor to create admin_audit_logs." />
      ) : null}
      {loading ? <LoadingSpinner label="Loading audit logs" /> : null}
      <ErrorMessage message={error} onRetry={() => load(page)} />
      {!loading ? (
        <>
          <DataTable
            rows={data?.rows}
            emptyMessage="No audit events yet, or the audit table is not installed."
            columns={[
              { key: 'created_at', label: 'When', render: (row) => formatDateTime(row.created_at) },
              { key: 'admin', label: 'Admin', render: (row) => row.profiles?.email || String(row.admin_user_id).slice(0, 8) },
              { key: 'action_type', label: 'Action' },
              { key: 'resource_type', label: 'Resource' },
              { key: 'resource_id', label: 'Resource ID', render: (row) => <span className="mono">{row.resource_id || '—'}</span> },
              { key: 'result', label: 'Result', render: (row) => <StatusBadge value={row.result} /> },
            ]}
          />
          {data ? <Pagination page={data.page} pageSize={data.pageSize} count={data.count} onPage={(next) => { setPage(next); load(next) }} /> : null}
        </>
      ) : null}
    </div>
  )
}
