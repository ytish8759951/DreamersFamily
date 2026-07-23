-- Little Dreamers Family
-- Formal share, growth, special-day and screen-time redemption RPC hardening.

alter table public.shares
  add column if not exists client_request_id text;

alter table public.growth_records
  add column if not exists client_request_id text,
  add column if not exists deleted_at timestamptz;

alter table public.special_days
  add column if not exists client_request_id text,
  add column if not exists image_media_id uuid references public.media_assets(id) on delete set null;

create unique index if not exists uq_shares_request
  on public.shares(family_id, child_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists uq_growth_records_request
  on public.growth_records(family_id, child_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists uq_special_days_request
  on public.special_days(family_id, child_id, client_request_id)
  where client_request_id is not null and child_id is not null;

create unique index if not exists uq_special_days_family_request
  on public.special_days(family_id, client_request_id)
  where client_request_id is not null and child_id is null;

create or replace function public.create_share_from_repository(
  p_share jsonb,
  p_media jsonb default '[]'::jsonb,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.shares%rowtype;
  v_id uuid := nullif(p_share ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_share ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_share ->> 'child_id', '')::uuid;
  v_key text := coalesce(nullif(p_share ->> 'client_request_id', ''), 'share:create:' || v_id::text);
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_now timestamptz := now();
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_id is null or v_key is null then
    raise exception 'Share id and client_request_id are required' using errcode = '22023';
  end if;

  select * into v_share
  from public.shares
  where family_id = v_family_id and child_id = v_child_id and client_request_id = v_key
  limit 1;
  if found then
    return jsonb_build_object(
      'share', to_jsonb(v_share),
      'share_media', coalesce((select jsonb_agg(to_jsonb(sm) order by sm.sort_order) from public.share_media sm where sm.share_id = v_share.id), '[]'::jsonb)
    );
  end if;

  insert into public.shares (
    id, family_id, child_id, title, caption, share_type, source_type, status,
    submitted_at, reviewed_by, reviewed_at, rejection_reason, published_at,
    created_by_user_id, created_by_device_id, client_request_id, created_at, updated_at, deleted_at
  )
  values (
    v_id, v_family_id, v_child_id, nullif(p_share ->> 'title', ''), nullif(p_share ->> 'caption', ''),
    coalesce(nullif(p_share ->> 'share_type', ''), 'text'),
    case when public.can_write_family(v_family_id) then coalesce(nullif(p_share ->> 'source_type', ''), 'parent') else 'system' end,
    case when public.can_write_family(v_family_id) then coalesce(nullif(p_share ->> 'status', ''), 'pending_review') else 'pending_review' end,
    coalesce(nullif(p_share ->> 'submitted_at', '')::timestamptz, v_now),
    case when public.can_write_family(v_family_id) then nullif(p_share ->> 'reviewed_by', '')::uuid else null end,
    case when public.can_write_family(v_family_id) then nullif(p_share ->> 'reviewed_at', '')::timestamptz else null end,
    nullif(p_share ->> 'rejection_reason', ''),
    case when public.can_write_family(v_family_id) then nullif(p_share ->> 'published_at', '')::timestamptz else null end,
    case when public.can_write_family(v_family_id) then auth.uid() else null end,
    null,
    v_key,
    coalesce(nullif(p_share ->> 'created_at', '')::timestamptz, v_now),
    coalesce(nullif(p_share ->> 'updated_at', '')::timestamptz, v_now),
    nullif(p_share ->> 'deleted_at', '')::timestamptz
  )
  returning * into v_share;

  insert into public.share_media (
    id, family_id, child_id, share_id, media_type, bucket, storage_path, mime_type,
    file_size_bytes, width, height, duration_seconds, thumbnail_path, sort_order, created_at
  )
  select
    nullif(item ->> 'id', '')::uuid,
    v_family_id,
    v_child_id,
    v_share.id,
    item ->> 'media_type',
    coalesce(nullif(item ->> 'bucket', ''), 'family-media'),
    item ->> 'storage_path',
    item ->> 'mime_type',
    coalesce(nullif(item ->> 'file_size_bytes', '')::bigint, 0),
    nullif(item ->> 'width', '')::integer,
    nullif(item ->> 'height', '')::integer,
    nullif(item ->> 'duration_seconds', '')::numeric,
    nullif(item ->> 'thumbnail_path', ''),
    coalesce(nullif(item ->> 'sort_order', '')::smallint, ordinality::smallint - 1),
    coalesce(nullif(item ->> 'created_at', '')::timestamptz, v_now)
  from jsonb_array_elements(v_media) with ordinality as media(item, ordinality);

  update public.media_assets
  set entity_type = 'share',
      entity_id = v_share.id,
      purpose = coalesce(purpose, 'content')
  where family_id = v_family_id
    and child_id = v_child_id
    and id in (select nullif(item ->> 'id', '')::uuid from jsonb_array_elements(v_media) as media(item));

  return jsonb_build_object(
    'share', to_jsonb(v_share),
    'share_media', coalesce((select jsonb_agg(to_jsonb(sm) order by sm.sort_order) from public.share_media sm where sm.share_id = v_share.id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_share_from_repository(jsonb, jsonb, text, uuid) from public;
grant execute on function public.create_share_from_repository(jsonb, jsonb, text, uuid) to anon, authenticated;

create or replace function public.delete_share_from_repository(
  p_share_id uuid,
  p_family_id uuid,
  p_child_id uuid,
  p_client_request_id text,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns public.shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.shares%rowtype;
begin
  perform public._assert_piggy_access(p_family_id, p_child_id, p_device_binding_id, p_device_id);
  update public.shares
  set deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where id = p_share_id and family_id = p_family_id and child_id = p_child_id
  returning * into v_share;
  if not found then
    raise exception 'Share not found' using errcode = 'P0002';
  end if;
  return v_share;
end;
$$;

revoke all on function public.delete_share_from_repository(uuid, uuid, uuid, text, text, uuid) from public;
grant execute on function public.delete_share_from_repository(uuid, uuid, uuid, text, text, uuid) to anon, authenticated;

create or replace function public.upsert_growth_record_from_repository(
  p_record jsonb,
  p_operation text default 'upsert',
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns public.growth_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.growth_records%rowtype;
  v_id uuid := nullif(p_record ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_record ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_record ->> 'child_id', '')::uuid;
  v_key text := coalesce(nullif(p_record ->> 'client_request_id', ''), 'growth:' || coalesce(p_operation, 'upsert') || ':' || v_id::text);
  v_media_ids uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_record -> 'growth_photo_media_ids', '[]'::jsonb))::uuid), '{}');
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_id is null or v_key is null then
    raise exception 'Growth record id and client_request_id are required' using errcode = '22023';
  end if;

  if p_operation = 'delete' then
    update public.growth_records
    set deleted_at = coalesce(deleted_at, now()), updated_at = now(), client_request_id = coalesce(client_request_id, v_key)
    where id = v_id and family_id = v_family_id and child_id = v_child_id
    returning * into v_row;
    if not found then raise exception 'Growth record not found' using errcode = 'P0002'; end if;
    return v_row;
  end if;

  select * into v_row
  from public.growth_records
  where family_id = v_family_id and child_id = v_child_id and client_request_id = v_key
  limit 1;
  if found then return v_row; end if;

  insert into public.growth_records (
    id, family_id, child_id, category_id, title, content, record_type, recorded_on,
    mood, visibility, source_type, created_by, source_child_device_id,
    client_request_id, deleted_at, created_at, updated_at
  )
  values (
    v_id, v_family_id, v_child_id, null, coalesce(nullif(p_record ->> 'title', ''), 'Growth record'),
    p_record ->> 'content', coalesce(nullif(p_record ->> 'record_type', ''), 'growth'),
    coalesce(nullif(p_record ->> 'recorded_on', '')::date, current_date),
    nullif(p_record ->> 'mood', ''), 'family',
    case when public.can_write_family(v_family_id) then 'parent' else 'system' end,
    case when public.can_write_family(v_family_id) then auth.uid() else null end,
    null, v_key, nullif(p_record ->> 'deleted_at', '')::timestamptz,
    coalesce(nullif(p_record ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_record ->> 'updated_at', '')::timestamptz, now())
  )
  on conflict (id) do update set
    child_id = excluded.child_id,
    title = excluded.title,
    content = excluded.content,
    record_type = excluded.record_type,
    recorded_on = excluded.recorded_on,
    mood = excluded.mood,
    client_request_id = coalesce(public.growth_records.client_request_id, excluded.client_request_id),
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  returning * into v_row;

  update public.media_assets
  set entity_type = 'growth-record',
      entity_id = v_row.id,
      purpose = coalesce(purpose, 'content')
  where family_id = v_family_id and child_id = v_child_id and id = any(v_media_ids);

  return v_row;
end;
$$;

revoke all on function public.upsert_growth_record_from_repository(jsonb, text, text, uuid) from public;
grant execute on function public.upsert_growth_record_from_repository(jsonb, text, text, uuid) to anon, authenticated;

create or replace function public.upsert_special_day_from_repository(
  p_day jsonb,
  p_operation text default 'upsert',
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns public.special_days
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.special_days%rowtype;
  v_id uuid := nullif(p_day ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_day ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_day ->> 'child_id', '')::uuid;
  v_key text := coalesce(nullif(p_day ->> 'client_request_id', ''), 'special-day:' || coalesce(p_operation, 'upsert') || ':' || v_id::text);
  v_media_id uuid := nullif(coalesce(p_day ->> 'image_media_id', p_day ->> 'cover_path', ''), '')::uuid;
begin
  if v_child_id is not null then
    perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  elsif not public.can_write_family(v_family_id) then
    raise exception 'Not allowed to write this special day' using errcode = '42501';
  end if;
  if v_id is null or v_key is null then
    raise exception 'Special day id and client_request_id are required' using errcode = '22023';
  end if;

  if p_operation = 'delete' then
    update public.special_days
    set archived_at = coalesce(archived_at, now()), updated_at = now(), client_request_id = coalesce(client_request_id, v_key)
    where id = v_id and family_id = v_family_id and (child_id is not distinct from v_child_id)
    returning * into v_row;
    if not found then raise exception 'Special day not found' using errcode = 'P0002'; end if;
    return v_row;
  end if;

  select * into v_row
  from public.special_days
  where family_id = v_family_id and client_request_id = v_key and child_id is not distinct from v_child_id
  limit 1;
  if found then return v_row; end if;

  insert into public.special_days (
    id, family_id, child_id, event_type, title, description, event_date, is_recurring,
    recurrence_rule, reminder_enabled, remind_days_before, cover_path, image_media_id,
    created_by, client_request_id, created_at, updated_at, archived_at
  )
  values (
    v_id, v_family_id, v_child_id, coalesce(nullif(p_day ->> 'event_type', ''), 'custom'),
    coalesce(nullif(p_day ->> 'title', ''), 'Special day'), nullif(p_day ->> 'description', ''),
    coalesce(nullif(p_day ->> 'event_date', '')::date, current_date),
    coalesce(nullif(p_day ->> 'is_recurring', '')::boolean, false),
    nullif(p_day ->> 'recurrence_rule', ''),
    coalesce(nullif(p_day ->> 'reminder_enabled', '')::boolean, true),
    coalesce(nullif(p_day ->> 'remind_days_before', '')::integer, 7),
    v_media_id::text,
    v_media_id,
    coalesce(auth.uid(), (select owner_id from public.families where id = v_family_id), nullif(p_day ->> 'created_by', '')::uuid),
    v_key,
    coalesce(nullif(p_day ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_day ->> 'updated_at', '')::timestamptz, now()),
    nullif(p_day ->> 'archived_at', '')::timestamptz
  )
  on conflict (id) do update set
    child_id = excluded.child_id,
    event_type = excluded.event_type,
    title = excluded.title,
    description = excluded.description,
    event_date = excluded.event_date,
    is_recurring = excluded.is_recurring,
    recurrence_rule = excluded.recurrence_rule,
    reminder_enabled = excluded.reminder_enabled,
    remind_days_before = excluded.remind_days_before,
    cover_path = excluded.cover_path,
    image_media_id = excluded.image_media_id,
    client_request_id = coalesce(public.special_days.client_request_id, excluded.client_request_id),
    archived_at = excluded.archived_at,
    updated_at = excluded.updated_at
  returning * into v_row;

  if v_media_id is not null then
    update public.media_assets
    set entity_type = 'special-day',
        entity_id = v_row.id,
        purpose = coalesce(purpose, 'content')
    where family_id = v_family_id
      and (v_child_id is null or child_id = v_child_id)
      and id = v_media_id;
  end if;

  return v_row;
end;
$$;

revoke all on function public.upsert_special_day_from_repository(jsonb, text, text, uuid) from public;
grant execute on function public.upsert_special_day_from_repository(jsonb, text, text, uuid) to anon, authenticated;

create or replace function public.create_screen_time_redemption_request(
  p_request jsonb,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns public.tablet_time
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tablet_time%rowtype;
  v_id uuid := nullif(p_request ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_request ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_request ->> 'child_id', '')::uuid;
  v_key text := coalesce(nullif(p_request ->> 'client_request_id', ''), 'screen-time-request:' || v_id::text);
  v_stars integer := coalesce(nullif(p_request ->> 'requested_stars', '')::integer, 0);
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_id is null or v_key is null or v_stars <= 0 then
    raise exception 'Request id, client_request_id and positive stars are required' using errcode = '22023';
  end if;
  if coalesce((select sum(amount)::integer from public.stars where family_id = v_family_id and child_id = v_child_id), 0) < v_stars then
    raise exception 'Not enough stars to request screen time' using errcode = '22003';
  end if;

  select * into v_row
  from public.tablet_time
  where family_id = v_family_id and child_id = v_child_id and client_request_id = v_key
  limit 1;
  if found then return v_row; end if;

  insert into public.tablet_time (
    id, family_id, child_id, entry_type, minutes, status, note, payload,
    client_request_id, created_at, updated_at
  )
  values (
    v_id, v_family_id, v_child_id, 'request',
    coalesce(nullif(p_request ->> 'requested_minutes', '')::integer, 0),
    coalesce(nullif(p_request ->> 'status', ''), 'pending'),
    nullif(p_request ->> 'note', ''),
    jsonb_build_object('kind', 'screen_time_request', 'screen_time_request', p_request),
    v_key,
    coalesce(nullif(p_request ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_request ->> 'updated_at', '')::timestamptz, now())
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.create_screen_time_redemption_request(jsonb, text, uuid) from public;
grant execute on function public.create_screen_time_redemption_request(jsonb, text, uuid) to anon, authenticated;

create or replace function public.review_screen_time_redemption_request(
  p_request jsonb,
  p_star jsonb default null,
  p_log jsonb default null,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.tablet_time%rowtype;
  v_star public.stars%rowtype;
  v_log public.tablet_time%rowtype;
  v_request_id uuid := nullif(p_request ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_request ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_request ->> 'child_id', '')::uuid;
  v_status text := coalesce(nullif(p_request ->> 'status', ''), 'approved');
  v_requested_stars integer := coalesce(nullif(p_request ->> 'requested_stars', '')::integer, 0);
  v_star_id uuid := nullif(coalesce(p_star ->> 'id', ''), '')::uuid;
  v_log_id uuid := nullif(coalesce(p_log ->> 'id', ''), '')::uuid;
  v_star_key text := coalesce(nullif(coalesce(p_star ->> 'idempotency_key', ''), ''), 'screen-time-request:' || v_request_id::text || ':stars');
  v_log_key text := coalesce(nullif(coalesce(p_log ->> 'client_request_id', ''), ''), nullif(coalesce(p_log ->> 'idempotency_key', ''), ''), 'screen-time-request:' || v_request_id::text);
  v_stars_before integer;
  v_minutes_before integer;
  v_stars_after integer;
  v_minutes_after integer;
begin
  if not public.can_write_family(v_family_id) then
    raise exception 'Not allowed to review this screen time request' using errcode = '42501';
  end if;
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  select coalesce(sum(amount), 0)::integer into v_stars_before from public.stars where family_id = v_family_id and child_id = v_child_id;
  select coalesce(sum(minutes), 0)::integer into v_minutes_before from public.tablet_time where family_id = v_family_id and child_id = v_child_id and entry_type = 'log';

  select * into v_request
  from public.tablet_time
  where id = v_request_id and family_id = v_family_id and child_id = v_child_id and entry_type = 'request'
  for update;
  if not found then
    raise exception 'Screen time request not found' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending' then
    select * into v_star from public.stars where family_id = v_family_id and child_id = v_child_id and idempotency_key = v_star_key limit 1;
    select * into v_log from public.tablet_time where family_id = v_family_id and child_id = v_child_id and client_request_id = v_log_key limit 1;
    select coalesce(sum(amount), 0)::integer into v_stars_after from public.stars where family_id = v_family_id and child_id = v_child_id;
    select coalesce(sum(minutes), 0)::integer into v_minutes_after from public.tablet_time where family_id = v_family_id and child_id = v_child_id and entry_type = 'log';
    return jsonb_build_object('request', to_jsonb(v_request), 'star', to_jsonb(v_star), 'tablet_time', to_jsonb(v_log), 'stars_before', v_stars_before, 'stars_after', v_stars_after, 'minutes_before', v_minutes_before, 'minutes_after', v_minutes_after);
  end if;

  if v_status = 'approved' then
    if v_star_id is null or v_log_id is null or v_requested_stars <= 0 then
      raise exception 'Approved review requires star/log ids and positive stars' using errcode = '22023';
    end if;
    if v_stars_before < v_requested_stars then
      raise exception 'Not enough stars to approve screen time request' using errcode = '22003';
    end if;

    insert into public.stars (
      id, family_id, child_id, amount, transaction_type, reason, task_id, share_id,
      dream_id, reversal_of_id, idempotency_key, created_by, created_at
    )
    values (
      v_star_id, v_family_id, v_child_id, -v_requested_stars, 'manual_adjustment',
      nullif(coalesce(p_star ->> 'reason', p_request ->> 'note'), ''),
      null, null, null, null, v_star_key, auth.uid(),
      coalesce(nullif(coalesce(p_star ->> 'created_at', ''), '')::timestamptz, now())
    )
    on conflict (family_id, idempotency_key) where idempotency_key is not null do nothing
    returning * into v_star;
    if not found then
      select * into v_star from public.stars where family_id = v_family_id and child_id = v_child_id and idempotency_key = v_star_key limit 1;
    end if;

    insert into public.tablet_time (
      id, family_id, child_id, entry_type, minutes, status, note, payload,
      client_request_id, created_at, updated_at
    )
    values (
      v_log_id, v_family_id, v_child_id, 'log',
      coalesce(nullif(coalesce(p_log ->> 'minutes', p_log ->> 'minutes_delta'), '')::integer, 0),
      coalesce(nullif(coalesce(p_log ->> 'status', ''), ''), 'redeem'),
      nullif(coalesce(p_log ->> 'note', p_log ->> 'reason'), ''),
      coalesce(p_log -> 'payload', jsonb_build_object('kind', 'screen_time_log', 'screen_time_log', p_log)),
      v_log_key,
      coalesce(nullif(coalesce(p_log ->> 'created_at', ''), '')::timestamptz, now()),
      coalesce(nullif(coalesce(p_log ->> 'updated_at', ''), '')::timestamptz, now())
    )
    on conflict (family_id, child_id, client_request_id) where client_request_id is not null do nothing
    returning * into v_log;
    if not found then
      select * into v_log from public.tablet_time where family_id = v_family_id and child_id = v_child_id and client_request_id = v_log_key limit 1;
    end if;
  end if;

  update public.tablet_time
  set status = v_status,
      note = nullif(coalesce(p_request ->> 'note', note), ''),
      payload = jsonb_build_object('kind', 'screen_time_request', 'screen_time_request', p_request),
      updated_at = coalesce(nullif(p_request ->> 'updated_at', '')::timestamptz, now())
  where id = v_request.id
  returning * into v_request;

  select coalesce(sum(amount), 0)::integer into v_stars_after from public.stars where family_id = v_family_id and child_id = v_child_id;
  select coalesce(sum(minutes), 0)::integer into v_minutes_after from public.tablet_time where family_id = v_family_id and child_id = v_child_id and entry_type = 'log';
  if v_stars_after < 0 or v_minutes_after < 0 then
    raise exception 'Stars or screen time cannot become negative' using errcode = '22003';
  end if;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'star', to_jsonb(v_star),
    'tablet_time', to_jsonb(v_log),
    'stars_before', v_stars_before,
    'stars_after', v_stars_after,
    'minutes_before', v_minutes_before,
    'minutes_after', v_minutes_after
  );
end;
$$;

revoke all on function public.review_screen_time_redemption_request(jsonb, jsonb, jsonb, text, uuid) from public;
grant execute on function public.review_screen_time_redemption_request(jsonb, jsonb, jsonb, text, uuid) to anon, authenticated;
