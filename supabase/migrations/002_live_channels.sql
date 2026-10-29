-- PrivateChat 002: private live channels (typing indicator, voice/video call signalling).
--
-- Each pair of contacts shares one Realtime *broadcast* channel named  pc-chat:<smaller-uuid>:<larger-uuid>.
-- Only the two people in the topic, and only while one of them has saved the other, may join it or send on it.
-- Because a channel has exactly two possible members, anything received on it came from the other person,
-- so a client cannot pretend to be someone else.
--
-- Run this once in the Supabase SQL Editor, after 001_privatechat.sql. Safe to run again.

create or replace function public.pc_can_use_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me    uuid := auth.uid();
  parts text[];
  a     uuid;
  b     uuid;
  other uuid;
begin
  if me is null or p_topic is null then
    return false;
  end if;

  parts := string_to_array(p_topic, ':');
  if array_length(parts, 1) is distinct from 3 or parts[1] <> 'pc-chat' then
    return false;
  end if;

  begin
    a := parts[2]::uuid;
    b := parts[3]::uuid;
  exception when others then
    return false;
  end;

  -- One canonical spelling per pair, so nobody can open a second, look-alike channel for the same two people.
  if a >= b or parts[2] <> lower(parts[2]) or parts[3] <> lower(parts[3]) then
    return false;
  end if;
  if me <> a and me <> b then
    return false;
  end if;

  other := case when me = a then b else a end;
  return exists (
    select 1
    from public.pc_contacts c
    where (c.owner_id = me and c.contact_id = other)
       or (c.owner_id = other and c.contact_id = me)
  );
end
$$;

revoke all on function public.pc_can_use_topic(text) from public, anon;
grant execute on function public.pc_can_use_topic(text) to authenticated;

-- Realtime Authorization: policies on realtime.messages decide who may join (select) and send (insert).
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise exception 'realtime.messages does not exist. This Supabase project does not support Realtime Authorization.';
  end if;

  execute 'drop policy if exists pc_pair_receive on realtime.messages';
  execute $p$
    create policy pc_pair_receive on realtime.messages
      for select to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and public.pc_can_use_topic((select realtime.topic()))
      )
  $p$;

  execute 'drop policy if exists pc_pair_send on realtime.messages';
  execute $p$
    create policy pc_pair_send on realtime.messages
      for insert to authenticated
      with check (
        realtime.messages.extension = 'broadcast'
        and public.pc_can_use_topic((select realtime.topic()))
      )
  $p$;
end
$$;

notify pgrst, 'reload schema';