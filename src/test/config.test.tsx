import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import App from '../App'

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }))

it('shows setup help instead of a broken login when env vars are missing', () => {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <App />
    </MemoryRouter>,
  )
  expect(screen.getByRole('heading', { name: 'Supabase is not configured' })).toBeInTheDocument()
  expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument()
})
