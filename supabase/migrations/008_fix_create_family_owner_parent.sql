-- Fix create-family owner parent persistence and explicit self-update policy.

alter table public.parents
  add column if not exists parent_role text not null default 'parent'
    check (parent_role in ('owner', 'parent')),
  add column if not exists relation text,
  add column if not exists device_label text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists device_bound boolean not null default false;

drop policy if exists parents_update_self on public.parents;
create policy parents_update_self
on public.parents for update
using (id = auth.uid())
with check (id = auth.uid());

drop function if exists public.create_family_for_current_user(text);

create function public.create_family_for_current_user(family_name text)
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

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select fm.family_id, fm.role
    into existing_family_id, existing_role
  from public.family_members fm
  where fm.user_id = current_user_id
    and fm.status = 'active'
  order by fm.created_at
  limit 1;

  if existing_family_id is not null then
    insert into public.parents (
      id,
      family_id,
      display_name,
      email,
      parent_role,
      relation,
      device_bound
    )
    values (
      current_user_id,
      existing_family_id,
      coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), nullif(auth.jwt() ->> 'email', ''), 'Parent'),
      auth.jwt() ->> 'email',
      case when existing_role = 'owner' then 'owner' else 'parent' end,
      coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), nullif(auth.jwt() ->> 'email', ''), 'Parent'),
      false
    )
    on conflict (id) do update set
      family_id = excluded.family_id,
      display_name = coalesce(nullif(public.parents.display_name, ''), excluded.display_name),
      email = coalesce(public.parents.email, excluded.email),
      parent_role = excluded.parent_role,
      relation = coalesce(public.parents.relation, excluded.relation),
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

  insert into public.parents (
    id,
    family_id,
    display_name,
    email,
    parent_role,
    relation,
    device_bound
  )
  values (
    current_user_id,
    created_family_id,
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), nullif(auth.jwt() ->> 'email', ''), 'Parent'),
    auth.jwt() ->> 'email',
    'owner',
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), nullif(auth.jwt() ->> 'email', ''), 'Parent'),
    false
  )
  on conflict (id) do update set
    family_id = excluded.family_id,
    display_name = coalesce(nullif(excluded.display_name, ''), public.parents.display_name),
    email = excluded.email,
    parent_role = 'owner',
    relation = coalesce(public.parents.relation, excluded.relation),
    updated_at = now();

  return query select created_family_id, current_user_id, 'owner'::text;
end;
$$;

grant execute on function public.create_family_for_current_user(text) to authenticated;
