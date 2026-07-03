-- Dreamers Family V1.1 persistent parent family binding.
-- Keeps parent accounts bound to their family until explicit leave, and provides a safe leave RPC.

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

  select fm.family_id, fm.role
    into existing_family_id, existing_role
  from public.family_members fm
  where fm.user_id = current_user_id
    and fm.status = 'active'
  order by fm.created_at
  limit 1;

  if existing_family_id is not null then
    insert into public.parents (id, family_id, display_name, email)
    values (
      current_user_id,
      existing_family_id,
      coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), 'Parent'),
      auth.jwt() ->> 'email'
    )
    on conflict (id) do update set
      family_id = excluded.family_id,
      display_name = coalesce(nullif(public.parents.display_name, ''), excluded.display_name),
      email = coalesce(public.parents.email, excluded.email),
      updated_at = now();

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

  select fm.family_id into existing_family_id
  from public.family_members fm
  where fm.user_id = current_user_id
    and fm.status = 'active'
  order by fm.created_at
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

create or replace function public.leave_current_family()
returns table(parent_id uuid, family_id uuid, parent_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  membership record;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select fm.family_id, fm.role into membership
  from public.family_members fm
  where fm.user_id = current_user_id
    and fm.status = 'active'
  order by fm.created_at
  limit 1;

  if membership.family_id is null then
    raise exception 'This parent account is not currently in a family';
  end if;

  if membership.role = 'owner' then
    raise exception 'Owner must transfer ownership before leaving the family';
  end if;

  update public.family_members
  set status = 'removed'
  where family_id = membership.family_id
    and user_id = current_user_id;

  update public.parents
  set family_id = null,
      updated_at = now()
  where id = current_user_id
    and family_id = membership.family_id;

  return query select current_user_id, membership.family_id, membership.role::text;
end;
$$;

grant execute on function public.create_family_for_current_user(text) to authenticated;
grant execute on function public.join_family_with_invite_code(uuid, text) to authenticated;
grant execute on function public.leave_current_family() to authenticated;
