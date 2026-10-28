// @vitest-environment node
//
// Runs supabase/migrations/001_privatechat.sql on a REAL Postgres (PGlite = Postgres compiled to WASM)
// and attacks it the way a malicious client would: through the same roles Supabase uses (anon / authenticated)
// with RLS on. Supabase's own pieces (auth.uid(), the storage schema, roles) are stubbed to match its behaviour.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const MIGRATION = readFileSync(resolve(__dirname, '../migrations/001_privatechat.sql'), 'utf8')

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const D = '00000000-0000-4000-8000-00000000000d' // exists in auth.users but never opens PrivateChat

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase's defaults are generous: new tables/functions in public are open to anon + authenticated.
  -- The migration must tighten this itself, so the test starts from the generous defaults.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false,
                                file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(),
                                bucket_id text references storage.buckets (id), name text,
                                owner uuid default auth.uid(), unique (bucket_id, name));
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on all tables in schema storage to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;

  create publication supabase_realtime;
`

let db: PGlite

async function as<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

const rows = async <R = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  await db.exec(MIGRATION)
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${A}', 'ratan@example.com', '{"full_name":"Ratan Kumar"}'),
      ('${B}', 'priya@example.com', '{"name":"Priya Sharma"}'),
      ('${C}', 'carol.smith@example.com', '{}'),
      ('${D}', 'dormant@example.com', '{"full_name":"Dormant"}');
  `)
  for (const u of [A, B, C]) {
    await as(u, () => rows('select * from pc_ensure_profile()'))
    await as(u, () => rows('select * from pc_update_profile(p_finish_onboarding => true)'))
  }
}, 60_000)

afterAll(async () => {
  await db.close()
})

