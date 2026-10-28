# PrivateChat

React + TypeScript + Tailwind + Supabase (Auth, Postgres, Storage, Realtime). No Firebase, no OTP.

## Build status

| # | Screen | Built | How it is verified |
|---|--------|-------|--------------------|
| 1 | Login (email/password + Google) | yes | UI tests (mocked Supabase Auth) |
| 2 | Sign-up | yes | UI tests (mocked Supabase Auth) |
| 3 | Profile setup (photo, name, auto User ID) | yes | UI tests + real-Postgres tests for ID generation |
| 4 | Dashboard, Add User ID on top | yes | UI tests |
| 5 | Search result + Add Friend | yes | UI tests + real-Postgres tests |
| 6 | Saved contacts, online status, Message | yes | UI tests + real-Postgres tests |
| 7 | Real-time chat, history, photos | yes | UI tests (simulated realtime) + RLS tests |
| 8 | Responsive desktop sidebar / mobile tabs | yes | Browser screenshots at 1360px and 390px, no horizontal overflow |

**Not verified here:** real Supabase Auth (email + Google), Storage uploads and Realtime delivery. These need a live project, so run the checklist at the end of this file before calling the app finished.

## Database setup (required)

Open Supabase → SQL Editor → paste the whole of `supabase/migrations/001_privatechat.sql` → Run. It is safe to run again.
It creates the `pc_*` tables, Row Level Security policies, the functions the app calls, two Storage buckets (`pc-avatars` public, `pc-chat-media` private) and adds messages to the Realtime publication.

If sign-up fails with "Database error saving new user" on a project that previously ran another app, an old trigger on `auth.users` is probably failing. If that old app is abandoned, run `drop trigger if exists on_auth_user_created on auth.users;`.

## Supabase setup (auth)

Dashboard menu names change; adjust if yours differ.

1. **Create a project** at supabase.com.
2. **API keys**: Project Settings → API. Copy the Project URL and the anon / publishable key into `.env.local` (see `.env.example`). Never use the `service_role` / secret key in frontend code.
3. **Email**: Authentication → Providers → Email enabled. Keep *Confirm email* on for real use (it sends a link, not an OTP). Set minimum password length to 8. The client check is UX only.
4. **URL configuration**: Authentication → URL Configuration. Site URL `http://localhost:5173`. Add `http://localhost:5173/**` to Redirect URLs (and your production domain later).
5. **Google**: Google Cloud Console → OAuth consent screen, then Credentials → OAuth client ID (Web application).
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Paste Client ID and Secret into Supabase → Authentication → Providers → Google and enable it.
6. **Before launch**: Supabase's built-in email sender has a very low hourly limit. Configure custom SMTP (Authentication → SMTP settings).

## Run

```bash
npm install
cp .env.example .env.local     # then fill in the two values
npm run check:supabase         # confirms email + Google are enabled on your project
npm run dev                    # http://localhost:5173
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run check:supabase` | Checks your Supabase project's auth settings |

## What the tests cover

- `supabase/tests/rls.test.ts`: the real migration on a real Postgres engine (PGlite). Checks RLS, column grants, User ID generation, contact and messaging rules (you can only message saved contacts, no forged sender), read receipts, storage policies, anon denial.
- `src/test/app.test.tsx`: setup, Add User ID, search result, contacts, chat send/receive, read receipts, duplicate realtime events, failed-send retry, photo attach, unsaved senders, settings. `../lib/api` and realtime are replaced by an in-memory stand-in.
- `src/test/auth.test.tsx`, `validation.test.ts`, `config.test.tsx`: auth flows, validators, missing-env screen.

Mocked tests prove the app calls the backend correctly. They cannot prove your Supabase project is configured correctly.

## Live checklist (needs two accounts, two browsers)

1. Run the migration. Sign up account A, finish setup with a photo. Reload: photo and User ID persist.
2. Sign up account B. In A, paste B's User ID, press Find, Add Friend. B appears in Contacts.
3. A messages B. B (other browser, not reloaded) sees it instantly; A shows ✓✓ once B opens the chat.
4. Send a photo both ways; click it to enlarge.
5. B messages A before A has saved B: A sees it under "Messages from people you have not added" and cannot reply until Add.
6. Close B's tab for two minutes: A shows "Last seen …".
7. Try Google sign-in after enabling the provider.
