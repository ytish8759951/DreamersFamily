-- Make screen-time redemption approval robust when the caller reuses the same
-- request client_request_id for the request row and the tablet-time log row.

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
  v_request_key text := coalesce(nullif(p_request ->> 'client_request_id', ''), 'screen-time-request:' || v_request_id::text);
  v_star_key text := coalesce(nullif(coalesce(p_star ->> 'idempotency_key', ''), ''), v_request_key || ':stars');
  v_log_key text := coalesce(nullif(coalesce(p_log ->> 'idempotency_key', ''), ''), nullif(coalesce(p_log ->> 'client_request_id', ''), ''), v_request_key || ':tablet-time');
  v_stars_before integer;
  v_minutes_before integer;
  v_stars_after integer;
  v_minutes_after integer;
begin
  if v_log_key = v_request_key then
    v_log_key := v_request_key || ':tablet-time';
  end if;

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
    select * into v_log from public.tablet_time where family_id = v_family_id and child_id = v_child_id and client_request_id = v_log_key and entry_type = 'log' limit 1;
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
      select * into v_log from public.tablet_time where family_id = v_family_id and child_id = v_child_id and client_request_id = v_log_key and entry_type = 'log' limit 1;
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