describe('migration', () => {
  it('can be run twice without errors', async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined()
  })

  it('creates private buckets with size and type limits', async () => {
    const b = await rows<{ id: string; public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id like 'pc-%' order by id`,
    )
    expect(b.map((x) => [x.id, x.public])).toEqual([['pc-avatars', true], ['pc-chat-media', false]])
    expect(b.every((x) => Number(x.file_size_limit) > 0 && x.allowed_mime_types.includes('image/jpeg'))).toBe(true)
    expect(b.every((x) => !x.allowed_mime_types.includes('image/svg+xml'))).toBe(true)
  })

  it('publishes pc_messages to Realtime', async () => {
    const t = await rows(`select tablename from pg_publication_tables where pubname='supabase_realtime'`)
    expect(t).toContainEqual({ tablename: 'pc_messages' })
  })
})

describe('profiles and the auto-generated User ID', () => {
  it('derives the ID from the name and adds a random suffix', async () => {
    const [p] = await as(A, () => rows<{ user_id: string; display_name: string }>('select * from pc_ensure_profile()'))
    expect(p.user_id).toMatch(/^ratan_kumar_[a-z0-9]{5}$/)
    expect(p.display_name).toBe('Ratan Kumar')
  })

  it('is idempotent: calling again returns the same profile', async () => {
    const one = await as(A, () => rows<{ user_id: string }>('select * from pc_ensure_profile()'))
    const two = await as(A, () => rows<{ user_id: string }>('select * from pc_ensure_profile()'))
    expect(one[0].user_id).toBe(two[0].user_id)
    expect(await rows(`select 1 from pc_profiles where id='${A}'`)).toHaveLength(1)
  })

  it('falls back to metadata "name", then the email prefix', async () => {
    const all = await rows<{ id: string; display_name: string; user_id: string }>('select id, display_name, user_id from pc_profiles')
    expect(all.find((p) => p.id === B)?.user_id).toMatch(/^priya_sharma_/)
    expect(all.find((p) => p.id === C)?.display_name).toBe('carol.smith')
    expect(all.find((p) => p.id === C)?.user_id).toMatch(/^carol_smith_/)
  })

  it('does not create a profile for people who never open PrivateChat', async () => {
    expect(await rows(`select 1 from pc_profiles where id='${D}'`)).toHaveLength(0)
  })

  it('handles names with no latin letters', async () => {
    const id = '00000000-0000-4000-8000-0000000000e1'
    await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${id}', null, '{"full_name":"रतन कुमार"}')`)
    const [p] = await as(id, () => rows<{ user_id: string; display_name: string }>('select * from pc_ensure_profile()'))
    expect(p.user_id).toMatch(/^user_[a-z0-9]{5}$/)
    expect(p.display_name).toBe('रतन कुमार')
  })

  it('never hands out the same ID twice, even for identical names', async () => {
    const ids: string[] = []
    for (let i = 0; i < 60; i++) {
      const id = `00000000-0000-4000-8000-${(0xf000 + i).toString(16).padStart(12, '0')}`
      await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${id}', null, '{"full_name":"Sam Lee"}')`)
      const [p] = await as(id, () => rows<{ user_id: string }>('select * from pc_ensure_profile()'))
      ids.push(p.user_id)
    }
    expect(new Set(ids).size).toBe(60)
    expect(ids.every((x) => /^sam_lee_[a-z0-9]{5}$/.test(x))).toBe(true)
  }, 60_000)

  it('rejects anonymous and token-less callers', async () => {
    await expect(as(null, () => rows('select * from pc_ensure_profile()'))).rejects.toThrow(/permission denied/i)
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','',false);`)
    await expect(db.query('select * from pc_ensure_profile()')).rejects.toThrow(/not authenticated/i)
    await db.exec('reset role')
  })

  it('keeps the ID generator internal', async () => {
    await expect(as(A, () => rows(`select pc_generate_user_id('x')`))).rejects.toThrow(/permission denied/i)
  })

  it('never lets a user edit user_id, id, or last_seen_at', async () => {
    for (const col of ['user_id', 'id', 'last_seen_at', 'created_at']) {
      const val = col === 'last_seen_at' || col === 'created_at' ? 'now()' : col === 'id' ? `'${B}'` : `'hacked_id'`
      await expect(as(A, () => rows(`update pc_profiles set ${col} = ${val} where id = '${A}'`))).rejects.toThrow(/permission denied/i)
    }
  })

  it('lets users edit only their own display name, photo and onboarding', async () => {
    const [p] = await as(A, () => rows<{ display_name: string }>(`select * from pc_update_profile(p_display_name => '  Ratan K  ')`))
    expect(p.display_name).toBe('Ratan K')
    const own = await as(A, () => rows(`select * from pc_update_profile(p_avatar_path => '${A}/me.jpg')`))
    expect(own[0]).toMatchObject({ avatar_path: `${A}/me.jpg` })
    const cleared = await as(A, () => rows(`select * from pc_update_profile(p_clear_avatar => true)`))
    expect(cleared[0]).toMatchObject({ avatar_path: null })
    await as(A, () => rows(`select * from pc_update_profile(p_display_name => 'Ratan Kumar')`))
  })

  it('refuses a 51-character name and an avatar in someone else\'s folder', async () => {
    await expect(as(A, () => rows(`select * from pc_update_profile(p_display_name => '${'x'.repeat(51)}')`))).rejects.toThrow(/pc_profiles_display_name_len/)
    await expect(as(A, () => rows(`select * from pc_update_profile(p_avatar_path => '${B}/stolen.jpg')`))).rejects.toThrow(/row-level security/i)
    // RLS runs before the CHECK constraint, so a path outside your folder is stopped by RLS first.
    await expect(as(A, () => rows(`select * from pc_update_profile(p_avatar_path => '../../etc/passwd')`))).rejects.toThrow(/row-level security|avatar_path_fmt/)
    await expect(as(A, () => rows(`select * from pc_update_profile(p_avatar_path => '${A}/../x.jpg')`))).rejects.toThrow(/avatar_path_fmt/)
  })

  it('cannot change another user\'s profile with a direct UPDATE', async () => {
    const r = await as(A, () => db.query(`update pc_profiles set display_name = 'pwned' where id = '${B}'`))
    expect(r.affectedRows).toBe(0)
    expect((await rows<{ display_name: string }>(`select display_name from pc_profiles where id='${B}'`))[0].display_name).toBe('Priya Sharma')
  })

  it('sets onboarded_at only once', async () => {
    const before = (await rows<{ onboarded_at: string }>(`select onboarded_at from pc_profiles where id='${A}'`))[0].onboarded_at
    await as(A, () => rows('select * from pc_update_profile(p_finish_onboarding => true)'))
    const after = (await rows<{ onboarded_at: string }>(`select onboarded_at from pc_profiles where id='${A}'`))[0].onboarded_at
    expect(after).toEqual(before)
  })
})

