-- Little Dreamers Family
-- Harden parent/child task sync and daily task instance generation.

alter table public.tasks
  add column if not exists daily_template_id uuid,
  add column if not exists occurrence_date date,
  add column if not exists template_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists daily_template_active boolean;

update public.tasks
set
  recurrence_rule = coalesce(recurrence_rule, 'FREQ=DAILY'),
  daily_template_id = coalesce(daily_template_id, id),
  occurrence_date = coalesce(occurrence_date, task_date),
  template_snapshot = case
    when template_snapshot = '{}'::jsonb then jsonb_build_object(
      'title', title,
      'description', description,
      'reward_stars', reward_stars,
      'reward_screen_minutes', reward_screen_minutes,
      'recurrence_rule', coalesce(recurrence_rule, 'FREQ=DAILY')
    )
    else template_snapshot
  end,
  daily_template_active = coalesce(daily_template_active, true)
where category = 'daily';

update public.tasks
set daily_template_active = null
where category <> 'daily';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_family_child_daily_template_fk'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_family_child_daily_template_fk
      foreign key (daily_template_id)
      references public.tasks(id)
      on delete set null;
  end if;
end;
$$;

create unique index if not exists uq_daily_task_instance
  on public.tasks(family_id, child_id, daily_template_id, occurrence_date)
  where category = 'daily'
    and daily_template_id is not null
    and occurrence_date is not null;

create or replace function public.taipei_today()
returns date
language sql
stable
as $$
  select (timezone('Asia/Taipei', now()))::date;
$$;

revoke all on function public.taipei_today() from public;
grant execute on function public.taipei_today() to anon, authenticated;

