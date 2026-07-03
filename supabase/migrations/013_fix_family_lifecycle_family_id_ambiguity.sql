set check_function_bodies = off;

create or replace function public.create_family_invite_code(target_role text default 'guardian')
returns table(family_id uuid, invite_code text, join_path text)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_current_user_id uuid := auth.uid();
  v_current_family_id uuid;
  v_generated_code text;
  v_safe_role text := coalesce(nullif(target_role, ''), 'guardian');
begin
  if v_current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_safe_role not in ('admin', 'guardian', 'viewer') then
    raise exception 'Invalid invite role';
  end if;

  select fm.family_id
    into v_current_family_id
  from public.family_members as fm
  where fm.user_id = v_current_user_id
    and fm.status = 'active'
    and fm.role in ('owner', 'admin')
  order by fm.created_at
  limit 1;

  if v_current_family_id is null then
    raise exception 'Only family owner/admin can invite parents';
  end if;

  update public.family_invitations as fi
  set status = 'revoked'
  where fi.family_id = v_current_family_id
    and fi.status = 'active';

  v_generated_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));

  insert into public.family_invitations as fi (
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
    v_current_family_id,
    '',
    v_safe_role,
    crypt(v_generated_code, gen_salt('bf')),
    v_generated_code,
    'active',
    now() + interval '7 days',
    v_current_user_id
  );

  return query select
    v_current_family_id,
    v_generated_code,
    '/join-parent?familyId=' || v_current_family_id::text || '&inviteCode=' || v_generated_code;
end;
$function$;

create or replace function public.join_family_with_invite_code(target_family_id uuid, invite_code text)
returns table(family_id uuid, parent_id uuid, parent_role text)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_current_user_id uuid;
  v_invitation record;
  v_existing_family_id uuid;
  v_safe_code text := upper(trim(invite_code));
begin
  v_current_user_id := public.ensure_profile_for_current_user();

  select fm.family_id
    into v_existing_family_id
  from public.family_members as fm
  where fm.user_id = v_current_user_id
    and fm.status = 'active'
  order by fm.created_at
  limit 1;

  if v_existing_family_id is not null and v_existing_family_id <> target_family_id then
    raise exception 'This parent account already belongs to a family';
  end if;

  select * into v_invitation
  from public.family_invitations as fi
  where fi.family_id = target_family_id
    and fi.invite_code = v_safe_code
    and fi.status = 'active'
    and fi.expires_at > now()
  order by fi.created_at desc
  limit 1;

  if v_invitation.id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  if v_invitation.token_hash is not null and v_invitation.token_hash <> crypt(v_safe_code, v_invitation.token_hash) then
    raise exception 'Invalid invite code';
  end if;

  insert into public.family_members as fm (family_id, user_id, role, status)
  values (target_family_id, v_current_user_id, v_invitation.role, 'active')
  on conflict (family_id, user_id) do update set
    role = excluded.role,
    status = 'active';

  insert into public.parents as p (
    id,
    family_id,
    display_name,
    email,
    parent_role,
    relation,
    device_bound
  )
  values (
    v_current_user_id,
    target_family_id,
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), 'Parent'),
    auth.jwt() ->> 'email',
    case when v_invitation.role = 'owner' then 'owner' else 'parent' end,
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), 'Parent'),
    false
  )
  on conflict (id) do update set
    family_id = excluded.family_id,
    display_name = coalesce(nullif(p.display_name, ''), excluded.display_name),
    email = excluded.email,
    parent_role = excluded.parent_role,
    relation = coalesce(p.relation, excluded.relation),
    updated_at = now();

  update public.family_invitations as fi
  set accepted_at = now(), status = 'accepted'
  where fi.id = v_invitation.id;

  return query select target_family_id, v_current_user_id, v_invitation.role::text;
end;
$function$;

create or replace function public.leave_current_family()
returns table(parent_id uuid, family_id uuid, parent_role text)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_current_user_id uuid := auth.uid();
  v_membership record;
begin
  if v_current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select fm.family_id, fm.role
    into v_membership
  from public.family_members as fm
  where fm.user_id = v_current_user_id
    and fm.status = 'active'
  order by fm.created_at
  limit 1;

  if v_membership.family_id is null then
    raise exception 'This parent account is not currently in a family';
  end if;

  if v_membership.role = 'owner' then
    raise exception 'Owner must transfer ownership before leaving the family';
  end if;

  update public.family_members as fm
  set status = 'removed'
  where fm.family_id = v_membership.family_id
    and fm.user_id = v_current_user_id;

  update public.parents as p
  set family_id = null,
      updated_at = now()
  where p.id = v_current_user_id
    and p.family_id = v_membership.family_id;

  return query select v_current_user_id, v_membership.family_id, v_membership.role::text;
end;
$function$;

create or replace function public.bind_parent_device_with_invite(target_family_id uuid, invite_code text, parent_name text, parent_relation text, device_label text)
returns table(family_id uuid, parent_id uuid, parent_role text)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_invitation record;
  v_created_parent_id uuid := gen_random_uuid();
  v_safe_code text := upper(trim(invite_code));
  v_safe_name text := coalesce(nullif(trim(parent_name), ''), '家長');
  v_safe_relation text := coalesce(nullif(trim(parent_relation), ''), '其他');
begin
  select *
    into v_invitation
  from public.family_invitations as fi
  where fi.family_id = target_family_id
    and fi.invite_code = v_safe_code
    and fi.status = 'active'
    and fi.expires_at > now()
  order by fi.created_at desc
  limit 1;

  if v_invitation.id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  if v_invitation.token_hash is not null and v_invitation.token_hash <> crypt(v_safe_code, v_invitation.token_hash) then
    raise exception 'Invalid invite code';
  end if;

  insert into public.profiles (id, display_name, timezone, locale)
  values (v_created_parent_id, v_safe_name, 'Asia/Taipei', 'zh-TW')
  on conflict (id) do update set
    display_name = excluded.display_name,
    updated_at = now();

  insert into public.parents (
    id,
    family_id,
    display_name,
    email,
    parent_role,
    relation,
    device_label,
    last_seen_at,
    device_bound,
    settings
  )
  values (
    v_created_parent_id,
    target_family_id,
    v_safe_name,
    null,
    'parent',
    v_safe_relation,
    nullif(trim(device_label), ''),
    now(),
    true,
    '{}'::jsonb
  );

  return query select target_family_id, v_created_parent_id, 'parent'::text;
end;
$function$;
