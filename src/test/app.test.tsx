import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { Contact, Message } from '../lib/types'

/**
 * UI flows against an in-memory stand-in for ../lib/api and realtime.
 * The real database rules are covered by supabase/tests/rls.test.ts; real Supabase Auth, Storage and Realtime
 * can only be exercised against a live project.
 */
const h = vi.hoisted(() => {
  const ME = '11111111-1111-4111-8111-111111111111'
  const ASHA = '22222222-2222-4222-8222-222222222222'
  const STRANGER = '33333333-3333-4333-8333-333333333333'
  const NEWBIE = '44444444-4444-4444-8444-444444444444'
  const t0 = '2026-10-27T09:00:00.000Z'
  const person = (id: string, user_id: string, display_name: string) => ({ id, user_id, display_name, avatar_path: null, last_seen_at: new Date().toISOString() })
  const state = {
    profile: { id: ME, user_id: 'ratan_kumar_8f3k2', display_name: 'ratan', avatar_path: null as string | null, onboarded_at: t0 as string | null, last_seen_at: t0, created_at: t0 },
    users: [person(ASHA, 'asha_rao_1k2m3', 'Asha Rao'), person(STRANGER, 'sam_lee_9z8y7', 'Sam Lee'), person(NEWBIE, 'newbie_4q5w6', 'New Bie')],
    contactIds: new Set<string>(),
    messages: [] as Message[],
    listener: null as null | ((e: { type: 'INSERT' | 'UPDATE'; message: Message }) => void),
    failNextSend: false,
    seq: 0,
  }
  return { ME, ASHA, STRANGER, NEWBIE, t0, state }
})

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { auth } }))

vi.mock('../lib/image', async (orig) => ({
  ...(await orig<typeof import('../lib/image')>()),
  resizeImage: vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' })),
}))

vi.mock('../lib/realtime', () => ({
  subscribeToMessages: vi.fn((_id: string, cb: (typeof h.state)['listener']) => {
    h.state.listener = cb
    return () => {
      h.state.listener = null
    }
  }),
}))

vi.mock('../lib/api', () => {
  const s = h.state
  const asContact = (id: string): Contact => ({ ...s.users.find((u) => u.id === id)!, added_at: h.t0 })
  const between = (partner: string) => s.messages.filter((m) => (m.sender_id === h.ME && m.receiver_id === partner) || (m.sender_id === partner && m.receiver_id === h.ME))
  return {
    MESSAGE_PAGE_SIZE: 50,
    ensureProfile: vi.fn(async () => ({ ...s.profile })),
    updateProfile: vi.fn(async (p: { displayName?: string; avatarPath?: string; finishOnboarding?: boolean }) => {
      if (p.displayName) s.profile.display_name = p.displayName
      if (p.avatarPath) s.profile.avatar_path = p.avatarPath
      if (p.finishOnboarding) s.profile.onboarded_at = h.t0
      return { ...s.profile }
    }),
    heartbeat: vi.fn(async () => undefined),
    findUser: vi.fn(async (uid: string) => {
      const u = uid === s.profile.user_id ? { id: h.ME, user_id: uid, display_name: s.profile.display_name, avatar_path: null } : s.users.find((x) => x.user_id === uid)
      return u ? { id: u.id, user_id: u.user_id, display_name: u.display_name, avatar_path: u.avatar_path } : null
    }),
    addContact: vi.fn(async (id: string) => {
      s.contactIds.add(id)
      return asContact(id)
    }),
    removeContact: vi.fn(async (id: string) => void s.contactIds.delete(id)),
    listContacts: vi.fn(async () => [...s.contactIds].map(asContact)),
    getProfile: vi.fn(async (id: string) => s.users.find((u) => u.id === id) ?? null),
    getChatSummaries: vi.fn(async () => {
      const partners = new Set(s.messages.map((m) => (m.sender_id === h.ME ? m.receiver_id : m.sender_id)))
      return [...partners].map((p) => {
        const list = between(p)
        const last = list[list.length - 1]
        return {
          partner_id: p,
          last_message_id: last.id,
          last_body: last.body,
          last_has_image: Boolean(last.image_path),
          last_sender_id: last.sender_id,
          last_at: last.created_at,
          unread_count: list.filter((m) => m.receiver_id === h.ME && !m.read_at).length,
        }
      })
    }),
    getMessages: vi.fn(async (partner: string) => [...between(partner)].reverse()),
    sendMessage: vi.fn(async (receiver: string, c: { body?: string | null; imagePath?: string | null }) => {
      if (s.failNextSend) {
        s.failNextSend = false
        throw new Error('Could not send. Check your connection and try again.')
      }
      const m: Message = {
        id: `m-sent-${++s.seq}`,
        sender_id: h.ME,
        receiver_id: receiver,
        body: c.body ?? null,
        image_path: c.imagePath ?? null,
        created_at: new Date(Date.now() + s.seq).toISOString(),
        read_at: null,
      }
      s.messages.push(m)
      return m
    }),
    markRead: vi.fn(async (partner: string) => {
      let n = 0
      for (const m of s.messages) if (m.sender_id === partner && m.receiver_id === h.ME && !m.read_at) (m.read_at = new Date().toISOString()), n++
      return n
    }),
    avatarUrl: vi.fn(() => null),
    uploadAvatar: vi.fn(async (uid: string) => `${uid}/avatar-1.jpg`),
    uploadChatImage: vi.fn(async (uid: string) => `${uid}/photo-1.jpg`),
    removeAvatar: vi.fn(async () => undefined),
    getSignedImageUrl: vi.fn(async () => 'blob:signed-photo'),
    clearSignedUrlCache: vi.fn(),
  }
})

