import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AnalyticsChart from '../../components/AnalyticsChart'
import ErrorMessage from '../../components/ErrorMessage'
import LoadingSpinner from '../../components/LoadingSpinner'
import SlideLetters from '../../components/SlideLetters'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import { adminAction } from '../../services/admin'
import { errorText } from '../../utils/errors'
import { formatBytes, formatDateTime } from '../../utils/format'

export default function AdminOverviewPage() {
  const [data, setData] = useState(null)
  const [charts, setCharts] = useState(null)
  const [range, setRange] = useState('30d')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load(nextRange = range) {
    setLoading(true)
    setError('')
    try {
      const [overview, analytics] = await Promise.all([
        adminAction('overview', { range: nextRange }),
        adminAction('analytics', { range: nextRange }),
      ])
      setData(overview)
      setCharts(analytics)
    } catch (err) {
      setError(errorText(err, 'Admin overview could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(range)
  }, [range])

  if (loading && !data) return <LoadingSpinner label="Loading admin dashboard" large />

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <SlideLetters as="h1" text="Admin dashboard" />
          <p className="lede">Live counts from the database. Private notes, transcripts, chat, and audio content are not shown.</p>
        </div>
        <select className="select" value={range} onChange={(event) => setRange(event.target.value)}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </header>
      <ErrorMessage message={error} onRetry={() => load(range)} />
      {data ? (
        <>
          <div className="stat-grid">
            <StatCard label="Registered users" value={data.users} />
            <StatCard label="Active accounts" value={data.activeUsers} />
            <StatCard label="Deactivated" value={data.deactivatedUsers} />
            <StatCard label="Recordings" value={data.recordings} />
            <StatCard label="Processing jobs" value={data.jobs?.total} />
            <StatCard label="Completed jobs" value={data.jobs?.completed} />
            <StatCard label="Failed jobs" value={data.jobs?.failed} />
            <StatCard label="Processing now" value={data.jobs?.processing} />
            <StatCard label="Saved notes" value={data.notes} />
            <StatCard label="Tasks" value={data.tasks} />
            <StatCard label="AI successes" value={data.ai?.success} hint={`Period: ${data.ai?.period || range}`} />
            <StatCard label="Open issues" value={data.openIssues} />
            <StatCard label="Storage used" value={formatBytes(data.storageBytes)} />
          </div>
          <div className="admin-grid-2">
            <AnalyticsChart
              title="Registrations"
              series={charts?.registrations || []}
              lines={[{ key: 'count', color: '#1769E8', label: 'Users' }]}
            />
            <AnalyticsChart
              title="Processing activity"
              series={charts?.processing || []}
              lines={[
                { key: 'completed', color: '#1f8a4c', label: 'Completed' },
                { key: 'failed', color: '#c0392b', label: 'Failed' },
              ]}
            />
          </div>
          <section className="card stack">
            <div className="page-header">
              <h2>Recent activity</h2>
              <Link className="btn btn-ghost btn-small" to="/admin/audit-logs">Audit logs</Link>
            </div>
            <div className="list">
              {(data.recent || []).map((item) => (
                <div className="meta-row" key={item.id}>
                  <StatusBadge value={item.status} />
                  <span>{item.label}</span>
                  <span className="hint">{formatDateTime(item.at)}</span>
                </div>
              ))}
              {!data.recent?.length ? <p className="hint">No recent events yet.</p> : null}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
