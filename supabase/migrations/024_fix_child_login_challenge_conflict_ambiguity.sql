-- Fix ambiguous child login RPC conflict target.
--
-- Root cause:
-- - complete_child_login_challenge returns table columns named child_id and device_id.
-- - In PL/pgSQL those output columns are variables in the function body.
-- - A column-list ON CONFLICT target using the child/device columns can be
--   parsed ambiguously against those variables instead of only the
--   device_bindings columns.
--
-- This migration replaces the function body in production and keeps the same
-- QR + 4-digit PIN, device binding, rebind, validation, and heartbeat contract.

create or replace function public.complete_child_login_challenge(
  p_challenge_token text,
  p_pin text,
  p_device_id uuid,
  p_device_label text default null
)
returns table (
  challenge_id uuid,
  child_id uuid,
  child_name text,
  family_id uuid,
  device_binding_id text,
  device_id uuid,
  binding_status text,
  challenge_status text,
  bound_at timestamptz,
  birth_date date,
  theme_color text,
  remaining_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(p_challenge_token), '');
  v_pin text := nullif(trim(p_pin), '');
  v_token_hash text;
  v_challenge public.child_login_challenges%rowtype;
  v_child public.children%rowtype;
  v_now timestamptz := now();
  v_expected_hash text;
  v_binding_id text;