describe('visibility, search and contacts', () => {
  it('hides other users until you are connected', async () => {
    const seen = await as(A, () => rows<{ id: string }>('select id from pc_profiles'))
    expect(seen.map((r) => r.id)).toEqual([A])
    expect(await as(A, () => rows(`select * from pc_get_profile('${B}')`))).toHaveLength(0)
  })

  it('finds a user only by exact ID (case and @ tolerant) and never lists anyone', async () => {
    const bId = (await rows<{ user_id: string }>(`select user_id from pc_profiles where id='${B}'`))[0].user_id
    const hit = await as(A, () => rows<{ id: string }>(`select * from pc_find_user('@${bId.toUpperCase()}')`))
    expect(hit).toHaveLength(1)
    expect(hit[0].id).toBe(B)
    expect(Object.keys(hit[0]).sort()).toEqual(['avatar_path', 'display_name', 'id', 'user_id'])
    expect(await as(A, () => rows(`select * from pc_find_user('priya')`))).toHaveLength(0)
    expect(await as(A, () => rows(`select * from pc_find_user('')`))).toHaveLength(0)
    expect(await as(A, () => rows(`select * from pc_find_user('%')`))).toHaveLength(0)
    await expect(as(null, () => rows(`select * from pc_find_user('${bId}')`))).rejects.toThrow(/permission denied/i)
  })

  it('does not expose users who have not finished setup', async () => {
    const e = '00000000-0000-4000-8000-0000000000e2'
    await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${e}', 'half@example.com', '{"full_name":"Half Done"}')`)
    const [p] = await as(e, () => rows<{ user_id: string }>('select * from pc_ensure_profile()'))
    expect(await as(A, () => rows(`select * from pc_find_user('${p.user_id}')`))).toHaveLength(0)
    await expect(as(A, () => rows(`select * from pc_add_contact('${e}')`))).rejects.toThrow(/user not found/)
  })

  it('rejects adding yourself, unknown ids and never-onboarded users', async () => {
    await expect(as(A, () => rows(`select * from pc_add_contact('${A}')`))).rejects.toThrow(/cannot add yourself/)
    await expect(as(A, () => rows(`select * from pc_add_contact('${'1'.repeat(8)}-1111-4111-8111-111111111111')`))).rejects.toThrow(/user not found/)
    await expect(as(A, () => rows(`select * from pc_add_contact('${D}')`))).rejects.toThrow(/user not found/)
  })

  it('blocks writing to pc_contacts directly (only pc_add_contact may add)', async () => {
    await expect(as(A, () => rows(`insert into pc_contacts (owner_id, contact_id) values ('${A}', '${B}')`))).rejects.toThrow(/permission denied/i)
  })

  it('adds a contact once, returns the profile, and then reveals only that profile', async () => {
    const first = await as(A, () => rows<{ id: string; user_id: string }>(`select * from pc_add_contact('${B}')`))
    const again = await as(A, () => rows(`select * from pc_add_contact('${B}')`))
    expect(first[0].id).toBe(B)
    expect(again).toHaveLength(1)
    expect(await rows(`select 1 from pc_contacts where owner_id='${A}'`)).toHaveLength(1)

    const list = await as(A, () => rows<{ id: string }>('select * from pc_list_contacts()'))
    expect(list.map((r) => r.id)).toEqual([B])
    expect(await as(A, () => rows(`select * from pc_get_profile('${B}')`))).toHaveLength(1)
    expect(await as(A, () => rows(`select * from pc_get_profile('${C}')`))).toHaveLength(0)
  })

  it('does not reveal the contact list or that you were added to anyone else', async () => {
    expect(await as(B, () => rows('select * from pc_contacts'))).toHaveLength(0)
    expect(await as(C, () => rows('select * from pc_contacts'))).toHaveLength(0)
    expect(await as(B, () => rows(`select * from pc_get_profile('${A}')`))).toHaveLength(0)
    expect(await as(B, () => rows('select * from pc_list_contacts()'))).toHaveLength(0)
  })

  it('removes only your own contact rows', async () => {
    await as(C, () => rows(`select pc_remove_contact('${B}')`))
    expect(await rows(`select 1 from pc_contacts where owner_id='${A}'`)).toHaveLength(1)
    await as(A, () => rows(`select * from pc_add_contact('${C}')`))
    await as(A, () => rows(`select pc_remove_contact('${C}')`))
    expect(await rows(`select 1 from pc_contacts where owner_id='${A}' and contact_id='${C}'`)).toHaveLength(0)
  })
})

