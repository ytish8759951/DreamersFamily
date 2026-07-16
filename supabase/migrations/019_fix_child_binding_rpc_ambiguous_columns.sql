-- Qualify child binding RPC column references that overlap with RETURNS TABLE
-- output parameter names. This changes only function SQL; no data is removed.

create or replace function public.bind_child_device_with_token(
  p_token text,
  p_device_id uuid,
  p_last_login_device text default null
)
returns table (
  id uuid,
  family_id uuid,
  display_name text,
  birth_date date,
  theme_color text,
  status text,
  child_token text,
  child_token_updated_at timestamptz,
  child_token_consumed_at timestamptz,
  binding_id text,
  binding_expires_at timestamptz,
  binding_used_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(p_token), '');
  v_binding public.device_bindings%rowtype;
  v_child public.children%rowtype;
  v_now timestamptz := now();
begin
  if v_token is null then
    raise exception 'Child token is empty'
      using errcode = 'P0001', detail = 'CHILD_TOKEN_EMPTY';
  end if;

  select db.*
  into v_binding
  from public.device_bindings as db
  where db.token = v_token
  order by
    case when db.qr_token_status = 'active' and db.used_at is null and db.revoked_at is null then 0 else 1 end,
    db.updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'QR binding record not found'
      using errcode = 'P0001', detail = 'QR_BINDING_NOT_FOUND';
  end if;

  if v_binding.revoked_at is not null or v_binding.qr_token_status = 'revoked' then
    raise exception 'QR token has been revoked'
      using errcode = 'P0001', detail = 'QR_USED';
  end if;

  if v_binding.used_at is not null or v_binding.qr_token_status = 'consumed' then
    raise exception 'QR token has already been used'
      using errcode = 'P0001', detail = 'QR_USED';
  end if;

  if v_binding.expires_at is not null and v_binding.expires_at <= v_now then
    raise exception 'QR token has expired'
      using errcode = 'P0001', detail = 'QR_EXPIRED';
  end if;

  select child_row.*
  into v_child
  from public.children as child_row
  where child_row.id = v_binding.child_id
    and child_row.family_id = v_binding.family_id
    and child_row.status = 'active'
  for update;

  if not found then
    raise exception 'Child not found for QR binding'
      using errcode = 'P0001', detail = 'CHILD_NOT_FOUND';
  end if;

  if v_child.child_token is not null and v_child.child_token <> v_token then
    raise exception 'QR token does not match child record'
      using errcode = 'P0001', detail = 'QR_CHILD_MISMATCH';
  end if;

  update public.device_bindings as binding_row
  set
    device_id = p_device_id,
    binding_status = 'bound',
    qr_token_status = 'consumed',
    used_at = v_now,
    revoked_at = null,
    last_login_at = v_now,
    last_login_device = p_last_login_device,
    updated_at = v_now
  where binding_row.id = v_binding.id;

  update public.children as child_row
  set
    child_token_consumed_at = coalesce(child_row.child_token_consumed_at, v_now),
    updated_at = v_now
  where child_row.id = v_child.id;

  return query
  select
    v_child.id,
    v_child.family_id,
    v_child.display_name,
    v_child.birth_date,
    v_child.theme_color,
    v_child.status,
    v_token,
    v_child.child_token_updated_at,
    coalesce(v_child.child_token_consumed_at, v_now),
    v_binding.id,
    v_binding.expires_at,
    v_now;
end;
$$;

revoke all on function public.bind_child_device_with_token(text, uuid, text) from public;
grant execute on function public.bind_child_device_with_token(text, uuid, text) to anon, authenticated;