import * as api from '../lib/api'

const session = { access_token: 't', user: { id: h.ME, email: 'ratan@example.com', identities: [{ id: 'i' }] } }

function incoming(body: string, extra: Partial<Message> = {}): Message {
  return { id: `m-in-${++h.state.seq}`, sender_id: h.ASHA, receiver_id: h.ME, body, image_path: null, created_at: new Date(Date.now() + h.state.seq).toISOString(), read_at: null, ...extra }
}

const inList = () => within(screen.getByTestId('message-list'))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

/** Delivers a message the way Supabase Realtime would: stored first, then pushed to the listener. */
async function pushRealtime(m: Message, type: 'INSERT' | 'UPDATE' = 'INSERT') {
  if (type === 'INSERT') h.state.messages.push(m)
  await waitFor(() => expect(h.state.listener).not.toBeNull())
  act(() => h.state.listener!({ type, message: m }))
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.getSession.mockResolvedValue({ data: { session } })
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  auth.signOut.mockResolvedValue({ error: null })
  Object.assign(h.state.profile, { display_name: 'ratan', avatar_path: null, onboarded_at: h.t0 })
  h.state.contactIds = new Set()
  h.state.messages = []
  h.state.listener = null
  h.state.failNextSend = false
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

describe('profile setup (screen 3)', () => {
  beforeEach(() => {
    h.state.profile.onboarded_at = null
  })

  it('sends a new user to setup and shows the generated User ID', async () => {
    renderAt('/app')
    expect(await screen.findByRole('heading', { name: 'Complete your profile' })).toBeInTheDocument()
    expect(screen.getByTestId('user-id')).toHaveTextContent('ratan_kumar_8f3k2')
  })

  it('requires a display name, then finishes and opens the dashboard', async () => {
    const user = userEvent.setup()
    renderAt('/setup')
    const name = await screen.findByLabelText('Display name')
    await user.clear(name)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Enter a display name')).toBeInTheDocument()
    expect(api.updateProfile).not.toHaveBeenCalled()

    await user.type(name, 'Ratan Kumar')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/you're all set, Ratan Kumar/i)).toBeInTheDocument()
    expect(api.updateProfile).toHaveBeenCalledWith({ displayName: 'Ratan Kumar', finishOnboarding: true })

    await user.click(screen.getByRole('button', { name: 'Start Chatting' }))
    expect(await screen.findByLabelText("Friend's User ID")).toBeInTheDocument()
  })

  it('uploads a profile photo and saves its path', async () => {
    const user = userEvent.setup()
    renderAt('/setup')
    await screen.findByLabelText('Display name')
    const file = new File(['img'], 'me.png', { type: 'image/png' })
    await user.upload(screen.getByTestId('avatar-input'), file)
    await waitFor(() => expect(api.uploadAvatar).toHaveBeenCalledWith(h.ME, expect.any(Blob)))
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ avatarPath: `${h.ME}/avatar-1.jpg` }))
  })

  it('rejects a non-image photo without uploading', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderAt('/setup')
    await screen.findByLabelText('Display name')
    await user.upload(screen.getByTestId('avatar-input'), new File(['x'], 'doc.pdf', { type: 'application/pdf' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(api.uploadAvatar).not.toHaveBeenCalled()
  })
})

