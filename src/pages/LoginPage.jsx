import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock, Mail, Mic } from 'lucide-react'
import AuthSplitLayout from '../components/AuthSplitLayout'
import PasswordField from '../components/PasswordField'
import SlideLetters from '../components/SlideLetters'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyAuthError } from '../utils/errors'
import { validateEmail, validatePassword } from '../utils/validation'

export default function LoginPage() {
  const { session, profile, loading, configured, configError, authNotice, clearNotice } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session && profile) return <Navigate to={profile.role === 'admin' ? '/admin/dashboard' : '/dashboard'} replace />

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
    setBusy(false)
    if (signError) return setError(friendlyAuthError(signError))
    const { data: profileRow, error: profileError } = await supabase.from('profiles').select('role, account_status').eq('id', data.user.id).single()
    if (profileError) return setError('Your profile could not be loaded.')
    if (profileRow.account_status !== 'active') {
      await supabase.auth.signOut()
      return setError('This account is deactivated.')
    }
    navigate(profileRow.role === 'admin' ? '/admin/dashboard' : '/dashboard')
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
        <Link className="login-back" to="/" aria-label="Back to home">
          <ArrowLeft size={22} />
          Back
        </Link>
        <span className="login-logo" aria-hidden="true">
          <Mic size={20} />
        </span>
        <div className="login-heading">
          <h1>Welcome back</h1>
          <p>Sign in to continue to your VoiceNote AI workspace.</p>
        </div>
        <label className="field">
          <span>Email</span>
          <span className="login-input-wrap">
            <Mail size={18} aria-hidden="true" />
            <input className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </span>
        </label>
        <PasswordField label="Password" value={password} onChange={setPassword} leadingIcon={<Lock size={18} />} />
        <Link className="login-forgot" to="/forgot-password">
          Forgot password?
        </Link>
        {authNotice ? <p className="form-error">{authNotice}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Log in'}
        </button>
        <p className="login-footer">
          <Link to="/register">Create an account</Link>
        </p>
        <p className="register-login-link">
          Administrator? <Link to="/admin/login">Admin sign in</Link>
          {' · '}
          <Link to="/admin/register">Create an administrator</Link>
        </p>
      </form>
    </AuthSplitLayout>
  )
}
