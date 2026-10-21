import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ConfirmationModal from '../components/ConfirmationModal'
import ErrorMessage from '../components/ErrorMessage'
import PasswordField from '../components/PasswordField'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { invokeFunction } from '../services/api'
import { getUsageSummary, updatePreferences, updateProfileName } from '../services/records'
import { LANGUAGES, SUMMARY_STYLES, geminiPreferenceLanguage } from '../utils/constants'
import { errorText, friendlyAuthError } from '../utils/errors'
import { validateName, validatePassword } from '../utils/validation'

export default function SettingsPage() {
  const { profile, refreshProfile, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState(profile?.full_name || '')
  const [prefs, setPrefs] = useState(profile?.preferences || {})
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(profile?.full_name || '')
    setPrefs(profile?.preferences || {})
    if (profile?.id) {
      getUsageSummary(profile.id)
        .then(setUsage)
        .catch((err) => setError(errorText(err)))
    }
  }, [profile])

  async function saveProfile(event) {
    event.preventDefault()
    const nameError = validateName(name)
    if (nameError) return toast.push(nameError, 'error')
    try {
      await updateProfileName(name.trim())
      await refreshProfile()
      toast.push('Profile updated.', 'success')
    } catch (err) {
      toast.push(errorText(err), 'error')
    }
  }

  async function savePassword(event) {
    event.preventDefault()
    const passwordError = validatePassword(password)
    if (passwordError) return toast.push(passwordError, 'error')
    if (password !== confirm) return toast.push('The passwords do not match.', 'error')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) return toast.push(friendlyAuthError(updateError), 'error')
    setPassword('')
    setConfirm('')
    toast.push('Password updated.', 'success')
  }

  async function savePrefs(event) {
    event.preventDefault()
    try {
      await updatePreferences({
        preferred_language: geminiPreferenceLanguage(prefs.preferred_language),
        summary_style: prefs.summary_style,
        auto_create_tasks: Boolean(prefs.auto_create_tasks),
        retain_audio: Boolean(prefs.retain_audio),
      })
      await refreshProfile()
      toast.push('Preferences saved.', 'success')
    } catch (err) {
      toast.push(errorText(err), 'error')
    }
  }

  async function removeAccount() {
    if (phrase !== 'DELETE') return toast.push('Type DELETE to confirm.', 'error')
    setBusy(true)
    try {
      await invokeFunction('delete-account', { confirmation: 'DELETE' })
      await signOut()
      navigate('/')
    } catch (err) {
      toast.push(errorText(err, 'The account could not be deleted.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Profile and settings</h1>
          <p className="lede">{profile?.email}</p>
        </div>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={async () => {
            await signOut()
            navigate('/login')
          }}
        >
          Log out
        </button>
      </header>
      <ErrorMessage message={error} />
      <form className="card form-grid" onSubmit={saveProfile}>
        <h2>Profile</h2>
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="hint">Email changes are handled by Supabase confirmation. Update it from a future signed-in email change if you enable that in the project.</p>
        <button className="btn btn-primary" type="submit">
          Save profile
        </button>
      </form>
      <form className="card form-grid" onSubmit={savePassword}>
        <h2>Password</h2>
        <PasswordField label="New password" autoComplete="new-password" value={password} onChange={setPassword} />
        <PasswordField label="Confirm password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        <button className="btn btn-secondary" type="submit">
          Change password
        </button>
      </form>
      <form className="card form-grid" onSubmit={savePrefs}>
        <h2>Note preferences</h2>
        <label className="field">
          <span>Language preference</span>
          <select className="select" value={geminiPreferenceLanguage(prefs.preferred_language)} onChange={(event) => setPrefs({ ...prefs, preferred_language: event.target.value })}>
            {LANGUAGES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <p className="hint">The speech provider detects the spoken language. This preference is sent as a hint and does not guarantee transcription in every language.</p>
        <label className="field">
          <span>Summary style</span>
          <select className="select" value={prefs.summary_style || 'balanced'} onChange={(event) => setPrefs({ ...prefs, summary_style: event.target.value })}>
            {SUMMARY_STYLES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="meta">
          <input type="checkbox" checked={Boolean(prefs.auto_create_tasks)} onChange={(event) => setPrefs({ ...prefs, auto_create_tasks: event.target.checked })} />
          Automatically create tasks from extracted action items
        </label>
        <label className="meta">
          <input type="checkbox" checked={prefs.retain_audio !== false} onChange={(event) => setPrefs({ ...prefs, retain_audio: event.target.checked })} />
          Keep audio after a note is created
        </label>
        <p className="hint">Turning retention off asks processing to remove the stored audio after a successful note. You can also delete recordings yourself from Audio history.</p>
        <button className="btn btn-primary" type="submit">
          Save preferences
        </button>
      </form>
      <section className="card stack">
        <h2>Usage</h2>
        {usage ? (
          <>
            <p>{usage.notes} notes · {usage.audio} audio files · {usage.aiThisMonth} AI operations this month</p>
            <p className="hint">Hourly AI limit: {usage.hourlyLimit} operations. This is the configured application limit, not a provider invoice.</p>
          </>
        ) : (
          <p className="hint">Usage figures appear after your account data loads.</p>
        )}
        <p className="callout">Scheduled email and push reminders are unavailable.</p>
        <Link to="/report-issue">Report an issue</Link>
      </section>
      <section className="card stack">
        <h2>Delete account</h2>
        <p>This permanently removes your login, notes, tasks, chat, and stored audio.</p>
        <button className="btn btn-danger" type="button" onClick={() => setConfirmDelete(true)}>
          Delete account
        </button>
      </section>
      {confirmDelete ? (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="modal card" onClick={(event) => event.stopPropagation()}>
            <h2>Delete your account?</h2>
            <p>Type DELETE to confirm. This cannot be undone from the app.</p>
            <input className="input" value={phrase} onChange={(event) => setPhrase(event.target.value)} />
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" type="button" disabled={busy} onClick={removeAccount}>
                {busy ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
