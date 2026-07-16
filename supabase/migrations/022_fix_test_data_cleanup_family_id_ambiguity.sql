-- Fix ambiguous family_id references in test data cleanup RPCs.
--
-- Non-destructive migration:
-- - Replaces cleanup count/execute RPC definitions only.
-- - Does not execute cleanup and does not delete production data during migration.

create or replace function public.test_data_cleanup_counts(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'families', (select count(*) from public.families as f where f.id = p_family_id),
    'family_members', (select count(*) from public.family_members as fm where fm.family_id = p_family_id),
    'children', (select count(*) from public.children as c where c.family_id = p_family_id),
    'child_devices', (select count(*) from public.child_devices as cd where cd.family_id = p_family_id),
    'child_login_challenges', (select count(*) from public.child_login_challenges as clc where clc.family_id = p_family_id),
    'device_bindings', (select count(*) from public.device_bindings as db where db.family_id = p_family_id),
    'tasks', (select count(*) from public.tasks as t where t.family_id = p_family_id),
    'task_records', (select count(*) from public.task_records as tr where tr.family_id = p_family_id),
    'stars', (select count(*) from public.stars as st where st.family_id = p_family_id),
    'piggy_bank_records', (select count(*) from public.piggy_bank_records as pbr where pbr.family_id = p_family_id),
    'store_items', (select count(*) from public.store_items as si where si.family_id = p_family_id),
    'purchases', (select count(*) from public.purchases as pur where pur.family_id = p_family_id),
    'dreams', (select count(*) from public.dreams as d where d.family_id = p_family_id),
    'dream_funds', (select count(*) from public.dream_funds as df where df.family_id = p_family_id),
    'shares', (select count(*) from public.shares as sh where sh.family_id = p_family_id),
    'share_media', (select count(*) from public.share_media as sm where sm.family_id = p_family_id),
    'encouragement_cards', (select count(*) from public.encouragement_cards as ec where ec.family_id = p_family_id),
    'mailbox_messages', (select count(*) from public.mailbox_messages as mm where mm.family_id = p_family_id),
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
  v_target_family_id uuid;
begin
  v_target_family_id := public.require_owned_cleanup_family(p_family_id);

  return query
  select
    v_target_family_id as family_id,
    public.test_data_cleanup_counts(v_target_family_id) as counts;
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
  v_target_family_id uuid;
  v_counts jsonb := '{}'::jsonb;
  v_deleted integer;
begin
  v_target_family_id := public.require_owned_cleanup_family(p_family_id);

  delete from public.notifications as n where n.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('notifications', v_deleted);

  delete from public.child_badges as cb where cb.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('child_badges', v_deleted);

  delete from public.badges as b where b.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('badges', v_deleted);

  delete from public.tablet_time as tt where tt.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('tablet_time', v_deleted);

  delete from public.growth_records as gr where gr.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('growth_records', v_deleted);

  delete from public.special_days as sd where sd.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('special_days', v_deleted);

  delete from public.mailbox_messages as mm where mm.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('mailbox_messages', v_deleted);

  delete from public.encouragement_cards as ec where ec.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('encouragement_cards', v_deleted);

  delete from public.share_media as sm where sm.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('share_media', v_deleted);

  delete from public.shares as sh where sh.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('shares', v_deleted);

  delete from public.dream_funds as df where df.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('dream_funds', v_deleted);

  delete from public.dreams as d where d.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('dreams', v_deleted);

  delete from public.purchases as pur where pur.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('purchases', v_deleted);

  delete from public.store_items as si where si.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('store_items', v_deleted);

  delete from public.piggy_bank_records as pbr where pbr.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('piggy_bank_records', v_deleted);

  delete from public.stars as st where st.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('stars', v_deleted);

  delete from public.task_records as tr where tr.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('task_records', v_deleted);

  delete from public.tasks as t where t.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('tasks', v_deleted);

  delete from public.device_bindings as db where db.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('device_bindings', v_deleted);

  delete from public.child_login_challenges as clc where clc.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('child_login_challenges', v_deleted);

  delete from public.child_devices as cd where cd.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('child_devices', v_deleted);

  delete from public.children as c where c.family_id = v_target_family_id;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('children', v_deleted);

  if p_remove_family then
    delete from public.family_members as fm
    where fm.family_id = v_target_family_id
      and not (fm.user_id = auth.uid() and fm.role = 'owner');
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('family_members', v_deleted);

    delete from public.family_members as owner_fm
    where owner_fm.family_id = v_target_family_id
      and owner_fm.user_id = auth.uid()
      and owner_fm.role = 'owner';

    delete from public.families as f where f.id = v_target_family_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('families', v_deleted);
  else
    v_counts := v_counts || jsonb_build_object('families', 0, 'family_members', 0);
  end if;

  insert into public.test_data_management_audit (actor_user_id, family_id, action, options, result)
  values (
    auth.uid(),
    v_target_family_id,
    'execute_test_data_cleanup',
    jsonb_build_object('remove_family', p_remove_family),
    v_counts
  );

  return query
  select
    v_target_family_id as family_id,
    p_remove_family as removed_family,
    v_counts as deleted_counts,
    jsonb_build_object(
      'auth_users', 'preserved',
      'schema', 'preserved',
      'migrations', 'preserved',
      'rls', 'preserved',
      'rpc', 'preserved',
      'family', case when p_remove_family then 'removed' else 'preserved' end
    ) as preserved;
end;
$$;
