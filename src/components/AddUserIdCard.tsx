import { useState, type FormEvent } from 'react'
import { AtSign, Search } from 'lucide-react'
import { findUser } from '../lib/api'
import { normalizeUserId, validateUserId } from '../lib/text'
import type { FoundUser } from '../lib/types'
import { Spinner } from './ui'
import { SearchResultDialog } from './SearchResultDialog'

/** Screen 4: the Add User ID box, kept at the very top of the dashboard. */
export function AddUserIdCard() {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<FoundUser | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const id = normalizeUserId(value)
    const problem = validateUserId(id)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const user = await findUser(id)
      if (!user) setError('No user found with that ID.')
      else setFound(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="add-user-title" className="rounded-3xl bg-sunset p-5 text-white shadow-card sm:p-6">
      <h2 id="add-user-title" className="text-lg font-semibold">
        Add a friend
      </h2>
      <p className="mt-0.5 text-sm text-white/85">Enter their User ID to find and save them.</p>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <AtSign aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400" />
          <label htmlFor="add-user-id" className="sr-only">
            Friend&apos;s User ID
          </label>
          <input
            id="add-user-id"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(null)
            }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Add User ID, e.g. ratan_kumar_8f3k2"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'add-user-error' : undefined}
            className="h-12 w-full rounded-xl border-0 bg-white pr-3 pl-10 text-sm text-slate-900 shadow-xs outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-white/40"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-fuchsia-700 shadow-xs transition hover:bg-fuchsia-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-70"
        >
          {busy ? <Spinner /> : <Search aria-hidden className="size-4.5" />}
          Find
        </button>
      </form>
      {error && (
        <p id="add-user-error" role="alert" className="mt-3 rounded-lg bg-white/95 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <SearchResultDialog
        found={found}
        onClose={() => {
          setFound(null)
          setValue('')
        }}
      />
    </section>
  )
}