describe('messages', () => {
  const send = (uid: string, to: string, body: string | null, img: string | null = null) =>
    as(uid, () => rows<{ id: string; sender_id: string; body: string | null }>('select * from pc_send_message($1, $2, $3)', [to, body, img]))

  it('refuses to message someone you have not saved', async () => {
    await expect(send(A, C, 'hi stranger')).rejects.toThrow(/row-level security/i)
    expect(await rows(`select 1 from pc_messages`)).toHaveLength(0)
  })

  it('sends to a saved contact; sender is forced to be you', async () => {
    const [m] = await send(A, B, '  hello Priya  ')
    expect(m.sender_id).toBe(A)
    expect(m.body).toBe('hello Priya')
  })

  it('cannot be tricked into spoofing the sender with a direct INSERT', async () => {
    await expect(
      as(A, () => rows(`insert into pc_messages (sender_id, receiver_id, body) values ('${B}', '${A}', 'forged')`)),
    ).rejects.toThrow(/row-level security/i)
    await expect(
      as(C, () => rows(`insert into pc_messages (sender_id, receiver_id, body) values ('${A}', '${B}', 'forged')`)),
    ).rejects.toThrow(/row-level security/i)

    // The sharp case: the contact rule PASSES (A saved C) and only the sender check stands in the way
    // of A writing a message that appears to come from B.
    await as(A, () => rows(`select * from pc_add_contact('${C}')`))
    await expect(
      as(A, () => rows(`insert into pc_messages (sender_id, receiver_id, body) values ('${B}', '${C}', 'B says hi (forged by A)')`)),
    ).rejects.toThrow(/row-level security/i)
    expect(await rows(`select 1 from pc_messages where body like '%forged%'`)).toHaveLength(0)
  })

  it('validates content: empty, whitespace, too long, self, and foreign image paths', async () => {
    await expect(send(A, B, null)).rejects.toThrow(/has_content/)
    await expect(send(A, B, '    ')).rejects.toThrow(/has_content/)
    await expect(send(A, B, 'x'.repeat(4001))).rejects.toThrow(/body_len/)
    await expect(send(A, A, 'me')).rejects.toThrow()
    await expect(send(A, B, 'pic', `${B}/other.jpg`)).rejects.toThrow(/row-level security/i)
    await expect(send(A, B, 'pic', `${A}/../x.jpg`)).rejects.toThrow(/image_path/)
    expect((await send(A, B, 'x'.repeat(4000)))[0].body).toHaveLength(4000)
  })

  it('shows messages to sender and receiver only', async () => {
    expect((await as(A, () => rows('select * from pc_messages'))).length).toBeGreaterThan(0)
    // B received them; B can read once the message exists, via the message rule.
    expect((await as(B, () => rows('select * from pc_messages'))).length).toBeGreaterThan(0)
    expect(await as(C, () => rows('select * from pc_messages'))).toHaveLength(0)
    expect(await as(C, () => rows(`select * from pc_get_messages('${A}')`))).toHaveLength(0)
    await expect(as(null, () => rows('select * from pc_messages'))).rejects.toThrow(/permission denied/i)
  })

  it('lets the receiver see the sender\'s profile, but not reply until they save them', async () => {
    expect(await as(B, () => rows(`select * from pc_get_profile('${A}')`))).toHaveLength(1)
    await expect(send(B, A, 'reply before saving')).rejects.toThrow(/row-level security/i)
    await as(B, () => rows(`select * from pc_add_contact('${A}')`))
    expect((await send(B, A, 'now I can reply'))[0].sender_id).toBe(B)
  })

  it('cannot edit or delete messages (no update/delete privilege)', async () => {
    await expect(as(A, () => rows(`update pc_messages set body = 'edited'`))).rejects.toThrow(/permission denied/i)
    await expect(as(A, () => rows(`update pc_messages set read_at = now()`))).rejects.toThrow(/permission denied/i)
    await expect(as(A, () => rows(`delete from pc_messages`))).rejects.toThrow(/permission denied/i)
  })

  it('pages history newest-first, only within the chosen conversation', async () => {
    await as(A, () => rows(`select * from pc_add_contact('${C}')`))
    await send(A, C, 'to carol')
    const all = await as(A, () => rows<{ body: string; created_at: string }>(`select * from pc_get_messages('${B}', null, 200)`))
    expect(all.every((m) => m.body !== 'to carol')).toBe(true)
    const times = all.map((m) => new Date(m.created_at).getTime())
    expect([...times].sort((x, y) => y - x)).toEqual(times)

    const page = await as(A, () => rows<{ id: string }>(`select * from pc_get_messages('${B}', null, 2)`))
    expect(page).toHaveLength(2)
    expect(await as(A, () => rows(`select * from pc_get_messages('${B}', null, 0)`))).toHaveLength(1) // limit is clamped to >= 1
  })
})

