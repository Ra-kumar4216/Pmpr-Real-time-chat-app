import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, MessageCircle, UserPlus } from 'lucide-react'
import { useRequiredProfile } from '../auth/ProfileContext'
import { useChatData } from '../chat/ChatDataContext'
import type { FoundUser } from '../lib/types'
import { Avatar } from './Avatar'
import { Modal } from './Modal'
import { useToast } from './Toast'

/** Screen 5: the person found by User ID, with Add Friend (or Message if already saved). */
export function SearchResultDialog({ found, onClose }: { found: FoundUser | null; onClose: () => void }) {
  const me = useRequiredProfile()
  const chat = useChatData()
  const toast = useToast()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSelf = found?.id === me.id
  const isContact = found ? chat.contacts.some((c) => c.id === found.id) : false

  async function add() {
    if (!found) return
    setAdding(true)
    setError(null)
    try {
      await chat.addContact(found.id)
      toast.show({ title: 'Friend added successfully!', message: `${found.display_name} has been added to your contacts.` })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add this person.')
    } finally {
      setAdding(false)
    }
  }

  function message() {
    if (!found) return
    onClose()
    navigate(`/app/chat/${found.id}`)
  }

  return (
    <Modal open={found !== null} onClose={onClose} title="Search result">
      {found && (
        <div className="text-center">
          <div className="flex justify-center">
            <Avatar name={found.display_name} path={found.avatar_path} size="xl" />
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-900">{found.display_name}</p>
          <p className="font-mono text-sm text-slate-500">@{found.user_id}</p>

          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-600">
              {error}
            </p>
          )}

          <div className="mt-6 space-y-2">
            {isSelf ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">This is your own User ID.</p>
            ) : isContact ? (
              <>
                <p className="text-sm text-emerald-700">Already in your contacts.</p>
                <button type="button" onClick={message} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white shadow-cta hover:brightness-110">
                  <MessageCircle aria-hidden className="size-4.5" />
                  Message
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void add()}
                disabled={adding}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white shadow-cta hover:brightness-110 disabled:opacity-60"
              >
                {adding ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <UserPlus aria-hidden className="size-4.5" />}
                Add Friend
              </button>
            )}
            <button type="button" onClick={onClose} className="h-10 w-full rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
