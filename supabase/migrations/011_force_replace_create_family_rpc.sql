-- Force replace create_family_for_current_user so production cannot retain an older ambiguous body.
-- Keeps UUID primary keys for all other entities; only families expose a stable family_code.

drop function if exists public.create_family_for_current_user(text);

create function public.create_family_for_current_user(family_name text)
returns table(family_id uuid, parent_id uuid, parent_role text, family_code text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_parent_id uuid;
  v_parent_role text;
  v_family_code text;
  v_existing_family_id uuid;
  v_existing_role text;
  v_safe_name text := coalesce(nullif(trim(family_name), ''), '小小夢想家 Family');
begin
  v_user_id := public.ensure_profile_for_current_user();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select fm.family_id, fm.role
    into v_existing_family_id, v_existing_role
  from public.family_members as fm
  where fm.user_id = v_user_id
    and fm.status = 'active'
  order by fm.created_at
  limit 1;

  if v_existing_family_id is not null then
    select f.family_code
      into v_family_code
    from public.families as f
    where f.id = v_existing_family_id
    limit 1;

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
      v_user_id,
      v_existing_family_id,
      coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), nullif(auth.jwt() ->> 'email', ''), 'Parent'),
      auth.jwt() ->> 'email',
      case when v_existing_role = 'owner' then 'owner' else 'parent' end,
      coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), nullif(auth.jwt() ->> 'email', ''), 'Parent'),
      false
    )
    on conflict (id) do update set
      family_id = excluded.family_id,
      display_name = coalesce(nullif(p.display_name, ''), excluded.display_name),
      email = coalesce(p.email, excluded.email),
      parent_role = excluded.parent_role,
      relation = coalesce(p.relation, excluded.relation),
      updated_at = now();

    v_parent_id := v_user_id;
    v_parent_role := case when v_existing_role = 'owner' then 'owner' else 'parent' end;
    return query
      select
        v_existing_family_id as family_id,
        v_parent_id as parent_id,
        v_parent_role as parent_role,
        v_family_code as family_code;
    return;
  end if;

  insert into public.families as f (
    name,
    owner_id,
    family_code
  )
  values (
    v_safe_name,
    v_user_id,
    public.generate_family_code()
  )
  returning f.id, f.family_code into v_family_id, v_family_code;

  insert into public.family_members as fm (
    family_id,
    user_id,
    role,
    status
  )
  values (
    v_family_id,
    v_user_id,
    'owner',
    'active'
  )
  on conflict (family_id, user_id) do update set
    role = 'owner',
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
    v_user_id,
    v_family_id,
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), nullif(auth.jwt() ->> 'email', ''), 'Parent'),
    auth.jwt() ->> 'email',
    'owner',
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), nullif(auth.jwt() ->> 'email', ''), 'Parent'),
    false
  )
  on conflict (id) do update set
    family_id = excluded.family_id,
    display_name = coalesce(nullif(p.display_name, ''), excluded.display_name),
    email = excluded.email,
    parent_role = 'owner',
    relation = coalesce(p.relation, excluded.relation),
    updated_at = now();

  v_parent_id := v_user_id;
  v_parent_role := 'owner';
  return query
    select
      v_family_id as family_id,
      v_parent_id as parent_id,
      v_parent_role as parent_role,
      v_family_code as family_code;
end;
$function$;

grant execute on function public.create_family_for_current_user(text) to authenticated;
