import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ErrorMessage from '../../components/ErrorMessage'
import LoadingSpinner from '../../components/LoadingSpinner'
import PasswordField from '../../components/PasswordField'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { supabase } from '../../lib/supabase'
import { adminAction } from '../../services/admin'
import { errorText, friendlyAuthError } from '../../utils/errors'
import { formatDateTime } from '../../utils/format'
import { validatePassword } from '../../utils/validation'

export default function AdminProfilePage() {
  const { refreshProfile, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await adminAction('profile')
      setProfile(data)
      setName(data.fullName || '')
    } catch (err) {
      setError(errorText(err, 'Admin profile could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function saveName(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await adminAction('update-profile', { fullName: name })
      await refreshProfile()
      toast.push('Profile updated.', 'success')
      await load()
    } catch (err) {
      toast.push(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(event) {
    event.preventDefault()
    const passwordError = validatePassword(password)
    if (passwordError) return toast.push(passwordError, 'error')
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) return toast.push(friendlyAuthError(updateError), 'error')
    setPassword('')
    toast.push('Password updated.', 'success')
  }

  if (loading) return <LoadingSpinner label="Loading profile" large />

  return (
    <div className="page">
      <header>
        <h1>Admin profile</h1>
        <p className="lede">Manage your administrator account. Role promotion is not available here.</p>
      </header>
      <ErrorMessage message={error} onRetry={load} />
      {profile ? (
        <>
          <article className="card stack">
            <p><strong>Email:</strong> {profile.email}</p>
            <p><strong>Role:</strong> {profile.role}</p>
            <p><strong>Created:</strong> {formatDateTime(profile.createdAt)}</p>
            <p><strong>Last sign-in:</strong> {formatDateTime(profile.lastSignInAt)}</p>
          </article>
          <form className="card stack" onSubmit={saveName}>
            <label className="field">
              <span>Name</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy}>Save name</button>
          </form>
          <form className="card stack" onSubmit={changePassword}>
            <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
            <button className="btn btn-secondary" type="submit" disabled={busy}>Update password</button>
          </form>
          <button
            className="btn btn-danger"
            type="button"
            onClick={async () => {
              await signOut()
              navigate('/admin/login')
            }}
          >
            Log out
          </button>
        </>
      ) : null}
    </div>
  )
}
