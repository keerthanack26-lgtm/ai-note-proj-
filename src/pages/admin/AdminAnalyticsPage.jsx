import { useEffect, useState } from 'react'
import AnalyticsChart from '../../components/AnalyticsChart'
import ErrorMessage from '../../components/ErrorMessage'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatCard from '../../components/StatCard'
import { adminAction } from '../../services/admin'
import { errorText } from '../../utils/errors'
import { formatBytes } from '../../utils/format'

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState('30d')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const body = from && to ? { from, to } : { range }
      const [analytics, ai] = await Promise.all([
        adminAction('analytics', body),
        adminAction('ai-usage', { ...body, page: 1 }),
      ])
      setData(analytics)
      setUsage(ai)
    } catch (err) {
      setError(errorText(err, 'Analytics could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [range])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>AI usage and analytics</h1>
          <p className="lede">Charts use recorded database events. Provider billing APIs are not queried.</p>
        </div>
      </header>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          load()
        }}
      >
        <select className="select" value={range} onChange={(event) => setRange(event.target.value)}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
        <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <button className="btn btn-primary" type="submit">Apply</button>
      </form>
      {loading ? <LoadingSpinner label="Loading analytics" /> : null}
      <ErrorMessage message={error} onRetry={load} />
      {usage?.summary ? (
        <div className="stat-grid">
          <StatCard label="Transcription requests" value={usage.summary.transcriptionRequests} />
          <StatCard label="Transcription success" value={usage.summary.transcriptionSuccess} />
          <StatCard label="Transcription failed" value={usage.summary.transcriptionFailed} />
          <StatCard label="Language-model requests" value={usage.summary.languageModelRequests} />
          <StatCard label="Input tokens" value={usage.summary.inputTokens} />
          <StatCard label="Output tokens" value={usage.summary.outputTokens} />
          <StatCard label="Audio seconds" value={Math.round(usage.summary.audioSeconds || 0)} />
          <StatCard label="Rate-limit errors" value={usage.summary.rateLimitErrors} />
        </div>
      ) : null}
      {data ? (
        <div className="admin-grid-2">
          <AnalyticsChart title="Registrations" series={data.registrations} lines={[{ key: 'count', color: '#1769E8', label: 'Users' }]} />
          <AnalyticsChart
            title="Successful vs failed jobs"
            series={data.processing}
            lines={[
              { key: 'completed', color: '#1f8a4c', label: 'Completed' },
              { key: 'failed', color: '#c0392b', label: 'Failed' },
            ]}
          />
          <AnalyticsChart
            title="AI token consumption"
            series={data.tokens}
            lines={[
              { key: 'input', color: '#1769E8', label: 'Input' },
              { key: 'output', color: '#0f55c7', label: 'Output' },
            ]}
          />
          <AnalyticsChart
            title="Storage growth"
            series={data.storage}
            lines={[{ key: 'bytes', color: '#607d9f', label: 'Bytes' }]}
          />
          <AnalyticsChart
            title="Reported issues"
            series={data.issues}
            lines={[
              { key: 'open', color: '#d97706', label: 'Open-like' },
              { key: 'resolved', color: '#1f8a4c', label: 'Resolved/closed' },
            ]}
          />
        </div>
      ) : null}
      <p className="hint">{data?.estimatedCostLabel || usage?.summary?.source}</p>
      {data?.storage?.length ? (
        <p className="hint">Latest storage sample in period: {formatBytes(data.storage[data.storage.length - 1]?.bytes || 0)}</p>
      ) : null}
    </div>
  )
}
