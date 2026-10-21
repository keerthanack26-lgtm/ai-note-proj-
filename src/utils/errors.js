export function friendlyAuthError(error) {
  const message = error?.message || 'Something went wrong. Try again.'
  if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.'
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email before logging in.'
  if (/password/i.test(message) && /at least|weak/i.test(message)) {
    return 'Use at least 8 characters with a letter and a number.'
  }
  if (/email rate limit|over_email_send_rate_limit/i.test(message)) {
    return 'Supabase has paused confirmation emails for this project (the free mailer allows only a few per hour). Wait an hour, or turn off "Confirm email" in Supabase Authentication settings for local testing.'
  }
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a moment and try again.'
  if (/expired/i.test(message)) return 'This link has expired. Request a new password reset email.'
  return message
}

export function errorText(error, fallback = 'Something went wrong. Try again.') {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || fallback
}
