-- Private original files. The catalogue is separate from settings: only these
-- functions can change transfer state, and Storage checks the same owner.
insert into storage.buckets(id, name, public, file_size_limit)
values ('soundtools-files', 'soundtools-files', false, 52428800)
on conflict(id) do nothing;

create table public.media_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app text not null check(app in ('dorego','songalong','notewise','soundglow')),
  fingerprint text not null check(fingerprint ~ '^sha256-tree-v1:[a-f0-9]{64}$'),
  name text not null check(length(btrim(name)) between 1 and 255),
  mime text not null check(length(mime) between 1 and 255),
  bytes bigint not null check(bytes between 1 and 52428800),
  details jsonb not null default '{}' check(jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096),
  state text not null default 'pending' check(state in ('pending','ready','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index media_files_live_content on public.media_files(user_id,app,fingerprint) where state <> 'deleted';
create index media_files_owner on public.media_files(user_id,app);
alter table public.media_files enable row level security;
create policy media_owner_read on public.media_files for select to authenticated
using(user_id = (select auth.uid()) and (select public.account_approved()));
revoke all on public.media_files from public, anon, authenticated;
grant select on public.media_files to authenticated;

create function public.media_reserve(p_app text, p_fingerprint text, p_name text, p_mime text, p_bytes bigint, p_details jsonb, p_previous_delete uuid default null)
returns public.media_files language plpgsql security definer set search_path = '' as $$
declare result public.media_files; latest_delete uuid;
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  -- Serialize same-content reservations/deletes. A stale client that never
  -- received its reservation cannot silently re-create a subsequently deleted file.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || p_app || p_fingerprint,0));
  select id into latest_delete from public.media_files
    where user_id=auth.uid() and app=p_app and fingerprint=p_fingerprint and state='deleted'
    order by updated_at desc,id desc limit 1;
  if latest_delete is distinct from p_previous_delete then
    raise sqlstate 'PT409' using message = 'This file was deleted on another device. Import it again to restore it.';
  end if;
  insert into public.media_files(user_id,app,fingerprint,name,mime,bytes,details)
  values(auth.uid(),p_app,p_fingerprint,p_name,p_mime,p_bytes,p_details)
  on conflict(user_id,app,fingerprint) where state <> 'deleted' do nothing;
  select * into strict result from public.media_files
    where user_id=auth.uid() and app=p_app and fingerprint=p_fingerprint and state <> 'deleted';
  if result.bytes <> p_bytes then raise invalid_parameter_value using message = 'File identity does not match.'; end if;
  return result;
end;
$$;

create function public.media_snapshot(p_app text) returns setof public.media_files
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  -- Recover an upload which completed just before its browser disconnected.
  update public.media_files f set state='ready',updated_at=now()
    where f.user_id=auth.uid() and f.app=p_app and f.state='pending'
    and exists(select 1 from storage.objects o where o.bucket_id='soundtools-files'
      and o.name=f.user_id::text || '/' || f.app || '/' || f.id::text
      and (o.metadata->>'size')::bigint=f.bytes);
  return query select * from public.media_files where user_id=auth.uid() and app=p_app order by created_at,id;
end;
$$;

create function public.media_finish(p_id uuid) returns public.media_files
language plpgsql security definer set search_path = '' as $$
declare result public.media_files;
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  select * into strict result from public.media_files where id=p_id and user_id=auth.uid() for update;
  if result.state='deleted' then raise invalid_parameter_value using message = 'File was deleted.'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='soundtools-files'
    and o.name=result.user_id::text || '/' || result.app || '/' || result.id::text
    and (o.metadata->>'size')::bigint=result.bytes) then
    raise invalid_parameter_value using message = 'Upload has not completed.';
  end if;
  update public.media_files set state='ready',updated_at=now() where id=p_id returning * into result;
  return result;
end;
$$;

create function public.media_rename(p_id uuid,p_name text) returns public.media_files
language plpgsql security definer set search_path = '' as $$
declare result public.media_files;
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  update public.media_files set name=p_name,updated_at=now() where id=p_id and user_id=auth.uid() and state <> 'deleted' returning * into strict result;
  return result;
end;
$$;

create function public.media_delete(p_id uuid) returns public.media_files
language plpgsql security definer set search_path = '' as $$
declare result public.media_files;
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  select * into strict result from public.media_files where id=p_id and user_id=auth.uid();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || result.app || result.fingerprint,0));
  update public.media_files set state='deleted',updated_at=case when state='deleted' then updated_at else now() end
    where id=p_id and user_id=auth.uid() returning * into strict result;
  return result;
end;
$$;

revoke all on function public.media_reserve(text,text,text,text,bigint,jsonb,uuid), public.media_snapshot(text), public.media_finish(uuid), public.media_rename(uuid,text), public.media_delete(uuid) from public,anon;
grant execute on function public.media_reserve(text,text,text,text,bigint,jsonb,uuid), public.media_snapshot(text), public.media_finish(uuid), public.media_rename(uuid,text), public.media_delete(uuid) to authenticated;

-- Return only tombstones that still have bytes to remove. Deletion remains
-- retriable after a crash without sending DELETE requests forever afterward.
create function public.media_pending_deletes(p_app text) returns setof public.media_files
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  return query select f.* from public.media_files f
    where f.user_id=auth.uid() and f.app=p_app and f.state='deleted'
    and exists(select 1 from storage.objects o where o.bucket_id='soundtools-files'
      and o.name=f.user_id::text || '/' || f.app || '/' || f.id::text);
end;
$$;
revoke all on function public.media_pending_deletes(text) from public,anon;
grant execute on function public.media_pending_deletes(text) to authenticated;

-- Every immutable object belongs to an approved account and a reserved file.
-- No UPDATE/upsert: a rename changes the catalogue, never the audio bytes.
create policy media_storage_read on storage.objects for select to authenticated using(
  bucket_id='soundtools-files' and public.account_approved() and exists(
    select 1 from public.media_files f where f.user_id=auth.uid()
    and storage.objects.name=f.user_id::text || '/' || f.app || '/' || f.id::text
  )
);
create policy media_storage_insert on storage.objects for insert to authenticated with check(
  bucket_id='soundtools-files' and public.account_approved() and exists(
    select 1 from public.media_files f where f.user_id=auth.uid() and f.state='pending'
    and storage.objects.name=f.user_id::text || '/' || f.app || '/' || f.id::text
  )
);
create policy media_storage_delete on storage.objects for delete to authenticated using(
  bucket_id='soundtools-files' and public.account_approved() and exists(
    select 1 from public.media_files f where f.user_id=auth.uid() and f.state='deleted'
    and storage.objects.name=f.user_id::text || '/' || f.app || '/' || f.id::text
  )
);