begin
  if v_token is null then
    raise exception 'Login challenge token is empty'
      using errcode = 'P0001', detail = 'CHALLENGE_TOKEN_EMPTY';
  end if;

  if v_pin is null or v_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be 4 digits'
      using errcode = 'P0001', detail = 'PIN_FORMAT_INVALID';
  end if;

  v_token_hash := public.child_login_challenge_token_hash(v_token);

  select challenge_row.*
  into v_challenge
  from public.child_login_challenges as challenge_row
  where challenge_row.challenge_token_hash = v_token_hash
  limit 1
  for update;

  if not found then
    raise exception 'Login challenge was not found'
      using errcode = 'P0001', detail = 'CHALLENGE_NOT_FOUND';
  end if;

  select child_row.*
  into v_child
  from public.children as child_row
  where child_row.id = v_challenge.child_id
    and child_row.family_id = v_challenge.family_id
    and child_row.status = 'active'
  for update;

  if not found then
    raise exception 'Child not found for login challenge'
      using errcode = 'P0001', detail = 'CHILD_NOT_FOUND';
  end if;

  if v_challenge.status = 'used' and v_challenge.device_binding_id is not null then
    select binding_row.id
    into v_binding_id
    from public.device_bindings as binding_row
    where binding_row.id = v_challenge.device_binding_id
      and binding_row.child_id = v_challenge.child_id
      and binding_row.family_id = v_challenge.family_id
      and binding_row.device_id = p_device_id
      and binding_row.device_binding_status = 'active'
    limit 1;

    if found then
      return query
      select
        v_challenge.id,
        v_child.id,
        v_child.display_name,
        v_child.family_id,
        v_binding_id,
        p_device_id,
        'active'::text,
        'used'::text,
        coalesce(v_challenge.used_at, v_now),
        v_child.birth_date,
        v_child.theme_color,
        greatest(v_challenge.max_attempts - v_challenge.failed_attempts, 0);
      return;
    end if;
  end if;

  if v_challenge.status <> 'pending' then
    raise exception 'Login challenge is not pending'
      using errcode = 'P0001', detail = case
        when v_challenge.status = 'used' then 'CHALLENGE_USED'
        when v_challenge.status = 'expired' then 'CHALLENGE_EXPIRED'
        when v_challenge.status = 'cancelled' then 'CHALLENGE_CANCELLED'
        else 'CHALLENGE_INVALID_STATUS'
      end;
  end if;

  if v_challenge.expires_at <= v_now then
    update public.child_login_challenges as challenge_row
    set
      status = 'expired',
      updated_at = v_now
    where challenge_row.id = v_challenge.id;

    raise exception 'Login challenge has expired'
      using errcode = 'P0001', detail = 'CHALLENGE_EXPIRED';
  end if;

  if v_challenge.failed_attempts >= v_challenge.max_attempts then
    update public.child_login_challenges as challenge_row
    set
      status = 'cancelled',
      cancelled_at = v_now,
      cancel_reason = 'too_many_attempts',
      updated_at = v_now
    where challenge_row.id = v_challenge.id;

    raise exception 'Too many PIN attempts'
      using errcode = 'P0001', detail = 'PIN_ATTEMPTS_EXCEEDED';
  end if;

  v_expected_hash := public.child_login_pin_hash(v_challenge.pin_salt, v_pin);

  if v_expected_hash <> v_challenge.pin_hash then
    update public.child_login_challenges as challenge_row
    set
      failed_attempts = challenge_row.failed_attempts + 1,
      status = case
        when challenge_row.failed_attempts + 1 >= challenge_row.max_attempts then 'cancelled'
        else challenge_row.status
      end,
      cancelled_at = case
        when challenge_row.failed_attempts + 1 >= challenge_row.max_attempts then v_now
        else challenge_row.cancelled_at
      end,
      cancel_reason = case
        when challenge_row.failed_attempts + 1 >= challenge_row.max_attempts then 'too_many_attempts'
        else challenge_row.cancel_reason
      end,
      updated_at = v_now
    where challenge_row.id = v_challenge.id
    returning * into v_challenge;

    raise exception 'PIN is incorrect'
      using
        errcode = 'P0001',
        detail = 'PIN_INCORRECT',
        hint = greatest(v_challenge.max_attempts - v_challenge.failed_attempts, 0)::text;
  end if;

  update public.device_bindings as binding_row
  set
    device_binding_status = 'replaced',
    binding_status = 'unbound',
    qr_token_status = case
      when binding_row.qr_token_status = 'active' then 'revoked'
      else binding_row.qr_token_status
    end,
    replaced_at = coalesce(binding_row.replaced_at, v_now),
    revoked_at = coalesce(binding_row.revoked_at, v_now),
    revoke_reason = 'replaced_by_child_login_challenge',
    updated_at = v_now
  where binding_row.child_id = v_child.id
    and binding_row.family_id = v_child.family_id
    and binding_row.device_binding_status = 'active'
    and binding_row.device_id <> p_device_id;

  v_binding_id := v_child.id::text || ':' || p_device_id::text;

  insert into public.device_bindings (
    id,
    token,
    family_id,
    child_id,
    child_name,
    device_id,
    expires_at,
    used_at,
    revoked_at,
    last_login_at,
    last_login_device,
    binding_status,
    qr_token_status,
    device_binding_status,
    challenge_id,
    activated_at,
    last_heartbeat_at,
    created_at,
    updated_at
  )
  values (
    v_binding_id,
    null,
    v_child.family_id,
    v_child.id,
    v_child.display_name,
    p_device_id,
    v_now + interval '10 years',
    v_now,
    null,
    v_now,
    p_device_label,
    'bound',
    'consumed',
    'active',
    v_challenge.id,
    v_now,
    v_now,
    v_now,
    v_now
  )
  on conflict on constraint device_bindings_child_device_key
  do update set
    token = null,
    family_id = excluded.family_id,
    child_name = excluded.child_name,
    expires_at = excluded.expires_at,
    used_at = excluded.used_at,
    revoked_at = null,
    last_login_at = excluded.last_login_at,
    last_login_device = excluded.last_login_device,
    binding_status = 'bound',
    qr_token_status = 'consumed',
    device_binding_status = 'active',
    challenge_id = excluded.challenge_id,
    activated_at = excluded.activated_at,
    replaced_at = null,
    last_heartbeat_at = excluded.last_heartbeat_at,
    revoke_reason = null,
    updated_at = excluded.updated_at
  returning public.device_bindings.id into v_binding_id;

  update public.child_login_challenges as challenge_row
  set
    status = 'used',
    verified_at = coalesce(challenge_row.verified_at, v_now),
    used_at = coalesce(challenge_row.used_at, v_now),
    device_binding_id = v_binding_id,
    updated_at = v_now
  where challenge_row.id = v_challenge.id
  returning * into v_challenge;

  return query
  select
    v_challenge.id,
    v_child.id,
    v_child.display_name,
    v_child.family_id,
    v_binding_id,
    p_device_id,
    'active'::text,
    'used'::text,
    coalesce(v_challenge.used_at, v_now),
    v_child.birth_date,
    v_child.theme_color,
    greatest(v_challenge.max_attempts - v_challenge.failed_attempts, 0);
end;
$$;

revoke all on function public.complete_child_login_challenge(text, text, uuid, text) from public;
grant execute on function public.complete_child_login_challenge(text, text, uuid, text) to anon, authenticated;
