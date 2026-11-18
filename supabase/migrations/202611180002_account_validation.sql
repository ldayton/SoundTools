create or replace function public.account_initialize(p_app text, p_records jsonb, p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare created integer;
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  if p_app is null or p_device is null or p_records is null or jsonb_typeof(p_records) <> 'object' or octet_length(p_records::text) > 2097152 then
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
create or replace function public.account_write(p_app text, p_key text, p_value jsonb, p_revision bigint, p_operation uuid, p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_row public.account_records; applied boolean := false;
begin
  if not public.account_approved() then raise insufficient_privilege using message = 'Not on approved list.'; end if;
  if p_app is null or p_key is null or p_revision is null or p_revision < 0 or p_value is null or p_operation is null or p_device is null then
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
create or replace function public.account_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.account_owners where user_id = auth.uid()
    and lower(email) = lower(auth.jwt()->>'email'));
$$;
alter table private.account_operations add constraint account_operations_app
  foreign key (user_id, app) references public.account_apps on delete cascade;
