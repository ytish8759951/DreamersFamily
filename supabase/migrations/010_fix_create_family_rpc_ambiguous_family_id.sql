-- Add a stable, human-readable family code and fix create-family RPC variable/column ambiguity.
-- Only families get a custom external code; all other entity IDs remain UUIDs.

alter table public.families
  add column if not exists family_code text;

create or replace function public.generate_family_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_family_code text;
  v_family_date text := to_char(timezone('Asia/Taipei', now()), 'YYYYMMDD');
begin
  loop
    v_family_code := 'DF-' || v_family_date || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (
      select 1
      from public.families as f
      where f.family_code = v_family_code
    );
  end loop;

  return v_family_code;
end;
$$;

update public.families as f
set family_code = coalesce(f.family_code, public.generate_family_code())
where f.family_code is null;

alter table public.families
  alter column family_code set not null;

create unique index if not exists uq_families_family_code
  on public.families(family_code);

create or replace function public.create_family_for_current_user(family_name text)
returns table(family_id uuid, parent_id uuid, parent_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_parent_id uuid;
  v_parent_role text;
  v_existing_family_id uuid;
  v_existing_role text;
  v_family_code text;
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
    return query select v_existing_family_id, v_parent_id, v_parent_role;
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
  return query select v_family_id, v_parent_id, v_parent_role;
end;
$$;

grant execute on function public.generate_family_code() to authenticated;
grant execute on function public.create_family_for_current_user(text) to authenticated;
