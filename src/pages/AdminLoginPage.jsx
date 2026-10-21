import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Lock, Mail, Shield } from 'lucide-react'
import AuthSplitLayout from '../components/AuthSplitLayout'
import PasswordField from '../components/PasswordField'
import SlideLetters from '../components/SlideLetters'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyAuthError } from '../utils/errors'
import { validateEmail, validatePassword } from '../utils/validation'

export default function AdminLoginPage() {
  const { session, profile, loading, configured, configError, authNotice, clearNotice } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session && profile?.role === 'admin') return <Navigate to="/admin/dashboard" replace />

  async function onSubmit(event) {
    event.preventDefault()
    clearNotice()
    const emailError = validateEmail(email)
    const passwordError = validatePassword(password)
    if (emailError || passwordError) return setError(emailError || passwordError)
    if (!configured) return setError(configError)
    setBusy(true)
    setError('')
    const { data, error: signError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signError) {
      setBusy(false)
      return setError(friendlyAuthError(signError))
    }
    const { error: claimError } = await supabase.rpc('claim_first_admin')
    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('role, account_status')
      .eq('id', data.user.id)
      .single()
    setBusy(false)
    if (profileError) return setError('Your profile could not be loaded.')
    if (profileRow.account_status !== 'active') {
      await supabase.auth.signOut()
      return setError('This account is deactivated.')
    }
    if (profileRow.role !== 'admin') {
      await supabase.auth.signOut()
      return setError(claimError
        ? 'Administrator setup is not in the database yet. Run the SQL, then sign in again.'
        : 'This account is not an administrator. Create the administrator account, or sign in as a user.')
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
          <h1>Administrator sign in</h1>
          <p>Sign in to open the admin application.</p>
        </div>
        <label className="field">
          <span>Email</span>
          <span className="login-input-wrap">
            <Mail size={18} aria-hidden="true" />
            <input className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </span>
        </label>
        <PasswordField label="Password" value={password} onChange={setPassword} leadingIcon={<Lock size={18} />} />
        {authNotice ? <p className="form-error">{authNotice}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Open admin'}
        </button>
        <p className="login-footer">
          <Link to="/admin/register">Create an administrator</Link>
        </p>
        <p className="register-login-link">
          User account? <Link to="/login">User sign in</Link>
        </p>
      </form>
    </AuthSplitLayout>
  )
}
