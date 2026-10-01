-- Run once in the Supabase project's SQL Editor. No password or secret key
-- belongs in this file. The only permitted account is the owner's Auth UID.
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
create policy owner_only on public.reading_garden_sync
  for all to authenticated
  using (owner_id = (select auth.uid()) and owner_id = '3ad0b62f-79e2-4cff-8b78-0352fd42e8f1'::uuid)
  with check (owner_id = (select auth.uid()) and owner_id = '3ad0b62f-79e2-4cff-8b78-0352fd42e8f1'::uuid);

-- Optimistic concurrency: a competing device cannot silently overwrite a
-- newer revision. The client fetches again and merges against its saved base.
create or replace function public.reading_garden_write(expected_revision bigint, new_payload jsonb)
returns setof public.reading_garden_sync
language plpgsql security invoker set search_path = ''
as $$
declare affected integer;
begin
  if auth.uid() is distinct from '3ad0b62f-79e2-4cff-8b78-0352fd42e8f1'::uuid then
    raise exception 'Owner access required' using errcode = '42501';
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
notify pgrst, 'reload schema';
commit;
