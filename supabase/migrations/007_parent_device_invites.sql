-- Dreamers Family V1.0 parent device invitations.
-- Second parents join by device binding, without Supabase Auth.

alter table public.parents
  add column if not exists parent_role text not null default 'parent'
    check (parent_role in ('owner', 'parent')),
  add column if not exists relation text,
  add column if not exists device_label text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists device_bound boolean not null default false;

update public.parents p
set parent_role = 'owner'
where exists (
  select 1
  from public.family_members fm
  where fm.family_id = p.family_id
    and fm.user_id = p.id
    and fm.role = 'owner'
    and fm.status = 'active'
);

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

  update public.family_invitations
  set status = 'revoked'
  where family_id = current_family_id
    and status = 'active';

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
    now() + interval '7 days',
    current_user_id
  );

  return query select
    current_family_id,
    generated_code,
    '/join-parent?familyId=' || current_family_id::text || '&inviteCode=' || generated_code;
end;
$$;

grant execute on function public.create_family_invite_code(text) to authenticated;

create or replace function public.bind_parent_device_with_invite(
  target_family_id uuid,
  invite_code text,
  parent_name text,
  parent_relation text,
  device_label text
)
returns table(family_id uuid, parent_id uuid, parent_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation record;
  created_parent_id uuid := gen_random_uuid();
  safe_code text := upper(trim(invite_code));
  safe_name text := coalesce(nullif(trim(parent_name), ''), '家長');
  safe_relation text := coalesce(nullif(trim(parent_relation), ''), '其他');
begin
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

  insert into public.profiles (id, display_name, timezone, locale)
  values (created_parent_id, safe_name, 'Asia/Taipei', 'zh-TW')
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
    created_parent_id,
    target_family_id,
    safe_name,
    null,
    'parent',
    safe_relation,
    nullif(trim(device_label), ''),
    now(),
    true,
    '{}'::jsonb
  );

  return query select target_family_id, created_parent_id, 'parent'::text;
end;
$$;

grant execute on function public.bind_parent_device_with_invite(uuid, text, text, text, text) to anon, authenticated;

create or replace function public.revoke_parent_device_binding(
  target_parent_id uuid,
  target_family_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_family_role(target_family_id, array['owner', 'admin']) then
    raise exception 'Only family owner/admin can revoke parent device bindings';
  end if;

  update public.parents
  set family_id = null,
      device_bound = false,
      updated_at = now()
  where id = target_parent_id
    and family_id = target_family_id
    and parent_role <> 'owner';
end;
$$;

grant execute on function public.revoke_parent_device_binding(uuid, uuid) to authenticated;
