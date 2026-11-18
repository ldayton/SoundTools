create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.account_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique
);
create function public.account_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.account_owners where user_id = auth.uid());
$$;
revoke all on function public.account_approved() from public, anon;
grant execute on function public.account_approved() to authenticated;

create table public.account_apps (
  user_id uuid not null references auth.users(id) on delete cascade,
  app text not null check (app in ('dorego','songalong','notewise','soundglow')),
  primary key (user_id, app)
);
create table public.account_records (
  user_id uuid not null,
  app text not null,
  key text not null check (length(key) between 1 and 512),
  value jsonb not null check (octet_length(value::text) <= 65536),
  revision bigint not null default 1,
  device uuid not null,
  operation uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, app, key),
  foreign key (user_id, app) references public.account_apps on delete cascade
);
create table private.account_operations (
  user_id uuid not null,
  app text not null,
  operation uuid not null,
  key text not null,
  primary key (user_id, app, operation)
);
alter table public.account_apps enable row level security;
alter table public.account_records enable row level security;
create policy own_apps on public.account_apps for select to authenticated
  using (user_id = (select auth.uid()) and (select public.account_approved()));
create policy own_records on public.account_records for select to authenticated
  using (user_id = (select auth.uid()) and (select public.account_approved()));
revoke all on public.account_apps, public.account_records from public, anon, authenticated;
grant select on public.account_apps, public.account_records to authenticated;

create function public.account_snapshot(p_app text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  return jsonb_build_object(
    'initialized', exists(select 1 from public.account_apps where user_id = auth.uid() and app = p_app),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'value', value, 'revision', revision, 'device', device, 'operation', operation))
      from public.account_records where user_id = auth.uid() and app = p_app), '[]'::jsonb)
  );
end;
$$;
create function public.account_initialize(p_app text, p_records jsonb, p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare created integer;
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  if jsonb_typeof(p_records) <> 'object' or octet_length(p_records::text) > 2097152 then
    raise invalid_parameter_value using message = 'Invalid account data.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_app, 0));
  insert into public.account_apps values (auth.uid(), p_app) on conflict do nothing;
  get diagnostics created = row_count;
  if created = 1 then
    insert into public.account_records(user_id, app, key, value, device, operation)
    select auth.uid(), p_app, key, value, p_device, gen_random_uuid() from jsonb_each(p_records);
  end if;
  return public.account_snapshot(p_app)->'rows';
end;
$$;
create function public.account_write(p_app text, p_key text, p_value jsonb, p_revision bigint, p_operation uuid, p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_row public.account_records; applied boolean := false;
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  if p_revision < 0 or p_value is null or p_operation is null or p_device is null then
    raise invalid_parameter_value using message = 'Invalid account change.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_app, 0));
  select * into current_row from public.account_records where user_id = auth.uid() and app = p_app and key = p_key;
  if exists(select 1 from private.account_operations where user_id = auth.uid() and app = p_app and operation = p_operation and key = p_key) then
    applied := true;
  elsif coalesce(current_row.revision, 0) = p_revision then
    insert into public.account_records(user_id, app, key, value, revision, device, operation)
    values (auth.uid(), p_app, p_key, p_value, p_revision + 1, p_device, p_operation)
    on conflict (user_id, app, key) do update set value = excluded.value, revision = excluded.revision,
      device = excluded.device, operation = excluded.operation, updated_at = now()
    returning * into current_row;
    insert into private.account_operations values (auth.uid(), p_app, p_operation, p_key);
    applied := true;
  end if;
  return jsonb_build_object('applied', applied, 'row', jsonb_build_object(
    'key', current_row.key, 'value', current_row.value, 'revision', current_row.revision,
    'device', current_row.device, 'operation', current_row.operation));
end;
$$;
revoke all on function public.account_snapshot(text), public.account_initialize(text,jsonb,uuid), public.account_write(text,text,jsonb,bigint,uuid,uuid) from public, anon;
grant execute on function public.account_snapshot(text), public.account_initialize(text,jsonb,uuid), public.account_write(text,text,jsonb,bigint,uuid,uuid) to authenticated;
