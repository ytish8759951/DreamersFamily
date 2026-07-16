-- Safe test data management RPCs.
--
-- Non-destructive migration:
-- - Adds an audit table for explicit test-data management actions.
-- - Adds owner-only preview/execute cleanup RPCs.
-- - Adds owner-only demo data create/remove RPCs.
-- - Does not delete any data during migration.

create table if not exists public.test_data_management_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  family_id uuid,
  action text not null,
  options jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.test_data_management_audit enable row level security;

grant select, insert on public.test_data_management_audit to authenticated;
revoke all privileges on public.test_data_management_audit from anon;

drop policy if exists test_data_management_audit_select_owner on public.test_data_management_audit;
drop policy if exists test_data_management_audit_insert_owner on public.test_data_management_audit;

create policy test_data_management_audit_select_owner
on public.test_data_management_audit
for select
to authenticated
using (family_id is null or public.has_family_role(family_id, array['owner']));

create policy test_data_management_audit_insert_owner
on public.test_data_management_audit
for insert
to authenticated
with check (family_id is null or public.has_family_role(family_id, array['owner']));

create or replace function public.require_owned_cleanup_family(p_family_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = 'P0001', detail = 'AUTH_REQUIRED';
  end if;

  if p_family_id is not null then
    select fm.family_id
    into v_family_id
    from public.family_members as fm
    where fm.family_id = p_family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
      and fm.role = 'owner'
    limit 1;

    if not found then
      raise exception 'Only a family owner can manage test data'
        using errcode = 'P0001', detail = 'OWNER_REQUIRED';
    end if;

    return v_family_id;
  end if;

  select fm.family_id
  into v_family_id
  from public.family_members as fm
  where fm.user_id = auth.uid()
    and fm.status = 'active'
    and fm.role = 'owner'
  order by fm.created_at desc
  limit 1;

  if v_family_id is null then
    raise exception 'Only a family owner can manage test data'
      using errcode = 'P0001', detail = 'OWNER_REQUIRED';
  end if;

  return v_family_id;
end;
$$;

create or replace function public.test_data_cleanup_counts(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child_ids uuid[];
begin
  select coalesce(array_agg(c.id), array[]::uuid[])
  into v_child_ids
  from public.children as c
  where c.family_id = p_family_id;

  return jsonb_build_object(
    'families', (select count(*) from public.families as f where f.id = p_family_id),
    'family_members', (select count(*) from public.family_members as fm where fm.family_id = p_family_id),
    'children', (select count(*) from public.children as c where c.family_id = p_family_id),
    'child_login_challenges', (select count(*) from public.child_login_challenges as clc where clc.family_id = p_family_id),
    'device_bindings', (select count(*) from public.device_bindings as db where db.family_id = p_family_id),
    'tasks', (select count(*) from public.tasks as t where t.family_id = p_family_id),
    'task_records', (select count(*) from public.task_records as tr where tr.family_id = p_family_id),
    'stars', (select count(*) from public.stars as s where s.family_id = p_family_id),
    'piggy_bank_records', (select count(*) from public.piggy_bank_records as pbr where pbr.family_id = p_family_id),
    'store_items', (select count(*) from public.store_items as si where si.family_id = p_family_id),
    'purchases', (select count(*) from public.purchases as p where p.family_id = p_family_id),
    'dreams', (select count(*) from public.dreams as d where d.family_id = p_family_id),
    'dream_funds', (select count(*) from public.dream_funds as df where df.family_id = p_family_id),
    'shares', (select count(*) from public.shares as s where s.family_id = p_family_id),
    'share_media', (select count(*) from public.share_media as sm where sm.family_id = p_family_id),
    'encouragement_cards', (select count(*) from public.encouragement_cards as ec where ec.family_id = p_family_id),
    'special_days', (select count(*) from public.special_days as sd where sd.family_id = p_family_id),
    'growth_records', (select count(*) from public.growth_records as gr where gr.family_id = p_family_id),
    'tablet_time', (select count(*) from public.tablet_time as tt where tt.family_id = p_family_id),
    'badges', (select count(*) from public.badges as b where b.family_id = p_family_id),
    'child_badges', (select count(*) from public.child_badges as cb where cb.family_id = p_family_id),
    'notifications', (select count(*) from public.notifications as n where n.family_id = p_family_id)
  );
end;
$$;

create or replace function public.preview_test_data_cleanup(
  p_family_id uuid default null
)
returns table (
  family_id uuid,
  counts jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  v_family_id := public.require_owned_cleanup_family(p_family_id);

  return query
  select
    v_family_id,
    public.test_data_cleanup_counts(v_family_id);
end;
$$;

create or replace function public.execute_test_data_cleanup(
  p_family_id uuid default null,
  p_remove_family boolean default false
)
returns table (
  family_id uuid,
  removed_family boolean,
  deleted_counts jsonb,
  preserved jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_counts jsonb := '{}'::jsonb;
  v_deleted integer;
begin
  v_family_id := public.require_owned_cleanup_family(p_family_id);

  delete from public.notifications where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('notifications', v_deleted);

  delete from public.child_badges where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('child_badges', v_deleted);

  delete from public.badges where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('badges', v_deleted);

  delete from public.tablet_time where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('tablet_time', v_deleted);

  delete from public.growth_records where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('growth_records', v_deleted);

  delete from public.special_days where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('special_days', v_deleted);

  delete from public.encouragement_cards where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('encouragement_cards', v_deleted);

  delete from public.share_media where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('share_media', v_deleted);

  delete from public.shares where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('shares', v_deleted);

  delete from public.dream_funds where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('dream_funds', v_deleted);

  delete from public.dreams where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('dreams', v_deleted);

  delete from public.purchases where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('purchases', v_deleted);

  delete from public.store_items where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('store_items', v_deleted);

  delete from public.piggy_bank_records where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('piggy_bank_records', v_deleted);

  delete from public.stars where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('stars', v_deleted);

  delete from public.task_records where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('task_records', v_deleted);

  delete from public.tasks where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('tasks', v_deleted);

  delete from public.device_bindings where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('device_bindings', v_deleted);

  delete from public.child_login_challenges where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('child_login_challenges', v_deleted);

  delete from public.children where family_id = v_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('children', v_deleted);

  if p_remove_family then
    delete from public.family_members
    where family_id = v_family_id
      and not (user_id = auth.uid() and role = 'owner');
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('family_members', v_deleted);

    delete from public.family_members
    where family_id = v_family_id
      and user_id = auth.uid()
      and role = 'owner';

    delete from public.families where id = v_family_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('families', v_deleted);
  else
    v_counts := v_counts || jsonb_build_object('families', 0, 'family_members', 0);
  end if;

  insert into public.test_data_management_audit (actor_user_id, family_id, action, options, result)
  values (
    auth.uid(),
    v_family_id,
    'execute_test_data_cleanup',
    jsonb_build_object('remove_family', p_remove_family),
    v_counts
  );

  return query
  select
    v_family_id,
    p_remove_family,
    v_counts,
    jsonb_build_object(
      'auth_users', 'preserved',
      'schema', 'preserved',
      'migrations', 'preserved',
      'rls', 'preserved',
      'rpc', 'preserved',
      'family', case when p_remove_family then 'removed' else 'preserved' end
    );
end;
$$;

create or replace function public.create_demo_family_data(
  p_family_id uuid default null
)
returns table (
  family_id uuid,
  created_counts jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_child_id uuid;
  v_now timestamptz := now();
  v_counts jsonb := '{}'::jsonb;
  v_inserted integer;
begin
  v_family_id := public.require_owned_cleanup_family(p_family_id);

  select c.id
  into v_child_id
  from public.children as c
  where c.family_id = v_family_id
    and c.notes = 'DEMO_DATA'
  limit 1;

  if v_child_id is null then
    insert into public.children (
      family_id,
      display_name,
      birth_date,
      birthday,
      theme_color,
      timezone,
      status,
      notes,
      child_token,
      child_token_updated_at,
      created_by,
      created_at,
      updated_at
    )
    values (
      v_family_id,
      'Demo 孩子',
      current_date - interval '6 years',
      current_date - interval '6 years',
      'blue',
      'Asia/Taipei',
      'active',
      'DEMO_DATA',
      'demo-' || encode(extensions.gen_random_bytes(8), 'hex'),
      v_now,
      auth.uid(),
      v_now,
      v_now
    )
    returning id into v_child_id;
    v_counts := v_counts || jsonb_build_object('children', 1);
  else
    v_counts := v_counts || jsonb_build_object('children', 0);
  end if;

  insert into public.tasks (
    family_id, child_id, title, description, category, task_date, status,
    reward_stars, reward_screen_minutes, created_by, created_at, updated_at
  )
  select v_family_id, v_child_id, 'DEMO 任務：整理書包', 'DEMO_DATA', 'daily', current_date, 'pending', 3, 0, auth.uid(), v_now, v_now
  where not exists (
    select 1 from public.tasks as t
    where t.family_id = v_family_id and t.child_id = v_child_id and t.description = 'DEMO_DATA'
  );
  get diagnostics v_inserted = row_count;
  v_counts := v_counts || jsonb_build_object('tasks', v_inserted);

  insert into public.stars (
    family_id, child_id, amount, transaction_type, reason, created_at
  )
  select v_family_id, v_child_id, 5, 'manual_adjustment', 'DEMO_DATA', v_now
  where not exists (
    select 1 from public.stars as s
    where s.family_id = v_family_id and s.child_id = v_child_id and s.reason = 'DEMO_DATA'
  );
  get diagnostics v_inserted = row_count;
  v_counts := v_counts || jsonb_build_object('stars', v_inserted);

  insert into public.growth_records (
    family_id, child_id, recorded_on, record_type, title, content, visibility, source_type, created_by, created_at, updated_at
  )
  select v_family_id, v_child_id, current_date, 'growth', 'DEMO 成長紀錄', 'DEMO_DATA', 'family', 'parent', auth.uid(), v_now, v_now
  where not exists (
    select 1 from public.growth_records as gr
    where gr.family_id = v_family_id and gr.child_id = v_child_id and gr.content = 'DEMO_DATA'
  );
  get diagnostics v_inserted = row_count;
  v_counts := v_counts || jsonb_build_object('growth_records', v_inserted);

  insert into public.test_data_management_audit (actor_user_id, family_id, action, result)
  values (auth.uid(), v_family_id, 'create_demo_family_data', v_counts);

  return query select v_family_id, v_counts;
end;
$$;

create or replace function public.remove_demo_family_data(
  p_family_id uuid default null
)
returns table (
  family_id uuid,
  deleted_counts jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_demo_child_ids uuid[];
  v_counts jsonb := '{}'::jsonb;
  v_deleted integer;
begin
  v_family_id := public.require_owned_cleanup_family(p_family_id);

  select coalesce(array_agg(c.id), array[]::uuid[])
  into v_demo_child_ids
  from public.children as c
  where c.family_id = v_family_id
    and c.notes = 'DEMO_DATA';

  delete from public.growth_records where family_id = v_family_id and content = 'DEMO_DATA';
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('growth_records', v_deleted);

  delete from public.stars where family_id = v_family_id and reason = 'DEMO_DATA';
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('stars', v_deleted);

  delete from public.tasks where family_id = v_family_id and description = 'DEMO_DATA';
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('tasks', v_deleted);

  delete from public.children where family_id = v_family_id and notes = 'DEMO_DATA';
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('children', v_deleted);

  insert into public.test_data_management_audit (actor_user_id, family_id, action, result)
  values (auth.uid(), v_family_id, 'remove_demo_family_data', v_counts);

  return query select v_family_id, v_counts;
end;
$$;

revoke all on function public.require_owned_cleanup_family(uuid) from public;
revoke all on function public.test_data_cleanup_counts(uuid) from public;
revoke all on function public.preview_test_data_cleanup(uuid) from public;
revoke all on function public.execute_test_data_cleanup(uuid, boolean) from public;
revoke all on function public.create_demo_family_data(uuid) from public;
revoke all on function public.remove_demo_family_data(uuid) from public;

grant execute on function public.preview_test_data_cleanup(uuid) to authenticated;
grant execute on function public.execute_test_data_cleanup(uuid, boolean) to authenticated;
grant execute on function public.create_demo_family_data(uuid) to authenticated;
grant execute on function public.remove_demo_family_data(uuid) to authenticated;
