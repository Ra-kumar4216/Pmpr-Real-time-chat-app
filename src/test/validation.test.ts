import { describe, expect, it } from 'vitest'
import { friendlyAuthError } from '../auth/errors'
import { passwordStrength, validateEmail, validateFullName, validateLoginPassword, validateNewPassword } from '../auth/validation'

describe('validation', () => {
  it('validates email', () => {
    expect(validateEmail('')).toBe('Enter your email address')
    expect(validateEmail('   ')).toBe('Enter your email address')
    expect(validateEmail('nope')).toBe('Enter a valid email address')
    expect(validateEmail('a@b')).toBe('Enter a valid email address')
    expect(validateEmail(' ratan@example.com ')).toBeNull()
  })

  it('validates login password only for presence', () => {
    expect(validateLoginPassword('')).toBe('Enter your password')
    expect(validateLoginPassword('x')).toBeNull()
  })

  it('validates new passwords', () => {
    expect(validateNewPassword('abc1')).toBe('Use at least 8 characters')
    expect(validateNewPassword('abcdefgh')).toBe('Include at least one letter and one number')
    expect(validateNewPassword('12345678')).toBe('Include at least one letter and one number')
    expect(validateNewPassword('abcdefg1')).toBeNull()
  })

  it('validates full name', () => {
    expect(validateFullName(' a ')).toBe('Enter your full name')
    expect(validateFullName('x'.repeat(51))).toBe('Keep your name under 50 characters')
    expect(validateFullName('Ratan Kumar')).toBeNull()
  })

  it('scores password strength', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '' })
    expect(passwordStrength('abc')).toEqual({ score: 0, label: 'Too weak' })
    expect(passwordStrength('abc12345')).toEqual({ score: 1, label: 'Weak' })
    expect(passwordStrength('Abcdef12345!').label).toBe('Strong')
  })
})

describe('friendlyAuthError', () => {
  it('maps known Supabase errors', () => {
    expect(friendlyAuthError({ code: 'invalid_credentials' })).toBe('Incorrect email or password.')
    expect(friendlyAuthError({ message: 'Invalid login credentials' })).toBe('Incorrect email or password.')
    expect(friendlyAuthError({ message: 'Email not confirmed' })).toMatch(/confirm your email/i)
    expect(friendlyAuthError({ code: 'weak_password' })).toMatch(/too weak/i)
    expect(friendlyAuthError({ status: 429 })).toMatch(/too many attempts/i)
    expect(friendlyAuthError({ message: 'Unsupported provider: provider is not enabled' })).toMatch(/Google sign-in is not enabled/)
    expect(friendlyAuthError({ message: 'Failed to fetch' })).toMatch(/cannot reach the server/i)
  })

  it('never leaks raw messages for unknown errors', () => {
    expect(friendlyAuthError({ message: 'pg: relation "x" does not exist' })).toBe('Something went wrong. Please try again.')
    expect(friendlyAuthError(null)).toBe('Something went wrong. Please try again.')
  })
})
