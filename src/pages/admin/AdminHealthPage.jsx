import { useEffect, useState } from 'react'
import ErrorMessage from '../../components/ErrorMessage'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatusBadge from '../../components/StatusBadge'
import { adminAction } from '../../services/admin'
import { errorText } from '../../utils/errors'
import { formatBytes, formatDateTime } from '../../utils/format'

export default function AdminHealthPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await adminAction('health'))
    } catch (err) {
      setError(errorText(err, 'Health checks could not run.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading && !data) return <LoadingSpinner label="Checking services" large />

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>System health</h1>
          <p className="lede">Checks use live service responses. Secret values are never displayed.</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={load}>Run checks</button>
      </header>
      <ErrorMessage message={error} onRetry={load} />
      {data ? (
        <>
          <p className="hint">Last check: {formatDateTime(data.checkedAt)}</p>
          <div className="list">
            {(data.services || []).map((service) => (
              <article className="card stack" key={service.name}>
                <div className="meta-row">
                  <strong>{service.name}</strong>
                  <StatusBadge value={service.status === 'ok' ? 'completed' : service.status === 'unconfigured' ? 'queued' : 'failed'} />
                </div>
                <p>{service.detail}</p>
              </article>
            ))}
          </div>
          <article className="card stack">
            <p><strong>Failed jobs (24h):</strong> {data.recentFailures}</p>
            <p><strong>Stored audio bytes:</strong> {formatBytes(data.storageBytes)}</p>
          </article>
        </>
      ) : null}
    </div>
  )
}