describe('read receipts and summaries', () => {
  it('counts unread per conversation and clears them only for the receiver', async () => {
    const before = await as(B, () => rows<{ partner_id: string; unread_count: string }>('select * from pc_chat_summaries()'))
    const fromA = before.find((r) => r.partner_id === A)!
    expect(Number(fromA.unread_count)).toBeGreaterThan(0)

    expect(await as(A, () => rows(`select pc_mark_read('${B}') as n`))).toEqual([{ n: 1 }]) // only B's reply is unread for A
    expect(await as(C, () => rows(`select pc_mark_read('${B}') as n`))).toEqual([{ n: 0 }]) // C has nothing from B
    expect(await as(A, () => rows(`select pc_mark_read('${C}') as n`))).toEqual([{ n: 0 }]) // A's own outgoing message to C is not "unread for A"

    const n = (await as(B, () => rows<{ n: number }>(`select pc_mark_read('${A}') as n`)))[0].n
    expect(n).toBe(Number(fromA.unread_count))
    const after = await as(B, () => rows<{ partner_id: string; unread_count: string }>('select * from pc_chat_summaries()'))
    expect(Number(after.find((r) => r.partner_id === A)!.unread_count)).toBe(0)
    expect(await as(B, () => rows(`select pc_mark_read('${A}') as n`))).toEqual([{ n: 0 }])
  })

  it('shows read_at to the sender after the receiver reads', async () => {
    const msgs = await as(A, () => rows<{ sender_id: string; read_at: string | null }>(`select * from pc_get_messages('${B}', null, 200)`))
    expect(msgs.filter((m) => m.sender_id === A).every((m) => m.read_at !== null)).toBe(true)
  })

  it('returns one row per conversation with the latest message and nothing from other people\'s chats', async () => {
    const s = await as(A, () => rows<{ partner_id: string; last_body: string; last_sender_id: string }>('select * from pc_chat_summaries()'))
    expect(s.map((r) => r.partner_id).sort()).toEqual([B, C].sort())
    expect(s.find((r) => r.partner_id === C)).toMatchObject({ last_body: 'to carol', last_sender_id: A })
    expect(s.find((r) => r.partner_id === B)).toMatchObject({ last_body: 'now I can reply', last_sender_id: B })
    const sc = await as(C, () => rows<{ partner_id: string }>('select * from pc_chat_summaries()'))
    expect(sc.map((r) => r.partner_id)).toEqual([A])
  })
})

