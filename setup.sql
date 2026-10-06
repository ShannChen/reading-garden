-- Run this complete script once in Supabase SQL Editor.
-- It upgrades the existing table in place; existing user records remain intact.
begin;
create table if not exists public.reading_garden_sync (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and
    jsonb_typeof(payload->'papers') = 'array' and
    jsonb_typeof(payload->'ideas') = 'array' and
    jsonb_typeof(payload->'tasks') = 'array'
  ),
  updated_at timestamptz not null default now()
);
alter table public.reading_garden_sync enable row level security;
revoke all on public.reading_garden_sync from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.reading_garden_sync to authenticated;
drop policy if exists owner_only on public.reading_garden_sync;
drop policy if exists account_only on public.reading_garden_sync;
create policy account_only on public.reading_garden_sync
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create or replace function public.reading_garden_write(expected_revision bigint, new_payload jsonb)
returns setof public.reading_garden_sync
language plpgsql security invoker set search_path = ''
as $$
declare affected integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision < 0 then
    raise exception 'Invalid revision' using errcode = '22023';
  end if;
  if jsonb_typeof(new_payload) is distinct from 'object'
    or jsonb_typeof(new_payload->'papers') is distinct from 'array'
    or jsonb_typeof(new_payload->'ideas') is distinct from 'array'
    or jsonb_typeof(new_payload->'tasks') is distinct from 'array' then
    raise exception 'Invalid library payload' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    return query insert into public.reading_garden_sync (owner_id, revision, payload)
      values (auth.uid(), 1, new_payload)
      on conflict (owner_id) do nothing returning *;
  else
    return query update public.reading_garden_sync as s
      set payload = new_payload, revision = s.revision + 1, updated_at = now()
      where s.owner_id = auth.uid() and s.revision = expected_revision returning s.*;
  end if;
  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'SYNC_REVISION_CONFLICT' using errcode = '40001';
  end if;
end;
$$;
revoke all on function public.reading_garden_write(bigint,jsonb) from public, anon;
grant execute on function public.reading_garden_write(bigint,jsonb) to authenticated;

-- Public configuration only. No user identities, libraries, or credentials.
-- The app checks this before offering to register an account.
create or replace function public.reading_garden_capabilities()
returns jsonb language sql security invoker set search_path = ''
as $$ select jsonb_build_object('multiUser', true, 'version', 2); $$;
revoke all on function public.reading_garden_capabilities() from public;
grant execute on function public.reading_garden_capabilities() to anon, authenticated;
notify pgrst, 'reload schema';
commit;