describe('add by User ID (screens 4 and 5)', () => {
  it('keeps the Add User ID box at the very top of the dashboard', async () => {
    renderAt('/app')
    const box = await screen.findByLabelText("Friend's User ID")
    const main = screen.getAllByRole('main')[0]
    const first = main.querySelector('section')
    expect(first).toContainElement(box)
  })

  it('validates the format before searching', async () => {
    const user = userEvent.setup()
    renderAt('/app')
    await user.type(await screen.findByLabelText("Friend's User ID"), 'no')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    expect(screen.getByText(/doesn't look like a User ID/i)).toBeInTheDocument()
    expect(api.findUser).not.toHaveBeenCalled()
  })

  it('reports an unknown User ID', async () => {
    const user = userEvent.setup()
    renderAt('/app')
    await user.type(await screen.findByLabelText("Friend's User ID"), 'ghost_user_00000')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    expect(await screen.findByText('No user found with that ID.')).toBeInTheDocument()
  })

  it('normalises @ and capitals, shows the result, and adds the friend', async () => {
    const user = userEvent.setup()
    renderAt('/app')
    await user.type(await screen.findByLabelText("Friend's User ID"), '  @Asha_Rao_1K2M3 ')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    expect(api.findUser).toHaveBeenCalledWith('asha_rao_1k2m3')

    const dialog = await screen.findByRole('dialog', { name: 'Search result' })
    expect(within(dialog).getByText('Asha Rao')).toBeInTheDocument()
    expect(within(dialog).getByText('@asha_rao_1k2m3')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Add Friend' }))

    expect(await screen.findByText('Friend added successfully!')).toBeInTheDocument()
    expect(api.addContact).toHaveBeenCalledWith(h.ASHA)
    expect(await within(dialog).findByRole('button', { name: 'Message' })).toBeInTheDocument()
  })

  it('does not offer Add Friend for yourself', async () => {
    const user = userEvent.setup()
    renderAt('/app')
    await user.type(await screen.findByLabelText("Friend's User ID"), 'ratan_kumar_8f3k2')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    const dialog = await screen.findByRole('dialog', { name: 'Search result' })
    expect(within(dialog).getByText(/your own user id/i)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Add Friend' })).not.toBeInTheDocument()
  })

  it('shows "Already in your contacts" for a saved person', async () => {
    h.state.contactIds.add(h.ASHA)
    const user = userEvent.setup()
    renderAt('/app')
    await user.type(await screen.findByLabelText("Friend's User ID"), 'asha_rao_1k2m3')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    const dialog = await screen.findByRole('dialog', { name: 'Search result' })
    expect(within(dialog).getByText(/already in your contacts/i)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Add Friend' })).not.toBeInTheDocument()
  })
})

describe('saved contacts (screen 6)', () => {
  it('lists contacts with presence and a Message button, and removes one after confirmation', async () => {
    h.state.contactIds.add(h.ASHA)
    const user = userEvent.setup()
    renderAt('/app/contacts')
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument()
    expect(screen.getByText('@asha_rao_1k2m3')).toBeInTheDocument()
    expect(screen.getByTestId('presence-online')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Message/ })).toHaveAttribute('href', `/app/chat/${h.ASHA}`)

    await user.click(screen.getByRole('button', { name: /More options for Asha Rao/ }))
    await user.click(screen.getByRole('button', { name: 'Remove contact' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove contact?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(api.removeContact).toHaveBeenCalledWith(h.ASHA))
    expect(await screen.findByText('No saved contacts yet')).toBeInTheDocument()
  })

  it('shows an honest empty state, not sample people', async () => {
    renderAt('/app/contacts')
    expect(await screen.findByText('No saved contacts yet')).toBeInTheDocument()
  })

  it('filters contacts by name or User ID', async () => {
    h.state.contactIds.add(h.ASHA)
    h.state.contactIds.add(h.NEWBIE)
    const user = userEvent.setup()
    renderAt('/app/contacts')
    await screen.findByText('Asha Rao')
    await user.type(screen.getByLabelText('Search contacts'), 'newbie')
    expect(screen.queryByText('Asha Rao')).not.toBeInTheDocument()
    expect(screen.getByText('New Bie')).toBeInTheDocument()
  })
})

describe('real-time private chat (screen 7)', () => {
  beforeEach(() => {
    h.state.contactIds.add(h.ASHA)
  })

  it('shows history with a day separator, timestamps and read receipts', async () => {
    h.state.messages = [
      incoming('Hi Ratan', { id: 'h1', created_at: '2026-10-20T08:00:00.000Z', read_at: '2026-10-20T08:01:00.000Z' }),
      { id: 'h2', sender_id: h.ME, receiver_id: h.ASHA, body: 'Hello Asha', image_path: null, created_at: '2026-10-20T08:02:00.000Z', read_at: '2026-10-20T08:03:00.000Z' },
      { id: 'h3', sender_id: h.ME, receiver_id: h.ASHA, body: 'Are you there?', image_path: null, created_at: '2026-10-20T08:04:00.000Z', read_at: null },
    ]
    renderAt(`/app/chat/${h.ASHA}`)
    const list = await screen.findByTestId('message-list')
    await within(list).findByText('Hello Asha')
    expect(within(list).getAllByTestId('message')).toHaveLength(3)
    expect(within(list).getAllByRole('separator')).toHaveLength(1)
    expect(list.querySelectorAll('time')).toHaveLength(3)
    expect(within(list).getAllByRole('img', { name: 'Read' })).toHaveLength(1)
    expect(within(list).getAllByRole('img', { name: 'Sent' })).toHaveLength(1)
  })

  it('sends with Enter, keeps Shift+Enter for new lines, and ignores empty input', async () => {
    const user = userEvent.setup()
    renderAt(`/app/chat/${h.ASHA}`)
    const box = await screen.findByLabelText('Message')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()

    await user.type(box, 'line one{Shift>}{Enter}{/Shift}line two')
    expect(api.sendMessage).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith(h.ASHA, { body: 'line one\nline two', imagePath: null }))
    expect(await within(await screen.findByTestId('message-list')).findByText(/line one/)).toBeInTheDocument()
    expect(box).toHaveValue('')
  })

  it('shows an incoming message instantly via realtime and marks it read', async () => {
    renderAt(`/app/chat/${h.ASHA}`)
    await screen.findByLabelText('Message')
    await screen.findByText(/No messages yet/)
    await pushRealtime(incoming('Live from Asha'))
    expect(await within(await screen.findByTestId('message-list')).findByText('Live from Asha')).toBeInTheDocument()
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith(h.ASHA))
  })

  it('updates a sent message to "Read" when the other person reads it', async () => {
    const user = userEvent.setup()
    renderAt(`/app/chat/${h.ASHA}`)
    await user.type(await screen.findByLabelText('Message'), 'ping{Enter}')
    await screen.findByRole('img', { name: 'Sent' })
    const sent = h.state.messages.find((m) => m.body === 'ping')!
    await pushRealtime({ ...sent, read_at: new Date().toISOString() }, 'UPDATE')
    expect(await screen.findByRole('img', { name: 'Read' })).toBeInTheDocument()
  })

  it('does not show the same message twice when realtime echoes your own send', async () => {
    const user = userEvent.setup()
    renderAt(`/app/chat/${h.ASHA}`)
    await user.type(await screen.findByLabelText('Message'), 'once{Enter}')
    await within(await screen.findByTestId('message-list')).findByText('once')
    const sent = h.state.messages.find((m) => m.body === 'once')!
    await pushRealtime(sent)
    expect(inList().getAllByText('once')).toHaveLength(1)
  })

  it('lets a failed message be retried', async () => {
    h.state.failNextSend = true
    const user = userEvent.setup()
    renderAt(`/app/chat/${h.ASHA}`)
    await user.type(await screen.findByLabelText('Message'), 'flaky{Enter}')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not send/i)
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByTestId('pending-message')).not.toBeInTheDocument())
    expect(screen.getAllByTestId('message')).toHaveLength(1)
    expect(api.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('attaches a photo, uploads it to storage and sends its path', async () => {
    const user = userEvent.setup()
    renderAt(`/app/chat/${h.ASHA}`)
    await screen.findByLabelText('Message')
    await user.upload(screen.getByTestId('photo-input'), new File(['img'], 'cat.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByAltText('Photo ready to send')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Message'), 'look!{Enter}')
    await waitFor(() => expect(api.uploadChatImage).toHaveBeenCalledWith(h.ME, expect.any(Blob)))
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith(h.ASHA, { body: 'look!', imagePath: `${h.ME}/photo-1.jpg` }))
    expect(await screen.findByAltText('Photo shared in this chat')).toHaveAttribute('src', 'blob:signed-photo')
  })

  it('refuses a non-image attachment', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderAt(`/app/chat/${h.ASHA}`)
    await screen.findByLabelText('Message')
    await user.upload(screen.getByTestId('photo-input'), new File(['x'], 'a.exe', { type: 'application/octet-stream' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByAltText('Photo ready to send')).not.toBeInTheDocument()
  })

  it('shows unread counts on the dashboard and clears them after opening the chat', async () => {
    h.state.messages = [incoming('one'), incoming('two')]
    const user = userEvent.setup()
    renderAt('/app')
    const unread = await screen.findAllByLabelText('2 unread')
    expect(unread.length).toBeGreaterThan(0)
    await user.click(screen.getByRole('link', { name: /Asha Rao/ }))
    await within(await screen.findByTestId('message-list')).findByText('two')
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith(h.ASHA))
    await waitFor(() => expect(screen.queryAllByLabelText('2 unread')).toHaveLength(0))
  })

  it('counts a message once even if realtime delivers it twice (chat not open)', async () => {
    renderAt('/app')
    await screen.findByLabelText("Friend's User ID")
    const m = incoming('dup')
    await pushRealtime(m)
    act(() => h.state.listener!({ type: 'INSERT', message: m }))
    expect((await screen.findAllByLabelText('1 unread')).length).toBeGreaterThan(0)
    expect(screen.queryAllByLabelText('2 unread')).toHaveLength(0)
    expect(screen.queryByText('Messages from people you have not added')).not.toBeInTheDocument()
  })

  it('disables the composer for someone you have not saved, and lets you add them', async () => {
    h.state.contactIds.clear()
    h.state.messages = [{ ...incoming('psst'), sender_id: h.STRANGER }]
    const user = userEvent.setup()
    renderAt(`/app/chat/${h.STRANGER}`)
    expect(await screen.findByText(/Sam Lee is not in your contacts/)).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Add Friend' }))
    await waitFor(() => expect(screen.getByLabelText('Message')).toBeEnabled())
    expect(api.addContact).toHaveBeenCalledWith(h.STRANGER)
  })

  it('shows "Chat not found" for an unknown conversation', async () => {
    renderAt(`/app/chat/${'99999999-9999-4999-8999-999999999999'}`)
    expect(await screen.findByRole('heading', { name: 'Chat not found' })).toBeInTheDocument()
    renderAt('/app/chat/not-a-uuid')
  })
})

describe('settings', () => {
  it('shows the User ID and saves a changed display name', async () => {
    const user = userEvent.setup()
    renderAt('/app/settings')
    expect(await screen.findByTestId('user-id')).toHaveTextContent('ratan_kumar_8f3k2')
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    const name = screen.getByLabelText('Display name')
    await user.clear(name)
    await user.type(name, 'Ratan K')
    await user.click(save)
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ displayName: 'Ratan K' }))
  })
})
