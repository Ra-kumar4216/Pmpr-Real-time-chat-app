import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { validateEmail, validateLoginPassword } from '../auth/validation'
import { AuthLayout, AuthTabs } from '../components/AuthLayout'
import { FormError, GoogleButton, OrDivider, PasswordField, PrimaryButton, TextField } from '../components/ui'

export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email: string | null; password: string | null }>({ email: null, password: null })
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'password' | 'google' | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const next = { email: validateEmail(email), password: validateLoginPassword(password) }
    setErrors(next)
    if (next.email || next.password) return

    setBusy('password')
    const { error } = await signIn(email.trim(), password)
    if (error) {
      setFormError(error)
      setBusy(null)
      return
    }
    navigate('/', { replace: true })
  }

  async function onGoogle() {
    setFormError(null)
    setBusy('google')
    const { error } = await signInWithGoogle()
    // On success the browser leaves for Google, so there is nothing to reset.
    if (error) {
      setFormError(error)
      setBusy(null)
    }
  }

  return (
    <AuthLayout variant="split">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome Back</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to your PrivateChat account</p>
      </div>

      <AuthTabs active="login" />

      <form noValidate onSubmit={onSubmit} className="mt-6 space-y-4">
        {formError && <FormError message={formError} />}
        <TextField
          id="email"
          label="Email address"
          type="email"
          icon={Mail}
          value={email}
          onValueChange={(v) => {
            setEmail(v)
            if (errors.email) setErrors((s) => ({ ...s, email: null }))
          }}
          error={errors.email}
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
        />
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onValueChange={(v) => {
            setPassword(v)
            if (errors.password) setErrors((s) => ({ ...s, password: null }))
          }}
          error={errors.password}
          placeholder="Enter your password"
          autoComplete="current-password"
        />
        <PrimaryButton loading={busy === 'password'} disabled={busy !== null}>
          {busy === 'password' ? 'Logging in…' : 'Login'}
        </PrimaryButton>
      </form>

      <OrDivider />
      <GoogleButton loading={busy === 'google'} disabled={busy !== null} onClick={onGoogle} />

      <p className="mt-6 text-center text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <Link to="/signup" className="font-semibold text-fuchsia-700 hover:text-fuchsia-800">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  )
}
