-- Dreamers Family V1.1 production auth and shared-family architecture.
-- Parent accounts use Supabase Auth. Every shared record is scoped by family_id.

create extension if not exists "pgcrypto";

alter table public.family_invitations
  add column if not exists invite_code text,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'accepted', 'revoked', 'expired'));

create unique index if not exists uq_family_invitations_active_code
  on public.family_invitations(family_id, invite_code)
  where invite_code is not null and status = 'active';

create or replace function public.ensure_profile_for_current_user()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  display_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  display_name := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    nullif(auth.jwt() ->> 'email', ''),
    'Parent'
  );

  insert into public.profiles (id, display_name, timezone, locale)
  values (current_user_id, display_name, 'Asia/Taipei', 'zh-TW')
  on conflict (id) do update set
    display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
    updated_at = now();

  return current_user_id;
end;
$$;

create or replace function public.create_family_for_current_user(family_name text)
returns table(family_id uuid, parent_id uuid, parent_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  created_family_id uuid;
  existing_family_id uuid;
  existing_role text;
  safe_name text := coalesce(nullif(trim(family_name), ''), '小小夢想家 Family');
begin
  current_user_id := public.ensure_profile_for_current_user();

  select p.family_id, fm.role
    into existing_family_id, existing_role
  from public.parents p
  join public.family_members fm
    on fm.family_id = p.family_id
   and fm.user_id = current_user_id
   and fm.status = 'active'
  where p.id = current_user_id
  limit 1;

  if existing_family_id is not null then
    return query select existing_family_id, current_user_id, existing_role;
    return;
  end if;

  insert into public.families (name, owner_id)
  values (safe_name, current_user_id)
  returning id into created_family_id;

  insert into public.family_members (family_id, user_id, role, status)
  values (created_family_id, current_user_id, 'owner', 'active')
  on conflict (family_id, user_id) do update set
    role = 'owner',
    status = 'active';

  insert into public.parents (id, family_id, display_name, email)
  values (
    current_user_id,
    created_family_id,
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), 'Parent'),
    auth.jwt() ->> 'email'
  )
  on conflict (id) do update set
    family_id = excluded.family_id,
    display_name = coalesce(nullif(excluded.display_name, ''), public.parents.display_name),
    email = excluded.email,
    updated_at = now();

  return query select created_family_id, current_user_id, 'owner'::text;
end;
$$;

create or replace function public.create_family_invite_code(target_role text default 'guardian')
returns table(family_id uuid, invite_code text, join_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_family_id uuid;
  generated_code text;
  safe_role text := coalesce(nullif(target_role, ''), 'guardian');
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if safe_role not in ('admin', 'guardian', 'viewer') then
    raise exception 'Invalid invite role';
  end if;

  select fm.family_id into current_family_id
  from public.family_members fm
  where fm.user_id = current_user_id
    and fm.status = 'active'
    and fm.role in ('owner', 'admin')
  order by fm.created_at
  limit 1;

  if current_family_id is null then
    raise exception 'Only family owner/admin can invite parents';
  end if;

  generated_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));

  insert into public.family_invitations (
    family_id,
    email,
    role,
    token_hash,
    invite_code,
    status,
    expires_at,
    created_by
  )
  values (
    current_family_id,
    '',
    safe_role,
    crypt(generated_code, gen_salt('bf')),
    generated_code,
    'active',
    now() + interval '14 days',
    current_user_id
  );

  return query select
    current_family_id,
    generated_code,
    '/join?familyId=' || current_family_id::text || '&inviteCode=' || generated_code;
end;
$$;

create or replace function public.get_family_invite_preview(target_family_id uuid, invite_code text)
returns table(family_id uuid, family_name text, parent_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation record;
  safe_code text := upper(trim(invite_code));
begin
  select fi.family_id, f.name, fi.role, fi.token_hash
    into invitation
  from public.family_invitations fi
  join public.families f on f.id = fi.family_id
  where fi.family_id = target_family_id
    and fi.invite_code = safe_code
    and fi.status = 'active'
    and fi.expires_at > now()
  order by fi.created_at desc
  limit 1;

  if invitation.family_id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  if invitation.token_hash is not null and invitation.token_hash <> crypt(safe_code, invitation.token_hash) then
    raise exception 'Invalid invite code';
  end if;

  return query select invitation.family_id, invitation.name, invitation.role::text;
end;
$$;

create or replace function public.join_family_with_invite_code(target_family_id uuid, invite_code text)
returns table(family_id uuid, parent_id uuid, parent_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  invitation record;
  existing_family_id uuid;
  safe_code text := upper(trim(invite_code));
begin
  current_user_id := public.ensure_profile_for_current_user();

  select p.family_id into existing_family_id
  from public.parents p
  where p.id = current_user_id
  limit 1;

  if existing_family_id is not null and existing_family_id <> target_family_id then
    raise exception 'This parent account already belongs to a family';
  end if;

  select * into invitation
  from public.family_invitations fi
  where fi.family_id = target_family_id
    and fi.invite_code = safe_code
    and fi.status = 'active'
    and fi.expires_at > now()
  order by fi.created_at desc
  limit 1;

  if invitation.id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  if invitation.token_hash is not null and invitation.token_hash <> crypt(safe_code, invitation.token_hash) then
    raise exception 'Invalid invite code';
  end if;

  insert into public.family_members (family_id, user_id, role, status)
  values (target_family_id, current_user_id, invitation.role, 'active')
  on conflict (family_id, user_id) do update set
    role = excluded.role,
    status = 'active';

  insert into public.parents (id, family_id, display_name, email)
  values (
    current_user_id,
    target_family_id,
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), 'Parent'),
    auth.jwt() ->> 'email'
  )
  on conflict (id) do update set
    family_id = excluded.family_id,
    display_name = coalesce(nullif(excluded.display_name, ''), public.parents.display_name),
    email = excluded.email,
    updated_at = now();

  update public.family_invitations
  set accepted_at = now(), status = 'accepted'
  where id = invitation.id;

  return query select target_family_id, current_user_id, invitation.role::text;
end;
$$;

grant execute on function public.ensure_profile_for_current_user() to authenticated;
grant execute on function public.create_family_for_current_user(text) to authenticated;
grant execute on function public.create_family_invite_code(text) to authenticated;
grant execute on function public.get_family_invite_preview(uuid, text) to anon, authenticated;
grant execute on function public.join_family_with_invite_code(uuid, text) to authenticated;
