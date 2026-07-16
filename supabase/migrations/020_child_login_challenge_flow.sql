-- Child login challenge flow.
--
-- Non-destructive migration:
-- - Adds a separate login challenge table.
-- - Keeps legacy child_token / bind_child_device_with_token flow intact.
-- - Adds device binding status metadata used by the new PIN login flow.

create extension if not exists "pgcrypto";

alter table public.device_bindings
  add column if not exists device_binding_status text not null default 'active',
  add column if not exists challenge_id uuid,
  add column if not exists activated_at timestamptz,
  add column if not exists replaced_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists revoke_reason text;

do $$
begin
  alter table public.device_bindings
    drop constraint if exists device_bindings_device_binding_status_check;

  alter table public.device_bindings
    add constraint device_bindings_device_binding_status_check
    check (device_binding_status in ('active', 'revoked', 'replaced', 'expired'));
end $$;

create table if not exists public.child_login_challenges (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  challenge_token_hash text not null unique,
  pin_hash text not null,
  pin_salt text not null,
  status text not null default 'pending',
  failed_attempts integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  verified_at timestamptz,
  used_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  device_binding_id text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_login_challenges_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id)
    on delete cascade,
  constraint child_login_challenges_status_check
    check (status in ('pending', 'verified', 'used', 'expired', 'cancelled')),
  constraint child_login_challenges_failed_attempts_check
    check (failed_attempts >= 0 and failed_attempts <= max_attempts),
  constraint child_login_challenges_max_attempts_check
    check (max_attempts between 1 and 10)
);

alter table public.device_bindings
  drop constraint if exists device_bindings_challenge_id_fkey;

alter table public.device_bindings
  add constraint device_bindings_challenge_id_fkey
  foreign key (challenge_id)
  references public.child_login_challenges(id)
  on delete set null;

create index if not exists idx_child_login_challenges_child_status
  on public.child_login_challenges(family_id, child_id, status, updated_at desc);

create index if not exists idx_child_login_challenges_expires_at
  on public.child_login_challenges(expires_at);

create index if not exists idx_device_bindings_active_child
  on public.device_bindings(child_id, device_binding_status, updated_at desc);

drop trigger if exists set_child_login_challenges_updated_at on public.child_login_challenges;
create trigger set_child_login_challenges_updated_at
before update on public.child_login_challenges
for each row execute function public.set_updated_at();

alter table public.child_login_challenges enable row level security;

revoke all privileges on table public.child_login_challenges from anon;
grant select, insert, update, delete on public.child_login_challenges to authenticated;

drop policy if exists child_login_challenges_select_family on public.child_login_challenges;
drop policy if exists child_login_challenges_insert_family_guardian on public.child_login_challenges;
drop policy if exists child_login_challenges_update_family_guardian on public.child_login_challenges;
drop policy if exists child_login_challenges_delete_family_admin on public.child_login_challenges;

create policy child_login_challenges_select_family
on public.child_login_challenges
for select
to authenticated
using (public.is_family_member(family_id));

create policy child_login_challenges_insert_family_guardian
on public.child_login_challenges
for insert
to authenticated
with check (public.can_write_family(family_id));

create policy child_login_challenges_update_family_guardian
on public.child_login_challenges
for update
to authenticated
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy child_login_challenges_delete_family_admin
on public.child_login_challenges
for delete
to authenticated
using (public.has_family_role(family_id, array['owner', 'admin']));

