import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

type Tone = 'success' | 'error'
interface ToastInput {
  tone?: Tone
  title: string
  message?: string
}
interface ToastItem extends ToastInput {
  id: number
  tone: Tone
}

const ToastContext = createContext<{ show: (t: ToastInput) => void } | null>(null)

export const TOAST_MS = 4500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++
      setItems((prev) => [...prev.slice(-2), { ...t, id, tone: t.tone ?? 'success' }])
      timers.current.set(id, window.setTimeout(() => dismiss(id), TOAST_MS))
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-card motion-safe:animate-rise ${
              t.tone === 'success' ? 'border-emerald-200' : 'border-rose-200'
            }`}
          >
            {t.tone === 'success' ? (
              <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-rose-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{t.title}</p>
              {t.message && <p className="mt-0.5 text-sm text-slate-500">{t.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="grid size-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
