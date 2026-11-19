-- Additive protocol upgrade. Old clients retain their revision-checked RPC.
create sequence private.account_change_seq;
alter table public.account_records add column change_seq bigint not null default nextval('private.account_change_seq');
alter table public.account_records add column edit_time bigint not null default 0;
alter table public.account_records add column edit_counter bigint not null default 0;
update public.account_records set edit_time = floor(extract(epoch from updated_at)*1000)::bigint;
alter table private.account_operations add column created_at timestamptz not null default now();
create index account_operations_retention on private.account_operations(user_id,app,created_at);
alter table private.account_operations add column request_value jsonb;
alter table private.account_operations add column request_stamp jsonb;

create or replace function public.account_snapshot(p_app text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.account_approved() then raise insufficient_privilege using message='Not on approved list.'; end if;
  return jsonb_build_object('serverTime', floor(extract(epoch from clock_timestamp())*1000)::bigint,
    'initialized', exists(select 1 from public.account_apps where user_id=auth.uid() and app=p_app),
    'rows',coalesce((select jsonb_agg(jsonb_build_object('key',key,'value',value,'revision',revision,'device',device,'operation',operation,'sequence',change_seq,
      'stamp',jsonb_build_object('time',edit_time,'counter',edit_counter,'node',device::text)))
      from public.account_records where user_id=auth.uid() and app=p_app),'[]'::jsonb));
end; $$;

create or replace function public.account_write_v2(p_app text,p_key text,p_value jsonb,p_revision bigint,p_operation uuid,p_device uuid,p_stamp jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_row public.account_records; prior private.account_operations; applied boolean:=false;
  millis bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint; counter bigint:=0;
begin
  if not public.account_approved() then raise insufficient_privilege using message='Not on approved list.'; end if;
  p_value:=coalesce(p_value,'null'::jsonb);
  if p_app is null or p_key is null or p_revision is null or p_revision<0 or p_value is null or p_operation is null or p_device is null then
    raise invalid_parameter_value using message='Invalid account change.';
  end if;
  if p_stamp is not null and jsonb_typeof(p_stamp)<>'null' then
    millis:=(p_stamp->>'time')::bigint; counter:=(p_stamp->>'counter')::bigint;
    if millis is null or millis<0 or millis>floor(extract(epoch from clock_timestamp())*1000)::bigint+300000 or counter is null or counter<0 then
      raise invalid_parameter_value using message='Invalid edit clock.';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_app,0));
  select * into current_row from public.account_records where user_id=auth.uid() and app=p_app and key=p_key;
  select * into prior from private.account_operations where user_id=auth.uid() and app=p_app and operation=p_operation;
  if found then
    if prior.key<>p_key or (prior.request_value is not null and (prior.request_value is distinct from p_value or prior.request_stamp is distinct from p_stamp)) then
      raise invalid_parameter_value using message='Operation ID reused with different data.';
    end if;
    applied:=true;
  elsif coalesce(current_row.revision,0)=p_revision and
    (current_row.key is null or row(millis,counter,p_device::text)>row(current_row.edit_time,current_row.edit_counter,current_row.device::text)) then
    insert into public.account_records(user_id,app,key,value,revision,device,operation,edit_time,edit_counter)
    values(auth.uid(),p_app,p_key,p_value,p_revision+1,p_device,p_operation,millis,counter)
    on conflict(user_id,app,key) do update set value=excluded.value,revision=excluded.revision,device=excluded.device,operation=excluded.operation,
      edit_time=excluded.edit_time,edit_counter=excluded.edit_counter,change_seq=nextval('private.account_change_seq'),updated_at=now() returning * into current_row;
    insert into private.account_operations(user_id,app,operation,key,request_value,request_stamp) values(auth.uid(),p_app,p_operation,p_key,p_value,p_stamp);
    applied:=true;
    delete from private.account_operations where user_id=auth.uid() and app=p_app and operation in (
      select o.operation from private.account_operations o where o.user_id=auth.uid() and o.app=p_app and o.created_at<now()-interval '90 days'
        and not exists(select 1 from public.account_records r where r.user_id=o.user_id and r.app=o.app and r.operation=o.operation)
      order by o.created_at limit 100);
  end if;
  return jsonb_build_object('applied',applied,'row',jsonb_build_object('key',current_row.key,'value',current_row.value,'revision',current_row.revision,
    'device',current_row.device,'operation',current_row.operation,'sequence',current_row.change_seq,'stamp',jsonb_build_object('time',current_row.edit_time,'counter',current_row.edit_counter,'node',current_row.device::text)));
end; $$;
revoke all on function public.account_write_v2(text,text,jsonb,bigint,uuid,uuid,jsonb) from public,anon;
grant execute on function public.account_write_v2(text,text,jsonb,bigint,uuid,uuid,jsonb) to authenticated;