create or replace function public._ensure_daily_task_instances(
  p_family_id uuid,
  p_child_id uuid default null,
  p_occurrence_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := coalesce(p_occurrence_date, public.taipei_today());
  v_expired integer := 0;
  v_created integer := 0;
begin
  if p_family_id is null then
    raise exception 'Family is required' using errcode = '22023';
  end if;

  update public.tasks as task_row
  set status = 'expired',
      updated_at = now()
  where task_row.family_id = p_family_id
    and (p_child_id is null or task_row.child_id = p_child_id)
    and task_row.category = 'daily'
    and coalesce(task_row.occurrence_date, task_row.task_date) < v_date
    and task_row.status in ('pending', 'rejected')
    and task_row.archived_at is null;
  get diagnostics v_expired = row_count;

  insert into public.tasks (
    family_id, child_id, title, description, category, task_date, daily_template_id,
    occurrence_date, template_snapshot, daily_template_active, due_at, recurrence_rule, status,
    reward_stars, reward_screen_minutes, completion_note, completed_at, reviewed_by, reviewed_at,
    rejection_reason, created_by, created_at, updated_at, archived_at
  )
  select
    template.family_id,
    template.child_id,
    template.title,
    template.description,
    'daily',
    v_date,
    template.id,
    v_date,
    jsonb_build_object(
      'title', template.title,
      'description', template.description,
      'reward_stars', template.reward_stars,
      'reward_screen_minutes', template.reward_screen_minutes,
      'recurrence_rule', coalesce(template.recurrence_rule, 'FREQ=DAILY')
    ),
    false,
    case
      when template.due_at is null then null
      else (v_date::text || 'T' || to_char(template.due_at at time zone 'Asia/Taipei', 'HH24:MI:SS'))::timestamptz
    end,
    'FREQ=DAILY',
    'pending',
    template.reward_stars,
    template.reward_screen_minutes,
    null,
    null,
    null,
    null,
    null,
    template.created_by,
    now(),
    now(),
    null
  from public.tasks as template
  join public.children as child_row
    on child_row.family_id = template.family_id
   and child_row.id = template.child_id
   and child_row.status = 'active'
  where template.family_id = p_family_id
    and (p_child_id is null or template.child_id = p_child_id)
    and template.category = 'daily'
    and template.daily_template_id = template.id
    and coalesce(template.daily_template_active, true) = true
    and coalesce(template.recurrence_rule, 'FREQ=DAILY') = 'FREQ=DAILY'
    and template.task_date <= v_date
    and template.archived_at is null
    and not exists (
      select 1
      from public.tasks as existing
      where existing.family_id = template.family_id
        and existing.child_id = template.child_id
        and existing.category = 'daily'
        and existing.daily_template_id = template.id
        and existing.occurrence_date = v_date
    )
  on conflict do nothing;
  get diagnostics v_created = row_count;

  return jsonb_build_object('occurrence_date', v_date, 'created', v_created, 'expired', v_expired);
end;
$$;

revoke all on function public._ensure_daily_task_instances(uuid, uuid, date) from public;

create or replace function public.ensure_daily_task_instances(
  p_family_id uuid,
  p_child_id uuid default null,
  p_occurrence_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_write_family(p_family_id) then
    raise exception 'Not allowed to ensure daily tasks for this family'
      using errcode = '42501';
  end if;
  return public._ensure_daily_task_instances(p_family_id, p_child_id, p_occurrence_date);
end;
$$;

revoke all on function public.ensure_daily_task_instances(uuid, uuid, date) from public;
grant execute on function public.ensure_daily_task_instances(uuid, uuid, date) to authenticated;

create or replace function public.upsert_parent_task_from_repository(p_task jsonb)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
  v_id uuid := nullif(p_task ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_task ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_task ->> 'child_id', '')::uuid;
  v_category text := coalesce(nullif(p_task ->> 'category', ''), 'daily');
  v_task_date date := coalesce(nullif(p_task ->> 'task_date', '')::date, public.taipei_today());
  v_daily_template_id uuid := nullif(p_task ->> 'daily_template_id', '')::uuid;
  v_occurrence_date date := nullif(p_task ->> 'occurrence_date', '')::date;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '28000';
  end if;
  if v_id is null or v_family_id is null or v_child_id is null then
    raise exception 'Task id, family_id and child_id are required' using errcode = '22023';
  end if;
  if not public.can_write_family(v_family_id) then
    raise exception 'Not allowed to write this task' using errcode = '42501';
  end if;
  if not exists (select 1 from public.children where family_id = v_family_id and id = v_child_id and status = 'active') then
    raise exception 'Child is not active in this family' using errcode = '23503';
  end if;

  if v_category = 'daily' then
    v_daily_template_id := coalesce(v_daily_template_id, v_id);
    v_occurrence_date := coalesce(v_occurrence_date, v_task_date);
  else
    v_daily_template_id := null;
    v_occurrence_date := null;
  end if;

  insert into public.tasks (
    id, family_id, child_id, title, description, category, task_date, daily_template_id,
    occurrence_date, template_snapshot, daily_template_active, due_at, recurrence_rule, status,
    reward_stars, reward_screen_minutes, completion_note, completed_at, reviewed_by, reviewed_at,
    rejection_reason, created_by, created_at, updated_at, archived_at
  )
  values (
    v_id,
    v_family_id,
    v_child_id,
    coalesce(p_task ->> 'title', ''),
    nullif(p_task ->> 'description', ''),
    v_category,
    v_task_date,
    v_daily_template_id,
    v_occurrence_date,
    coalesce(p_task -> 'template_snapshot', '{}'::jsonb),
    case when v_category = 'daily' then coalesce((p_task ->> 'daily_template_active')::boolean, v_daily_template_id = v_id) else null end,
    nullif(p_task ->> 'due_at', '')::timestamptz,
    case when v_category = 'daily' then coalesce(nullif(p_task ->> 'recurrence_rule', ''), 'FREQ=DAILY') else nullif(p_task ->> 'recurrence_rule', '') end,
    coalesce(nullif(p_task ->> 'status', ''), 'pending'),
    coalesce((p_task ->> 'reward_stars')::integer, 0),
    coalesce((p_task ->> 'reward_screen_minutes')::integer, 0),
    nullif(p_task ->> 'completion_note', ''),
    nullif(p_task ->> 'completed_at', '')::timestamptz,
    nullif(p_task ->> 'reviewed_by', '')::uuid,
    nullif(p_task ->> 'reviewed_at', '')::timestamptz,
    nullif(p_task ->> 'rejection_reason', ''),
    auth.uid(),
    coalesce(nullif(p_task ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_task ->> 'updated_at', '')::timestamptz, now()),
    nullif(p_task ->> 'archived_at', '')::timestamptz
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    task_date = excluded.task_date,
    daily_template_id = excluded.daily_template_id,
    occurrence_date = excluded.occurrence_date,
    template_snapshot = excluded.template_snapshot,
    daily_template_active = excluded.daily_template_active,
    due_at = excluded.due_at,
    recurrence_rule = excluded.recurrence_rule,
    status = excluded.status,
    reward_stars = excluded.reward_stars,
    reward_screen_minutes = excluded.reward_screen_minutes,
    completion_note = excluded.completion_note,
    completed_at = excluded.completed_at,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    rejection_reason = excluded.rejection_reason,
    updated_at = excluded.updated_at,
    archived_at = excluded.archived_at
  returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.upsert_parent_task_from_repository(jsonb) from public;
grant execute on function public.upsert_parent_task_from_repository(jsonb) to authenticated;

create or replace function public.approve_task_with_stars(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks%rowtype;
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '28000';
  end if;

  select *
  into v_task
  from public.tasks
  where id = p_task_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if not public.can_write_family(v_task.family_id) then
    raise exception 'Not allowed to approve this task' using errcode = '42501';
  end if;

  if v_task.status <> 'approved' then
    if v_task.status <> 'submitted' then
      raise exception 'Only submitted tasks can be approved' using errcode = '22023';
    end if;
    update public.tasks
    set status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = p_task_id
    returning * into v_task;
  end if;

  v_key := 'task:' || v_task.id::text || ':stars';
  if v_task.reward_stars > 0 then
    insert into public.stars (
      family_id, child_id, amount, transaction_type, reason, task_id, share_id,
      dream_id, reversal_of_id, idempotency_key, created_by
    )
    values (
      v_task.family_id, v_task.child_id, v_task.reward_stars, 'task_reward',
      '完成任務：' || coalesce(v_task.title, ''), v_task.id, null, null, null, v_key, auth.uid()
    )
    on conflict (family_id, idempotency_key) where idempotency_key is not null do nothing;
  end if;

  return v_task;
end;
$$;

revoke all on function public.approve_task_with_stars(uuid) from public;
grant execute on function public.approve_task_with_stars(uuid) to authenticated;

-- Safely backfill formal task rows from parent repository snapshots.
insert into public.tasks (
  id, family_id, child_id, title, description, category, task_date, daily_template_id,
  occurrence_date, template_snapshot, daily_template_active, due_at, recurrence_rule, status,
  reward_stars, reward_screen_minutes, completion_note, completed_at, reviewed_by, reviewed_at,
  rejection_reason, created_by, created_at, updated_at, archived_at
)
select
  task_row.id,
  task_row.family_id,
  task_row.child_id,
  task_row.title,
  task_row.description,
  task_row.category,
  task_row.task_date,
  case when task_row.category = 'daily' then coalesce(task_row.daily_template_id, task_row.id) else null end,
  case when task_row.category = 'daily' then coalesce(task_row.occurrence_date, task_row.task_date) else null end,
  case
    when task_row.category = 'daily' then coalesce(task_row.template_snapshot, '{}'::jsonb)
    else '{}'::jsonb
  end,
  case when task_row.category = 'daily' then coalesce(task_row.daily_template_active, true) else null end,
  task_row.due_at,
  case when task_row.category = 'daily' then coalesce(task_row.recurrence_rule, 'FREQ=DAILY') else task_row.recurrence_rule end,
  task_row.status,
  task_row.reward_stars,
  task_row.reward_screen_minutes,
  task_row.completion_note,
  task_row.completed_at,
  task_row.reviewed_by,
  task_row.reviewed_at,
  task_row.rejection_reason,
  coalesce(task_row.created_by, parent_row.id),
  task_row.created_at,
  task_row.updated_at,
  task_row.archived_at
from public.parents as parent_row
cross join lateral jsonb_populate_recordset(
  null::public.tasks,
  coalesce(parent_row.settings -> 'repository_state' -> 'tasks', '[]'::jsonb)
) as task_row
where task_row.family_id = parent_row.family_id
  and exists (
    select 1
    from public.children as child_row
    where child_row.family_id = task_row.family_id
      and child_row.id = task_row.child_id
  )
on conflict (id) do nothing;

create or replace function public.get_child_scoped_repository_state(
  p_child_id uuid,
  p_device_binding_id text,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_binding public.device_bindings%rowtype;
  v_parent_id uuid;
begin
  select binding_row.*
  into v_binding
  from public.device_bindings as binding_row
  where binding_row.id = p_device_binding_id
    and binding_row.child_id = p_child_id
    and binding_row.device_id = p_device_id
    and binding_row.binding_status = 'bound'
    and coalesce(binding_row.device_binding_status, 'active') = 'active'
    and binding_row.revoked_at is null
    and binding_row.replaced_at is null
  limit 1;

  if not found then
    raise exception 'Child device binding is invalid'
      using errcode = '28000';
  end if;

  select child_row.*
  into v_child
  from public.children as child_row
  where child_row.id = p_child_id
    and child_row.family_id = v_binding.family_id
    and child_row.status = 'active'
  limit 1;

  if not found then
    raise exception 'Child is not active'
      using errcode = '28000';
  end if;

  perform public._ensure_daily_task_instances(v_child.family_id, v_child.id, null);

  v_parent_id := coalesce(v_child.parent_id, v_child.created_by);

  update public.device_bindings as binding_row
  set last_heartbeat_at = now(),
      updated_at = now()
  where binding_row.id = v_binding.id;

  return jsonb_build_object(
    'family_id', v_child.family_id,
    'parent_id', v_parent_id,
    'child_id', v_child.id,
    'updated_at', now(),
    'child', to_jsonb(v_child),
    'device_binding', to_jsonb(v_binding),
    'device_bindings', coalesce((select jsonb_agg(to_jsonb(binding_row) order by binding_row.updated_at desc) from public.device_bindings as binding_row where binding_row.id = v_binding.id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(task_row) order by task_row.updated_at desc) from public.tasks as task_row where task_row.family_id = v_child.family_id and task_row.child_id = v_child.id), '[]'::jsonb),
    'task_records', coalesce((select jsonb_agg(to_jsonb(record_row) order by record_row.created_at desc) from public.task_records as record_row where record_row.family_id = v_child.family_id and record_row.child_id = v_child.id), '[]'::jsonb),
    'stars', coalesce((select jsonb_agg(to_jsonb(star_row) order by star_row.created_at desc) from public.stars as star_row where star_row.family_id = v_child.family_id and star_row.child_id = v_child.id), '[]'::jsonb),
    'piggy_bank_records', coalesce((select jsonb_agg(to_jsonb(piggy_row) order by piggy_row.created_at desc) from public.piggy_bank_records as piggy_row where piggy_row.family_id = v_child.family_id and piggy_row.child_id = v_child.id), '[]'::jsonb),
    'store_items', coalesce((select jsonb_agg(to_jsonb(store_row) order by store_row.updated_at desc) from public.store_items as store_row where store_row.family_id = v_child.family_id and store_row.child_id = v_child.id), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(purchase_row) order by purchase_row.updated_at desc) from public.purchases as purchase_row where purchase_row.family_id = v_child.family_id and purchase_row.child_id = v_child.id), '[]'::jsonb),
    'dreams', coalesce((select jsonb_agg(to_jsonb(dream_row) order by dream_row.updated_at desc) from public.dreams as dream_row where dream_row.family_id = v_child.family_id and dream_row.child_id = v_child.id), '[]'::jsonb),
    'dream_funds', coalesce((select jsonb_agg(to_jsonb(fund_row) order by fund_row.created_at desc) from public.dream_funds as fund_row where fund_row.family_id = v_child.family_id and fund_row.child_id = v_child.id), '[]'::jsonb),
    'shares', coalesce((select jsonb_agg(to_jsonb(share_row) order by share_row.updated_at desc) from public.shares as share_row where share_row.family_id = v_child.family_id and share_row.child_id = v_child.id), '[]'::jsonb),
    'share_media', coalesce((select jsonb_agg(to_jsonb(media_row) order by media_row.created_at desc) from public.share_media as media_row where media_row.family_id = v_child.family_id and media_row.child_id = v_child.id), '[]'::jsonb),
    'encouragement_cards', coalesce((select jsonb_agg(to_jsonb(card_row) order by card_row.updated_at desc) from public.encouragement_cards as card_row where card_row.family_id = v_child.family_id and card_row.child_id = v_child.id), '[]'::jsonb),
    'special_days', coalesce((select jsonb_agg(to_jsonb(day_row) order by day_row.updated_at desc) from public.special_days as day_row where day_row.family_id = v_child.family_id and (day_row.child_id = v_child.id or day_row.child_id is null)), '[]'::jsonb),
    'growth_records', coalesce((select jsonb_agg(to_jsonb(growth_row) order by growth_row.updated_at desc) from public.growth_records as growth_row where growth_row.family_id = v_child.family_id and growth_row.child_id = v_child.id), '[]'::jsonb),
    'tablet_time', coalesce((select jsonb_agg(to_jsonb(tablet_row) order by tablet_row.updated_at desc) from public.tablet_time as tablet_row where tablet_row.family_id = v_child.family_id and tablet_row.child_id = v_child.id), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(to_jsonb(badge_row) order by badge_row.created_at desc) from public.badges as badge_row where badge_row.family_id = v_child.family_id), '[]'::jsonb),
    'child_badges', coalesce((select jsonb_agg(to_jsonb(child_badge_row) order by child_badge_row.awarded_at desc) from public.child_badges as child_badge_row where child_badge_row.family_id = v_child.family_id and child_badge_row.child_id = v_child.id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_child_scoped_repository_state(uuid, text, uuid) from public;
grant execute on function public.get_child_scoped_repository_state(uuid, text, uuid) to anon, authenticated;
