import { useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Camera, Check, MessageCircle, User as UserIcon } from 'lucide-react'
import { useProfile } from '../auth/ProfileContext'
import { Avatar } from '../components/Avatar'
import { CopyButton } from '../components/CopyButton'
import { Horizon } from '../components/AuthLayout'
import { FormError, Logo, PrimaryButton, TextField, Wordmark } from '../components/ui'
import { ACCEPT_IMAGES } from '../lib/image'
import { useAvatarUpload } from '../lib/useAvatarUpload'
import { useAuth } from '../auth/AuthContext'

const NAME_MAX = 50

const STEPS = [
  { n: 1, title: 'Profile', text: 'Your photo and name' },
  { n: 2, title: 'Your User ID', text: 'Share it so friends can find you' },
  { n: 3, title: 'Done', text: 'Start chatting' },
]

export default function SetupPage() {
  const { profile, save } = useProfile()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(profile?.display_name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const avatar = useAvatarUpload({
    userId: profile?.id ?? '',
    currentPath: profile?.avatar_path ?? null,
    onUploaded: (path) => save({ avatarPath: path }),
  })

  // Already set up and not in the final step: nothing to do here.
  if (profile?.onboarded_at && !done) return <Navigate to="/app" replace />
  if (!profile) return null

  const trimmed = name.trim()
  const nameError = trimmed.length === 0 ? 'Enter a display name' : trimmed.length > NAME_MAX ? `Use ${NAME_MAX} characters or fewer` : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (nameError || avatar.busy) {
      setError(nameError ?? 'Please wait for your photo to finish uploading.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await save({ displayName: trimmed, finishOnboarding: true })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  const step = done ? 3 : 2

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[5fr_7fr]">
      <aside className="relative hidden overflow-hidden bg-sunset text-white lg:flex lg:flex-col lg:justify-center lg:px-14">
        <Horizon className="absolute inset-x-0 bottom-0 h-72 w-full" />
        <div className="relative max-w-sm pb-24">
          <div className="flex items-center gap-3">
            <Logo className="size-12" />
            <Wordmark light className="text-2xl" />
          </div>
          <h2 className="mt-8 text-3xl font-bold tracking-tight">Set up your profile</h2>
          <ol className="mt-8 space-y-5">
            {STEPS.map((s) => {
              const complete = s.n < step
              const current = s.n === step || (s.n === 1 && step === 2)
              return (
                <li key={s.n} className="flex gap-4" aria-current={s.n === step ? 'step' : undefined}>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold ring-1 ring-white/40 ${complete || current ? 'bg-white text-fuchsia-700' : 'bg-white/10'}`}>
                    {complete ? <Check aria-hidden className="size-4" /> : s.n}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{s.title}</span>
                    <span className="block text-sm text-white/75">{s.text}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </aside>

      <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-sunset px-4 py-10 lg:bg-none lg:bg-surface">
        <div className="relative mb-6 flex items-center gap-2.5 lg:hidden">
          <Logo className="size-11" />
          <Wordmark light />
        </div>

        <div className="relative w-full max-w-md rounded-3xl border border-white/80 bg-white/95 p-6 shadow-card motion-safe:animate-rise sm:p-9">
          {done ? (
            <div className="text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <Check aria-hidden className="size-7" />
              </span>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">You&apos;re all set, {profile.display_name}!</h1>
              <p className="mt-2 text-sm text-slate-500">Share your User ID with friends so they can add you.</p>
              <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-left">
                <span className="min-w-0">
                  <span className="block text-xs text-slate-500">Your User ID</span>
                  <span className="block truncate font-mono text-sm font-semibold text-slate-900" data-testid="user-id">
                    {profile.user_id}
                  </span>
                </span>
                <CopyButton text={profile.user_id} />
              </div>
              <button
                type="button"
                onClick={() => navigate('/app', { replace: true })}
                className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white shadow-cta hover:brightness-110"
              >
                <MessageCircle aria-hidden className="size-4.5" />
                Start Chatting
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <h1 className="text-2xl font-bold text-slate-900">Complete your profile</h1>
              <p className="mt-1 text-sm text-slate-500">This is how friends will see you.</p>

              <div className="mt-6 flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={avatar.busy}
                  aria-label={profile.avatar_path || avatar.preview ? 'Change profile photo' : 'Upload profile photo'}
                  className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-500"
                >
                  <Avatar name={name || user?.email || '?'} path={profile.avatar_path} src={avatar.preview} size="xl" />
                  <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-brand text-white shadow-cta ring-2 ring-white">
                    <Camera aria-hidden className="size-4" />
                  </span>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT_IMAGES}
                  className="hidden"
                  data-testid="avatar-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    void avatar.pick(f)
                  }}
                />
                <p className="mt-2 text-xs text-slate-500" aria-live="polite">
                  {avatar.busy ? 'Uploading photo…' : 'JPG, PNG or WebP. Optional.'}
                </p>
                {avatar.error && (
                  <p role="alert" className="mt-1 text-xs text-rose-600">
                    {avatar.error}
                  </p>
                )}
              </div>

              <div className="mt-6 space-y-4">
                <TextField
                  id="display-name"
                  label="Display name"
                  icon={UserIcon}
                  value={name}
                  maxLength={NAME_MAX + 10}
                  autoComplete="name"
                  placeholder="e.g. Ratan Kumar"
                  onValueChange={setName}
                  error={name.length > 0 ? nameError : null}
                  below={
                    <p className="mt-1 text-right text-xs text-slate-400" aria-hidden>
                      {trimmed.length}/{NAME_MAX}
                    </p>
                  }
                />

                <div>
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Your User ID</span>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                    <span className="min-w-0 truncate font-mono text-sm text-slate-900" data-testid="user-id">
                      {profile.user_id}
                    </span>
                    <CopyButton text={profile.user_id} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">Generated automatically. Friends use it to find you.</p>
                </div>
              </div>

              {error && (
                <div className="mt-4">
                  <FormError message={error} />
                </div>
              )}

              <div className="mt-6">
                <PrimaryButton loading={saving} disabled={avatar.busy}>
                  Continue
                </PrimaryButton>
              </div>
              <button type="button" onClick={() => void signOut()} className="mt-3 w-full text-center text-xs text-slate-500 underline hover:text-slate-700">
                Log out
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
