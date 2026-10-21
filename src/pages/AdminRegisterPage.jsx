import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import AuthSplitLayout from '../components/AuthSplitLayout'
import PasswordField from '../components/PasswordField'
import SlideLetters from '../components/SlideLetters'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyAuthError } from '../utils/errors'
import { validateEmail, validateName, validatePassword } from '../utils/validation'

export default function AdminRegisterPage() {
  const { session, profile, configured, configError, loading } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session && profile?.role === 'admin') return <Navigate to="/admin/dashboard" replace />

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
    if (session) await supabase.auth.signOut()
    const { data, error: signError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: { full_name: form.name.trim(), signup_as: 'admin' },
        emailRedirectTo: `${window.location.origin}/admin/login`,
      },
    })
    if (signError) {
      setBusy(false)
      return setError(friendlyAuthError(signError))
    }
    const alreadyRegistered = Array.isArray(data.user?.identities) && data.user.identities.length === 0
    if (alreadyRegistered) {
      setBusy(false)
      return setError('An account with this email already exists. Use administrator sign in.')
    }
    if (!data.session) {
      setBusy(false)
      return setMessage('Administrator account created. Confirm the email, then sign in on the administrator page.')
    }
    const { error: claimError } = await supabase.rpc('claim_first_admin')
    const { data: profileRow } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
    setBusy(false)
    if (profileRow?.role !== 'admin') {
      await supabase.auth.signOut()
      return setError(claimError
        ? 'Administrator setup is not in the database yet. Run the admin SQL, then try again.'
        : 'An administrator already exists. Sign in as that admin, open Users, and use Make administrator — or create a normal account first and promote it.')
    }
    navigate('/admin/dashboard')
  }

  return (
    <AuthSplitLayout
      className="auth-login auth-visual"
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
        <span className="login-logo" aria-hidden="true">
          <Shield size={20} />
        </span>
        <div className="login-heading">
          <h1>Create an administrator</h1>
          <p>This opens the admin application. The first administrator account is the only one created here.</p>
        </div>
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
        <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
          {busy ? 'Creating administrator…' : 'Create administrator'}
        </button>
        <p className="login-footer">
          <Link to="/admin/login">Administrator sign in</Link>
        </p>
        <p className="register-login-link">
          Need a normal account? <Link to="/register">Create a user account</Link>
        </p>
      </form>
    </AuthSplitLayout>
  )
}
