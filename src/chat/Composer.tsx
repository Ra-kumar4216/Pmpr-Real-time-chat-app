import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ImagePlus, Send, Smile, X } from 'lucide-react'
import { ACCEPT_IMAGES, validateImageFile } from '../lib/image'

const EMOJIS = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤔', '😅', '😉', '🥳',
  '😢', '😭', '😡', '😴', '🙈', '👍', '👎', '🙏', '👏', '🙌', '💪', '👋',
  '🔥', '✨', '🎉', '❤️', '💜', '🧡', '💔', '🤝',
]

export const MAX_BODY = 4000

interface Props {
  disabled?: boolean
  disabledReason?: string
  onSend: (body: string, file: File | null) => void
}

export function Composer({ disabled = false, disabledReason, onSend }: Props) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const emojiBox = useRef<HTMLDivElement>(null)

  // Grow with the text, up to about five lines.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [text])

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!emojiOpen) return
    const onDown = (e: MouseEvent) => {
      if (emojiBox.current && !emojiBox.current.contains(e.target as Node)) setEmojiOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setEmojiOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [emojiOpen])

  const body = text.trim()
  const canSend = !disabled && (body.length > 0 || file !== null)

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!canSend) return
    if (body.length > MAX_BODY) {
      setNotice(`Messages can be up to ${MAX_BODY} characters.`)
      return
    }
    onSend(body, file)
    setText('')
    setFile(null)
    setNotice(null)
    setEmojiOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  function insertEmoji(emoji: string) {
    const el = area.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    setText((t) => t.slice(0, start) + emoji + t.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  function onPick(files: FileList | null) {
    const picked = files?.[0]
    if (fileInput.current) fileInput.current.value = '' // allow choosing the same file again
    if (!picked) return
    const problem = validateImageFile(picked)
    if (problem) {
      setNotice(problem)
      return
    }
    setNotice(null)
    setFile(picked)
  }

  const iconBtn =
    'grid size-10 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-fuchsia-50 hover:text-fuchsia-700 focus-visible:outline-2 focus-visible:outline-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <form onSubmit={submit} className="relative border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
      {preview && (
        <div className="mb-2 flex items-center gap-3 rounded-2xl bg-fuchsia-50 p-2 pr-3">
          <img src={preview} alt="Photo ready to send" className="size-14 rounded-xl object-cover" />
          <p className="min-w-0 flex-1 truncate text-sm text-slate-600">{file?.name}</p>
          <button type="button" onClick={() => setFile(null)} aria-label="Remove photo" className="grid size-8 place-items-center rounded-full text-slate-500 hover:bg-white">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      {notice && (
        <p role="alert" className="mb-2 text-sm text-rose-600">
          {notice}
        </p>
      )}
      {disabledReason && disabled && <p className="mb-2 text-sm text-slate-500">{disabledReason}</p>}

      <div className="flex items-end gap-1.5">
        <div ref={emojiBox} className="relative">
          <button type="button" onClick={() => setEmojiOpen((o) => !o)} disabled={disabled} aria-label="Add emoji" aria-expanded={emojiOpen} className={iconBtn}>
            <Smile aria-hidden className="size-5" />
          </button>
          {emojiOpen && (
            <div role="dialog" aria-label="Emoji" className="absolute bottom-12 left-0 z-20 grid w-64 grid-cols-8 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-card">
              {EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} aria-label={`Insert ${emoji}`} className="grid size-7 place-items-center rounded-md text-lg hover:bg-fuchsia-50">
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={() => fileInput.current?.click()} disabled={disabled} aria-label="Attach photo" className={iconBtn}>
          <ImagePlus aria-hidden className="size-5" />
        </button>
        <input ref={fileInput} type="file" accept={ACCEPT_IMAGES} onChange={(e) => onPick(e.target.files)} className="hidden" data-testid="photo-input" />

        <label htmlFor="message-input" className="sr-only">
          Message
        </label>
        <textarea
          id="message-input"
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? 'Add this person to reply' : 'Type a message…'}
          className="max-h-33 min-h-10 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-fuchsia-400 focus:bg-white focus:ring-4 focus:ring-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white shadow-cta transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Send aria-hidden className="size-4.5" />
        </button>
      </div>
    </form>
  )
}