create or replace function public.child_login_challenge_token_hash(p_token text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(convert_to(coalesce(p_token, ''), 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.child_login_pin_hash(p_salt text, p_pin text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(convert_to(coalesce(p_salt, '') || ':' || coalesce(p_pin, ''), 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.create_child_login_challenge(
  p_child_id uuid,
  p_replace_existing_binding boolean default false
)
returns table (
  challenge_id uuid,
  child_id uuid,
  child_name text,
  challenge_token text,
  pin text,
  expires_at timestamptz,
  remaining_attempts integer,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_token text;
  v_token_hash text;
  v_pin text;
  v_pin_salt text;
  v_now timestamptz := now();
  v_challenge_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Parent authentication is required'
      using errcode = 'P0001', detail = 'AUTH_REQUIRED';
  end if;

  select c.*
  into v_child
  from public.children as c
  where c.id = p_child_id
    and c.status = 'active'
  for update;

  if not found then
    raise exception 'Child not found'
      using errcode = 'P0001', detail = 'CHILD_NOT_FOUND';
  end if;

  if not public.can_write_family(v_child.family_id) then
    raise exception 'Not allowed to create a child login challenge'
      using errcode = 'P0001', detail = 'FAMILY_PERMISSION_DENIED';
  end if;

  update public.child_login_challenges as challenge_row
  set
    status = 'cancelled',
    cancelled_at = v_now,
    cancel_reason = 'replaced_by_new_challenge',
    updated_at = v_now
  where challenge_row.child_id = v_child.id
    and challenge_row.family_id = v_child.family_id
    and challenge_row.status = 'pending';

  if p_replace_existing_binding then
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
      revoke_reason = 'rebind_requested',
      updated_at = v_now
    where binding_row.child_id = v_child.id
      and binding_row.family_id = v_child.family_id
      and binding_row.device_binding_status = 'active';
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_token_hash := public.child_login_challenge_token_hash(v_token);
  v_pin := lpad(floor(random() * 10000)::int::text, 4, '0');
  v_pin_salt := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.child_login_challenges (
    family_id,
    child_id,
    challenge_token_hash,
    pin_hash,
    pin_salt,
    status,
    failed_attempts,
    max_attempts,
    expires_at,
    created_by
  )
  values (
    v_child.family_id,
    v_child.id,
    v_token_hash,
    public.child_login_pin_hash(v_pin_salt, v_pin),
    v_pin_salt,
    'pending',
    0,
    5,
    v_now + interval '10 minutes',
    auth.uid()
  )
  returning id into v_challenge_id;

  return query
  select
    v_challenge_id,
    v_child.id,
    v_child.display_name,
    v_token,
    v_pin,
    v_now + interval '10 minutes',
    5,
    'pending'::text;
end;
$$;

create or replace function public.resolve_child_login_challenge(
  p_challenge_token text
)
returns table (
  challenge_id uuid,
  child_name text,
  expires_at timestamptz,
  remaining_attempts integer,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_hash text := public.child_login_challenge_token_hash(nullif(trim(p_challenge_token), ''));
  v_challenge public.child_login_challenges%rowtype;
  v_child public.children%rowtype;
  v_now timestamptz := now();
begin
  if nullif(trim(p_challenge_token), '') is null then
    raise exception 'Login challenge token is empty'
      using errcode = 'P0001', detail = 'CHALLENGE_TOKEN_EMPTY';
  end if;

  select challenge_row.*
  into v_challenge
  from public.child_login_challenges as challenge_row
  where challenge_row.challenge_token_hash = v_token_hash
  limit 1;

  if not found then
    raise exception 'Login challenge was not found'
      using errcode = 'P0001', detail = 'CHALLENGE_NOT_FOUND';
  end if;

  if v_challenge.status = 'pending' and v_challenge.expires_at <= v_now then
    update public.child_login_challenges as challenge_row
    set
      status = 'expired',
      updated_at = v_now
    where challenge_row.id = v_challenge.id;
    v_challenge.status := 'expired';
  end if;

  select c.*
  into v_child
  from public.children as c
  where c.id = v_challenge.child_id
    and c.family_id = v_challenge.family_id
    and c.status = 'active';

  if not found then
    raise exception 'Child not found for login challenge'
      using errcode = 'P0001', detail = 'CHILD_NOT_FOUND';
  end if;

  return query
  select
    v_challenge.id,
    v_child.display_name,
    v_challenge.expires_at,
    greatest(v_challenge.max_attempts - v_challenge.failed_attempts, 0),
    v_challenge.status;
end;
$$;

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

  select c.*
  into v_child
  from public.children as c
  where c.id = v_challenge.child_id
    and c.family_id = v_challenge.family_id
    and c.status = 'active'
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
  on conflict (child_id, device_id)
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
  returning id into v_binding_id;

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

create or replace function public.validate_child_device_session(
  p_child_id uuid,
  p_device_binding_id text,
  p_device_id uuid
)
returns table (
  child_id uuid,
  child_name text,
  family_id uuid,
  device_binding_id text,
  device_id uuid,
  binding_status text,
  last_heartbeat_at timestamptz,
  valid boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update public.device_bindings as binding_row
  set
    last_heartbeat_at = v_now,
    last_login_at = coalesce(binding_row.last_login_at, v_now),
    updated_at = v_now
  where binding_row.id = p_device_binding_id
    and binding_row.child_id = p_child_id
    and binding_row.device_id = p_device_id
    and binding_row.binding_status = 'bound'
    and binding_row.device_binding_status = 'active'
    and binding_row.revoked_at is null;

  return query
  select
    c.id,
    c.display_name,
    c.family_id,
    db.id,
    db.device_id,
    db.device_binding_status,
    db.last_heartbeat_at,
    true
  from public.device_bindings as db
  join public.children as c
    on c.id = db.child_id
   and c.family_id = db.family_id
  where db.id = p_device_binding_id
    and db.child_id = p_child_id
    and db.device_id = p_device_id
    and db.binding_status = 'bound'
    and db.device_binding_status = 'active'
    and db.revoked_at is null
    and c.status = 'active'
  limit 1;
end;
$$;

create or replace function public.heartbeat_child_device_session(
  p_child_id uuid,
  p_device_binding_id text,
  p_device_id uuid
)
returns table (
  child_id uuid,
  device_binding_id text,
  last_heartbeat_at timestamptz,
  valid boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update public.device_bindings as binding_row
  set
    last_heartbeat_at = v_now,
    updated_at = v_now
  where binding_row.id = p_device_binding_id
    and binding_row.child_id = p_child_id
    and binding_row.device_id = p_device_id
    and binding_row.binding_status = 'bound'
    and binding_row.device_binding_status = 'active'
    and binding_row.revoked_at is null;

  return query
  select
    db.child_id,
    db.id,
    db.last_heartbeat_at,
    true
  from public.device_bindings as db
  where db.id = p_device_binding_id
    and db.child_id = p_child_id
    and db.device_id = p_device_id
    and db.binding_status = 'bound'
    and db.device_binding_status = 'active'
    and db.revoked_at is null
  limit 1;
end;
$$;

revoke all on function public.child_login_challenge_token_hash(text) from public;
revoke all on function public.child_login_pin_hash(text, text) from public;
revoke all on function public.create_child_login_challenge(uuid, boolean) from public;
revoke all on function public.resolve_child_login_challenge(text) from public;
revoke all on function public.complete_child_login_challenge(text, text, uuid, text) from public;
revoke all on function public.validate_child_device_session(uuid, text, uuid) from public;
revoke all on function public.heartbeat_child_device_session(uuid, text, uuid) from public;

grant execute on function public.create_child_login_challenge(uuid, boolean) to authenticated;
grant execute on function public.resolve_child_login_challenge(text) to anon, authenticated;
grant execute on function public.complete_child_login_challenge(text, text, uuid, text) to anon, authenticated;
grant execute on function public.validate_child_device_session(uuid, text, uuid) to anon, authenticated;
grant execute on function public.heartbeat_child_device_session(uuid, text, uuid) to anon, authenticated;
