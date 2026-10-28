// Client-side checks are for UX only. The real rules are enforced by Supabase (Auth settings + RLS).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(value: string): string | null {
  const email = value.trim()
  if (!email) return 'Enter your email address'
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address'
  return null
}

export function validateLoginPassword(value: string): string | null {
  return value ? null : 'Enter your password'
}

export function validateNewPassword(value: string): string | null {
  if (value.length < 8) return 'Use at least 8 characters'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Include at least one letter and one number'
  return null
}

export function validateFullName(value: string): string | null {
  const name = value.trim()
  if (name.length < 2) return 'Enter your full name'
  if (name.length > 50) return 'Keep your name under 50 characters'
  return null
}

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string }

const LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const

export function passwordStrength(value: string): Strength {
  if (!value) return { score: 0, label: '' }
  let score = 0
  if (value.length >= 8) score++
  if (value.length >= 12) score++
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++
  return { score: score as Strength['score'], label: LABELS[score] }
}
