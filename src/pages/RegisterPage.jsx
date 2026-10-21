import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import AuthSplitLayout from '../components/AuthSplitLayout'
import PasswordField from '../components/PasswordField'
import SlideLetters from '../components/SlideLetters'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyAuthError } from '../utils/errors'
import { validateEmail, validateName, validatePassword } from '../utils/validation'

export default function RegisterPage() {
  const { session, profile, configured, configError, loading } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session && profile) return <Navigate to={profile.role === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const nameError = validateName(form.name)
    const emailError = validateEmail(form.email)
    const passwordError = validatePassword(form.password)
    if (nameError || emailError || passwordError) return setError(nameError || emailError || passwordError)
    if (form.password !== form.confirm) return setError('The passwords do not match.')
    if (!configured) return setError(configError)
    setBusy(true)
    const { data, error: signError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: { full_name: form.name.trim() },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })
    setBusy(false)
    if (signError) return setError(friendlyAuthError(signError))
    if (data.session) return navigate('/dashboard')
    const alreadyRegistered = Array.isArray(data.user?.identities) && data.user.identities.length === 0
    if (alreadyRegistered) return setError('An account with this email already exists. Log in, or check your inbox for the earlier confirmation email.')
    setMessage('Account created. Check your email to confirm it, then log in. New accounts are Users.')
  }

  return (
    <AuthSplitLayout
      className="auth-visual"
      videoHeader={<p className="login-video-brand">VoiceNote AI</p>}
      videoFooter={
        <>
          <div className="login-video-copy">
            <SlideLetters
              as="h2"
              text={[
                { text: 'Your Voice. Your Ideas. ' },
                { text: 'Powered by AI.', className: 'login-ai' },
              ]}
            />
          </div>
          <p className="login-video-sub">Turn every conversation into clear notes, smart summaries, and actionable tasks.</p>
        </>
      }
    >
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Create your account</h1>
        <p className="hint">Registration always assigns the User role.</p>
        <label className="field">
          <span>Name</span>
          <input className="input" value={form.name} onChange={(event) => setField('name', event.target.value)} required />
        </label>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="email" value={form.email} onChange={(event) => setField('email', event.target.value)} required />
        </label>
        <PasswordField label="Password" autoComplete="new-password" value={form.password} onChange={(value) => setField('password', value)} />
        <PasswordField label="Confirm password" autoComplete="new-password" value={form.confirm} onChange={(value) => setField('confirm', value)} />
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="callout">{message}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="register-login-link">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </AuthSplitLayout>
  )
}
