#!/usr/bin/env node
// Verifies your Supabase project is set up for PrivateChat auth. Run: npm run check:supabase
import { existsSync, readFileSync } from 'node:fs'

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

function jwtRole(key) {
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).role
  } catch {
    return null
  }
}

function die(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local'), ...process.env }
const url = env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
const key = env.VITE_SUPABASE_ANON_KEY

if (!url || !key) die('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing. Copy .env.example to .env.local and fill it in.')
if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
  die('That key is a SECRET (service_role) key. Never put it in frontend code. Use the anon / publishable key.')
}

let res
try {
  res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
} catch (e) {
  die(`Cannot reach ${url} (${e.message}). Check VITE_SUPABASE_URL.`)
}
if (!res.ok) die(`Auth settings request failed with HTTP ${res.status}. Check the URL and the anon key.`)

const s = await res.json()
const ext = s.external ?? {}
const checks = [
  ['Email provider enabled', ext.email === true, 'Authentication → Providers → Email'],
  ['Google provider enabled', ext.google === true, 'Authentication → Providers → Google (needs Client ID + Secret)'],
  ['Sign-ups allowed', s.disable_signup !== true, 'Authentication → Sign In / Providers → allow new users'],
]

let failed = 0
console.log(`Project: ${url}`)
for (const [label, ok, where] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `  → fix in: ${where}`}`)
  if (!ok) failed++
}
console.log(
  `• Email confirmation: ${s.mailer_autoconfirm ? 'OFF (users sign in immediately, fine for dev only)' : 'ON (users must click the emailed link)'}`,
)
console.log('• Still check by hand: Site URL and Redirect URLs (Authentication → URL Configuration). The API cannot report them.')
process.exit(failed ? 1 : 0)
