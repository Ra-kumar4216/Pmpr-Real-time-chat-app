import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, MailCheck, User } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { validateEmail, validateFullName, validateNewPassword } from '../auth/validation'
import { AuthLayout } from '../components/AuthLayout'
import { FormError, GoogleButton, OrDivider, PasswordField, PasswordMeter, PrimaryButton, TextField } from '../components/ui'

type Errors = { fullName: string | null; email: string | null; password: string | null }
const NO_ERRORS: Errors = { fullName: null, email: null, password: null }

export default function SignUpPage() {
  const { signUp, signInWithGoogle, resendConfirmation } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>(NO_ERRORS)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'password' | 'google' | 'resend' | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resendNote, setResendNote] = useState<{ ok: boolean; text: string } | null>(null)

  function clear(field: keyof Errors) {
    if (errors[field]) setErrors((s) => ({ ...s, [field]: null }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const next: Errors = {
      fullName: validateFullName(fullName),
      email: validateEmail(email),
      password: validateNewPassword(password),
    }
    setErrors(next)
    if (next.fullName || next.email || next.password) return

    setBusy('password')
    const { error, needsConfirmation } = await signUp(fullName.trim(), email.trim(), password)
    setBusy(null)
    if (error) return setFormError(error)
    if (needsConfirmation) return setSentTo(email.trim())
    navigate('/', { replace: true })
  }

  async function onGoogle() {
    setFormError(null)
    setBusy('google')
    const { error } = await signInWithGoogle()
    if (error) {
      setFormError(error)
      setBusy(null)
    }
  }

  async function onResend() {
    if (!sentTo) return
    setResendNote(null)
    setBusy('resend')
    const { error } = await resendConfirmation(sentTo)
    setBusy(null)
    setResendNote(error ? { ok: false, text: error } : { ok: true, text: 'Confirmation email sent again.' })
  }

  if (sentTo) {
    return (
      <AuthLayout variant="centered">
        <div className="text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-fuchsia-50 text-fuchsia-700">
            <MailCheck aria-hidden className="size-7" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Check your email</h1>
          <p className="mt-2 text-sm text-slate-500">
            We sent a confirmation link to <strong className="font-semibold text-slate-700">{sentTo}</strong>. Open it to activate your account, then log in.
          </p>
          {resendNote && (
            <p role="status" className={`mt-4 text-sm ${resendNote.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
              {resendNote.text}
            </p>
          )}
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={onResend}
              disabled={busy === 'resend'}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 transition hover:bg-fuchsia-50 disabled:opacity-60"
            >
              {busy === 'resend' ? 'Sending…' : 'Resend email'}
            </button>
            <Link to="/login" className="block text-sm font-semibold text-fuchsia-700 hover:text-fuchsia-800">
              Back to login
            </Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout variant="centered">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">Join and start chatting securely</p>
      </div>

      <form noValidate onSubmit={onSubmit} className="space-y-4">
        {formError && <FormError message={formError} />}
        <TextField
          id="fullName"
          label="Full name"
          icon={User}
          value={fullName}
          onValueChange={(v) => {
            setFullName(v)
            clear('fullName')
          }}
          error={errors.fullName}
          placeholder="Enter your name"
          autoComplete="name"
        />
        <TextField
          id="email"
          label="Email address"
          type="email"
          icon={Mail}
          value={email}
          onValueChange={(v) => {
            setEmail(v)
            clear('email')
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
            clear('password')
          }}
          error={errors.password}
          hint="At least 8 characters, with a letter and a number."
          below={<PasswordMeter value={password} />}
          placeholder="Create a strong password"
          autoComplete="new-password"
        />
        <PrimaryButton loading={busy === 'password'} disabled={busy !== null}>
          {busy === 'password' ? 'Creating account…' : 'Sign up'}
        </PrimaryButton>
      </form>

      <OrDivider />
      <GoogleButton loading={busy === 'google'} disabled={busy !== null} onClick={onGoogle} />

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-fuchsia-700 hover:text-fuchsia-800">
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
