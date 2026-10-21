import { useEffect, useState } from 'react'
import ErrorMessage from '../../components/ErrorMessage'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useToast } from '../../context/ToastContext'
import { adminAction } from '../../services/admin'
import { errorText } from '../../utils/errors'
import { formatDateTime } from '../../utils/format'

export default function AdminSettingsPage() {
  const toast = useToast()
  const [settings, setSettings] = useState([])
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [rows, healthData] = await Promise.all([
        adminAction('list-settings'),
        adminAction('health'),
      ])
      setSettings(rows || [])
      setHealth(healthData)
    } catch (err) {
      setError(errorText(err, 'Settings could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function save(key, value) {
    try {
      await adminAction('update-setting', { key, value })
      toast.push('Setting saved.', 'success')
      await load()
    } catch (err) {
      toast.push(errorText(err), 'error')
    }
  }

  if (loading) return <LoadingSpinner label="Loading settings" large />

  return (
    <div className="page">
      <header>
        <h1>Application settings</h1>
        <p className="lede">Non-secret configuration only. Provider API keys stay in Edge Function secrets.</p>
      </header>
      <ErrorMessage message={error} onRetry={load} />
      {health ? (
        <article className="card stack">
          <h2>Provider configuration</h2>
          {(health.services || [])
            .filter((service) => /provider|Edge/i.test(service.name))
            .map((service) => (
              <p key={service.name}>
                <strong>{service.name}:</strong> {service.status === 'ok' ? 'Configured' : service.status} — {service.detail}
              </p>
            ))}
        </article>
      ) : null}
      <section className="list">
        {settings.map((setting) => (
          <SettingRow key={setting.key} setting={setting} onSave={save} />
        ))}
      </section>
    </div>
  )
}

function SettingRow({ setting, onSave }) {
  const [value, setValue] = useState(typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value))
  useEffect(() => {
    setValue(typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value))
  }, [setting.key, setting.value])
  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault()
        let parsed = value
        try {
          parsed = JSON.parse(value)
        } catch {
          parsed = value
        }
        onSave(setting.key, parsed)
      }}
    >
      <strong>{setting.key}</strong>
      <p className="hint">{setting.description}</p>
      <p className="hint">Updated {formatDateTime(setting.updated_at)}</p>
      <textarea className="textarea" value={value} onChange={(event) => setValue(event.target.value)} rows={3} />
      <button className="btn btn-primary btn-small" type="submit">Save setting</button>
    </form>
  )
}
