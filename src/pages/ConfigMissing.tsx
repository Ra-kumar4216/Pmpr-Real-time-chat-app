import { Logo } from '../components/ui'

export default function ConfigMissing() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-card">
        <Logo />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Supabase is not configured</h1>
        <p className="mt-2 text-sm text-slate-500">
          Create a file named <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">.env.local</code> in the project root, then restart the dev server:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key`}
        </pre>
        <p className="mt-4 text-sm text-slate-500">
          Find both values in Supabase → Project Settings → API. Full steps are in README.md.
        </p>
      </div>
    </main>
  )
}