-- Keep old RPC clients interoperable; their edits are stamped at acceptance.
create or replace function public.account_write(p_app text,p_key text,p_value jsonb,p_revision bigint,p_operation uuid,p_device uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 if p_value is null then raise invalid_parameter_value using message='Invalid account change.';end if;
 return public.account_write_v2(p_app,p_key,p_value,p_revision,p_operation,p_device,null);
end; $$;

-- Private invalidations contain no settings payload. Clients always reconcile
-- through the authenticated snapshot RPC, including after reconnecting.
create function private.account_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    perform realtime.send(jsonb_build_object('revision',NEW.revision),'changed','account:'||NEW.user_id::text||':'||NEW.app,true);
  end if;
  return NEW;
end; $$;
create trigger account_notify after insert or update on public.account_records for each row execute function private.account_notify();
do $$ begin
  if to_regclass('realtime.messages') is not null then
    execute $policy$create policy account_private_notifications on realtime.messages for select to authenticated
      using (public.account_approved() and realtime.topic() = any(array[
        'account:'||auth.uid()::text||':dorego','account:'||auth.uid()::text||':songalong',
        'account:'||auth.uid()::text||':notewise','account:'||auth.uid()::text||':soundglow']))$policy$;
  end if;
end $$;

create function public.account_snapshot_v2(p_app text,p_since bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 if not public.account_approved() then raise insufficient_privilege using message='Not on approved list.';end if;
 return jsonb_build_object('serverTime',floor(extract(epoch from clock_timestamp())*1000)::bigint,
   'initialized',exists(select 1 from public.account_apps where user_id=auth.uid() and app=p_app),
   'cursor',coalesce((select max(change_seq) from public.account_records where user_id=auth.uid() and app=p_app),0),
   'rows',coalesce((select jsonb_agg(jsonb_build_object('key',key,'value',value,'revision',revision,'device',device,'operation',operation,'sequence',change_seq,
     'stamp',jsonb_build_object('time',edit_time,'counter',edit_counter,'node',device::text)) order by change_seq)
     from public.account_records where user_id=auth.uid() and app=p_app and (p_since is null or change_seq>p_since)),'[]'::jsonb));
end; $$;
revoke all on function public.account_snapshot_v2(text,bigint) from public,anon;
grant execute on function public.account_snapshot_v2(text,bigint) to authenticated;

create function private.media_sync_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  perform realtime.send(jsonb_build_object('files',true),'changed','account:'||NEW.user_id::text||':'||NEW.app,true);
 end if;
 return NEW;
end; $$;
create trigger media_sync_notify after insert or update on public.media_files for each row execute function private.media_sync_notify();
notify pgrst, 'reload schema';

-- File names use the same edit-order semantics; deletion still wins for a
-- retired file identity and re-import creates a new, explicit generation.
alter table public.media_files add column rename_time bigint not null default 0;
alter table public.media_files add column rename_counter bigint not null default 0;
alter table public.media_files add column rename_device uuid;
create function public.media_rename_v2(p_id uuid,p_name text,p_stamp jsonb default null) returns public.media_files
language plpgsql security definer set search_path = '' as $$
declare result public.media_files; millis bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
 counter bigint:=0; device uuid:='00000000-0000-0000-0000-000000000000';
begin
 if not public.account_approved() then raise insufficient_privilege using message='Not on approved list.';end if;
 if p_name is null or length(trim(p_name))=0 or length(p_name)>255 then raise invalid_parameter_value using message='Invalid file name.';end if;
 if p_stamp is not null and jsonb_typeof(p_stamp)<>'null' then
  millis:=(p_stamp->>'time')::bigint;counter:=(p_stamp->>'counter')::bigint;device:=(p_stamp->>'node')::uuid;
  if millis is null or millis<0 or millis>floor(extract(epoch from clock_timestamp())*1000)::bigint+300000 or counter is null or counter<0 or device is null then
   raise invalid_parameter_value using message='Invalid edit clock.';
  end if;
 end if;
 select * into strict result from public.media_files where id=p_id and user_id=auth.uid() and state<>'deleted' for update;
 if row(millis,counter,device::text)>row(result.rename_time,result.rename_counter,coalesce(result.rename_device::text,'')) then
  update public.media_files set name=p_name,updated_at=now(),rename_time=millis,rename_counter=counter,rename_device=device where id=p_id returning * into result;
 end if;
 return result;
end; $$;
revoke all on function public.media_rename_v2(uuid,text,jsonb) from public,anon;
grant execute on function public.media_rename_v2(uuid,text,jsonb) to authenticated;
create or replace function public.media_rename(p_id uuid,p_name text) returns public.media_files
language sql security definer set search_path = '' as $$ select public.media_rename_v2(p_id,p_name,null); $$;
notify pgrst, 'reload schema';
