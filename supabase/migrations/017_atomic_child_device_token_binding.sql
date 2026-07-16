-- Atomic child-device QR token binding.
--
-- This migration is intentionally self-contained because production may not
-- have the earlier device_bindings token migration applied yet.

alter table public.device_bindings
  add column if not exists token text,
  add column if not exists child_name text,
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists revoked_at timestamptz;

update public.device_bindings db
set
  token = coalesce(db.token, c.child_token),
  child_name = coalesce(nullif(db.child_name, ''), c.display_name),
  expires_at = coalesce(db.expires_at, coalesce(c.child_token_updated_at, db.created_at) + interval '24 hours'),
  used_at = coalesce(db.used_at, c.child_token_consumed_at),
  revoked_at = case
    when db.qr_token_status = 'revoked' then coalesce(db.revoked_at, db.updated_at)
    else db.revoked_at
  end
from public.children c
where c.id = db.child_id
  and c.family_id = db.family_id;

alter table public.device_bindings
  alter column child_name set default '',
  alter column expires_at set default (now() + interval '24 hours');

create index if not exists idx_device_bindings_token
  on public.device_bindings(token)
  where token is not null;

revoke select, insert, update, delete on public.device_bindings from anon;
grant select, insert, update, delete on public.device_bindings to authenticated;

drop policy if exists repository_foundation_all on public.device_bindings;
drop policy if exists device_bindings_repository_sync_all on public.device_bindings;
drop policy if exists device_bindings_select_family on public.device_bindings;
drop policy if exists device_bindings_insert_family_guardian on public.device_bindings;
drop policy if exists device_bindings_update_family_guardian on public.device_bindings;
drop policy if exists device_bindings_delete_family_admin on public.device_bindings;

create policy device_bindings_select_family
on public.device_bindings
for select
to authenticated
using (is_family_member(family_id));

create policy device_bindings_insert_family_guardian
on public.device_bindings
for insert
to authenticated
with check (can_write_family(family_id));

create policy device_bindings_update_family_guardian
on public.device_bindings
for update
to authenticated
using (can_write_family(family_id))
with check (can_write_family(family_id));

create policy device_bindings_delete_family_admin
on public.device_bindings
for delete
to authenticated
using (has_family_role(family_id, array['owner', 'admin']));

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
  from public.device_bindings db
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

  select c.*
  into v_child
  from public.children c
  where c.id = v_binding.child_id
    and c.family_id = v_binding.family_id
    and c.status = 'active'
  for update;

  if not found then
    raise exception 'Child not found for QR binding'
      using errcode = 'P0001', detail = 'CHILD_NOT_FOUND';
  end if;

  if v_child.child_token is not null and v_child.child_token <> v_token then
    raise exception 'QR token does not match child record'
      using errcode = 'P0001', detail = 'QR_CHILD_MISMATCH';
  end if;

  update public.device_bindings
  set
    device_id = p_device_id,
    binding_status = 'bound',
    qr_token_status = 'consumed',
    used_at = v_now,
    revoked_at = null,
    last_login_at = v_now,
    last_login_device = p_last_login_device,
    updated_at = v_now
  where public.device_bindings.id = v_binding.id;

  update public.children
  set
    child_token_consumed_at = coalesce(child_token_consumed_at, v_now),
    updated_at = v_now
  where public.children.id = v_child.id;

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
