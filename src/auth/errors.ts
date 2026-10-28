type AuthLikeError = { message?: string; code?: string; status?: number } | null | undefined

/** Turns Supabase/GoTrue errors into messages a person can act on. */
export function friendlyAuthError(err: AuthLikeError): string {
  const code = err?.code ?? ''
  const msg = (err?.message ?? '').toLowerCase()

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Incorrect email or password.'
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Please confirm your email first. Check your inbox for the confirmation link.'
  }
  if (code === 'user_already_exists' || msg.includes('already registered')) {
    return 'An account with this email already exists. Try logging in instead.'
  }
  if (code === 'weak_password' || msg.includes('password should')) {
    return 'That password is too weak. Use at least 8 characters with letters and numbers.'
  }
  if (code === 'signup_disabled' || msg.includes('signups not allowed')) {
    return 'Sign-ups are currently disabled.'
  }
  if (msg.includes('provider is not enabled') || msg.includes('unsupported provider')) {
    return 'Google sign-in is not enabled for this project yet. Enable it in Supabase → Authentication → Providers.'
  }
  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    err?.status === 429 ||
    msg.includes('rate limit')
  ) {
    return 'Too many attempts. Please wait a minute and try again.'
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Cannot reach the server. Check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}
