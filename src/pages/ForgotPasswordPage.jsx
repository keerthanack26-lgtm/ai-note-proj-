import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyAuthError } from '../utils/errors'
import { validateEmail } from '../utils/validation'

export default function ForgotPasswordPage() {
  const { configured, configError } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    const emailError = validateEmail(email)
    if (emailError) return setError(emailError)
    if (!configured) return setError(configError)
    setBusy(true)
    setError('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (resetError) return setError(friendlyAuthError(resetError))
    setMessage('If an account exists for that email, a reset link is on its way.')
  }

  return (
    <main className="auth-shell">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1>Reset your password</h1>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="callout">{message}</p> : null}
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? 'Sending…' : 'Send reset email'}
        </button>
        <Link to="/login">Back to log in</Link>
      </form>
    </main>
  )
}
