import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PasswordField from '../components/PasswordField'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyAuthError } from '../utils/errors'
import { validatePassword } from '../utils/validation'

export default function ResetPasswordPage() {
  const { session, configured, configError } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    const passwordError = validatePassword(password)
    if (passwordError) return setError(passwordError)
    if (password !== confirm) return setError('The passwords do not match.')
    if (!configured) return setError(configError)
    if (!session) return setError('Open the reset link from your email first. This page needs that secure session.')
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) return setError(friendlyAuthError(updateError))
    navigate('/dashboard')
  }

  return (
    <main className="auth-shell">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1>Choose a new password</h1>
        <PasswordField label="New password" autoComplete="new-password" value={password} onChange={setPassword} />
        <PasswordField label="Confirm password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Update password'}
        </button>
        <Link to="/forgot-password">Request a new link</Link>
      </form>
    </main>
  )
}
