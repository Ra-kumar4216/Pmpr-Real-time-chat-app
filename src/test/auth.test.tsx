import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  resend: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { auth } }))

// After login the app loads the profile and chats through ../lib/api; these tests only care about routing.
vi.mock('../lib/api', () => ({
  ensureProfile: vi.fn(async () => ({
    id: 'u1', user_id: 'ratan_kumar_8f3k2', display_name: 'Ratan Kumar', avatar_path: null,
    onboarded_at: '2026-01-01T00:00:00Z', last_seen_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
  })),
  heartbeat: vi.fn(async () => undefined),
  listContacts: vi.fn(async () => []),
  getChatSummaries: vi.fn(async () => []),
  getProfile: vi.fn(async () => null),
  avatarUrl: vi.fn(() => null),
}))
vi.mock('../lib/realtime', () => ({ subscribeToMessages: vi.fn(() => () => undefined) }))

const EMAIL = 'ratan@example.com'
const session = { access_token: 't', user: { id: 'u1', email: EMAIL, identities: [{ id: 'i1' }] } }

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  auth.signOut.mockResolvedValue({ error: null })
})

describe('route guards', () => {
  it('sends signed-out visitors to the login page', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument()
  })

  it('sends signed-in users away from login', async () => {
    auth.getSession.mockResolvedValue({ data: { session } })
    renderAt('/login')
    expect(await screen.findByRole('heading', { name: 'Chats' })).toBeInTheDocument()
    expect(screen.getByLabelText("Friend's User ID")).toBeInTheDocument()
  })

  it('signs out and returns to login', async () => {
    auth.getSession.mockResolvedValue({ data: { session } })
    const user = userEvent.setup()
    renderAt('/')
    await user.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument()
  })
})

describe('login page', () => {
  it('shows field errors and does not call Supabase when empty', async () => {
    const user = userEvent.setup()
    renderAt('/login')
    await user.click(await screen.findByRole('button', { name: 'Login' }))
    expect(screen.getByText('Enter your email address')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('rejects a malformed email', async () => {
    const user = userEvent.setup()
    renderAt('/login')
    await user.type(await screen.findByLabelText('Email address'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'whatever1')
    await user.click(screen.getByRole('button', { name: 'Login' }))
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('logs in with email and password', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session, user: session.user }, error: null })
    const user = userEvent.setup()
    renderAt('/login')
    await user.type(await screen.findByLabelText('Email address'), EMAIL)
    await user.type(screen.getByLabelText('Password'), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByRole('heading', { name: 'Chats' })).toBeInTheDocument()
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: EMAIL, password: 'hunter22' })
  })

  it('shows a friendly message for wrong credentials', async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 },
    })
    const user = userEvent.setup()
    renderAt('/login')
    await user.type(await screen.findByLabelText('Email address'), EMAIL)
    await user.type(screen.getByLabelText('Password'), 'wrongpass1')
    await user.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled()
  })

  it('starts Google sign-in with the right provider and redirect', async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error: null })
    const user = userEvent.setup()
    renderAt('/login')
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  })

  it('explains when the Google provider is not enabled', async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: {},
      error: { message: 'Unsupported provider: provider is not enabled', status: 400 },
    })
    const user = userEvent.setup()
    renderAt('/login')
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByText(/Google sign-in is not enabled/)).toBeInTheDocument()
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    renderAt('/login')
    const input = await screen.findByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })

  it('navigates to sign-up', async () => {
    const user = userEvent.setup()
    renderAt('/login')
    await user.click((await screen.findAllByRole('link', { name: /sign up/i }))[0])
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
  })
})

describe('sign-up page', () => {
  async function fillForm(user: ReturnType<typeof userEvent.setup>, password = 'Hunter2222') {
    await user.type(await screen.findByLabelText('Full name'), 'Ratan Kumar')
    await user.type(screen.getByLabelText('Email address'), EMAIL)
    await user.type(screen.getByLabelText('Password'), password)
  }

  it('shows field errors and does not call Supabase when empty', async () => {
    const user = userEvent.setup()
    renderAt('/signup')
    await user.click(await screen.findByRole('button', { name: 'Sign up' }))
    expect(screen.getByText('Enter your full name')).toBeInTheDocument()
    expect(screen.getByText('Enter your email address')).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument()
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('requires a letter and a number in the password', async () => {
    const user = userEvent.setup()
    renderAt('/signup')
    await fillForm(user, 'abcdefgh')
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(screen.getByText('Include at least one letter and one number')).toBeInTheDocument()
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('updates the strength meter as you type', async () => {
    const user = userEvent.setup()
    renderAt('/signup')
    await user.type(await screen.findByLabelText('Password'), 'Abcdef12345!')
    expect(screen.getByText('Strong')).toBeInTheDocument()
  })

  it('asks the user to confirm their email, and can resend', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u2', identities: [{ id: 'i' }] }, session: null }, error: null })
    auth.resend.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    renderAt('/signup')
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
    expect(auth.signUp).toHaveBeenCalledWith({
      email: EMAIL,
      password: 'Hunter2222',
      options: { data: { full_name: 'Ratan Kumar', name: 'Ratan Kumar' }, emailRedirectTo: window.location.origin },
    })

    await user.click(screen.getByRole('button', { name: 'Resend email' }))
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: EMAIL, options: { emailRedirectTo: window.location.origin } })
    expect(await screen.findByText('Confirmation email sent again.')).toBeInTheDocument()
  })

  it('signs the user in directly when confirmation is off', async () => {
    auth.signUp.mockResolvedValue({ data: { user: session.user, session }, error: null })
    const user = userEvent.setup()
    renderAt('/signup')
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByRole('heading', { name: 'Chats' })).toBeInTheDocument()
  })

  it('detects an email that is already registered', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: 'x', identities: [] }, session: null }, error: null })
    const user = userEvent.setup()
    renderAt('/signup')
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument()
  })

  it('shows a friendly error when the server rejects the password', async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Password should be at least 6 characters', code: 'weak_password', status: 422 } })
    const user = userEvent.setup()
    renderAt('/signup')
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByText(/too weak/i)).toBeInTheDocument()
  })

  it('starts Google sign-in', async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error: null })
    const user = userEvent.setup()
    renderAt('/signup')
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: window.location.origin } })
  })
})