describe('presence', () => {
  it('heartbeat updates only the caller, using the server clock', async () => {
    await db.exec(`update pc_profiles set last_seen_at = now() - interval '1 hour'`)
    await as(A, () => rows('select pc_heartbeat()'))
    const r = await rows<{ id: string; fresh: boolean }>(`select id, last_seen_at > now() - interval '1 minute' as fresh from pc_profiles`)
    expect(r.find((x) => x.id === A)!.fresh).toBe(true)
    expect(r.filter((x) => x.id !== A).every((x) => !x.fresh)).toBe(true)
  })

  it('exposes contacts\' last_seen_at but not strangers\'', async () => {
    const c = await as(A, () => rows<{ id: string; last_seen_at: string }>('select * from pc_list_contacts()'))
    expect(c.length).toBeGreaterThan(0)
    expect(c.every((x) => x.last_seen_at)).toBe(true)
    expect(await as(C, () => rows(`select last_seen_at from pc_profiles where id = '${B}'`))).toHaveLength(0)
  })
})

describe('storage policies', () => {
  const upload = (uid: string, bucket: string, name: string) =>
    as(uid, () => rows('insert into storage.objects (bucket_id, name) values ($1, $2) returning name', [bucket, name]))

  it('lets people upload only inside their own folder', async () => {
    await expect(upload(A, 'pc-avatars', `${A}/a.jpg`)).resolves.toHaveLength(1)
    await expect(upload(A, 'pc-avatars', `${B}/a.jpg`)).rejects.toThrow(/row-level security/i)
    await expect(upload(A, 'pc-avatars', 'loose.jpg')).rejects.toThrow(/row-level security/i)
    await expect(upload(A, 'pc-chat-media', `${B}/x.jpg`)).rejects.toThrow(/row-level security/i)
    await expect(as(null, () => rows(`insert into storage.objects (bucket_id, name) values ('pc-avatars', '${A}/anon.jpg')`))).rejects.toThrow(/row-level security|permission denied/i)
  })

  it('lets you delete only your own avatar files', async () => {
    await upload(B, 'pc-avatars', `${B}/b.jpg`)
    expect((await as(A, () => db.query(`delete from storage.objects where name = '${B}/b.jpg'`))).affectedRows).toBe(0)
    expect((await as(B, () => db.query(`delete from storage.objects where name = '${B}/b.jpg'`))).affectedRows).toBe(1)
  })

  it('keeps chat photos private to the two people in the message', async () => {
    const path = `${A}/photo-1.jpg`
    await upload(A, 'pc-chat-media', path)

    const visible = (uid: string) => as(uid, () => rows(`select 1 from storage.objects where bucket_id='pc-chat-media' and name='${path}'`))
    expect(await visible(A)).toHaveLength(1) // uploader
    expect(await visible(B)).toHaveLength(0) // not attached to any message yet
    expect(await visible(C)).toHaveLength(0)

    await as(A, () => rows('select * from pc_send_message($1, $2, $3)', [B, null, path]))
    expect(await visible(B)).toHaveLength(1) // receiver, after the message references it
    expect(await visible(C)).toHaveLength(0) // third party never
    expect(await as(null, () => rows(`select 1 from storage.objects`))).toHaveLength(0) // anon sees nothing
  })

  it('never allows deleting chat photos', async () => {
    const r = await as(A, () => db.query(`delete from storage.objects where bucket_id='pc-chat-media'`))
    expect(r.affectedRows).toBe(0)
  })
})

describe('anonymous access', () => {
  it('is denied on every table and function', async () => {
    for (const t of ['pc_profiles', 'pc_contacts', 'pc_messages']) {
      await expect(as(null, () => rows(`select * from ${t}`))).rejects.toThrow(/permission denied/i)
    }
    for (const call of ['pc_list_contacts()', 'pc_chat_summaries()', `pc_get_messages('${A}')`, 'pc_heartbeat()', `pc_mark_read('${A}')`]) {
      await expect(as(null, () => rows(`select * from ${call}`))).rejects.toThrow(/permission denied/i)
    }
  })
})
