-- Little Dreamers Family
-- Make task rows the single source of truth for task media and daily instances.

alter table public.tasks
  add column if not exists task_image_media_id uuid,
  add column if not exists thumbnail_media_id uuid;

-- Backfill task media ids that were previously only preserved in parent repository snapshots.
with snapshot_tasks as (
  select
    parent_row.family_id,
    (task_json ->> 'id')::uuid as task_id,
    nullif(task_json ->> 'task_image_media_id', '')::uuid as task_image_media_id,
    nullif(task_json ->> 'thumbnail_media_id', '')::uuid as thumbnail_media_id
  from public.parents as parent_row
  cross join lateral jsonb_array_elements(coalesce(parent_row.settings -> 'repository_state' -> 'tasks', '[]'::jsonb)) as task_json
  where task_json ? 'id'
)
update public.tasks as task_row
set
  task_image_media_id = coalesce(task_row.task_image_media_id, snapshot_tasks.task_image_media_id),
  thumbnail_media_id = coalesce(task_row.thumbnail_media_id, snapshot_tasks.thumbnail_media_id),
  template_snapshot = case
    when task_row.category = 'daily' then
      coalesce(task_row.template_snapshot, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'task_image_media_id', coalesce(task_row.task_image_media_id, snapshot_tasks.task_image_media_id),
        'thumbnail_media_id', coalesce(task_row.thumbnail_media_id, snapshot_tasks.thumbnail_media_id)
      ))
    else task_row.template_snapshot
  end,
  updated_at = greatest(task_row.updated_at, now())
from snapshot_tasks
where task_row.family_id = snapshot_tasks.family_id
  and task_row.id = snapshot_tasks.task_id
  and (
    task_row.task_image_media_id is distinct from coalesce(task_row.task_image_media_id, snapshot_tasks.task_image_media_id)
    or task_row.thumbnail_media_id is distinct from coalesce(task_row.thumbnail_media_id, snapshot_tasks.thumbnail_media_id)
  );

-- Daily templates should not occupy a concrete occurrence date. Only instances should.
update public.tasks
set occurrence_date = null,
    template_snapshot = coalesce(template_snapshot, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'title', title,
        'description', description,
        'reward_stars', reward_stars,
        'reward_screen_minutes', reward_screen_minutes,
        'task_image_media_id', task_image_media_id,
        'thumbnail_media_id', thumbnail_media_id,
        'recurrence_rule', coalesce(recurrence_rule, 'FREQ=DAILY')
      )),
    updated_at = now()
where category = 'daily'
  and daily_template_active is true
  and occurrence_date is not null;

-- Existing daily instances inherit the template media snapshot when they do not yet have media ids.
update public.tasks as instance
set
  task_image_media_id = coalesce(instance.task_image_media_id, template.task_image_media_id),
  thumbnail_media_id = coalesce(instance.thumbnail_media_id, template.thumbnail_media_id),
  template_snapshot = coalesce(instance.template_snapshot, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'task_image_media_id', coalesce(instance.task_image_media_id, template.task_image_media_id),
      'thumbnail_media_id', coalesce(instance.thumbnail_media_id, template.thumbnail_media_id)
    )),
  updated_at = greatest(instance.updated_at, now())
from public.tasks as template
where instance.category = 'daily'
  and coalesce(instance.daily_template_active, false) = false
  and instance.daily_template_id = template.id
  and (
    instance.task_image_media_id is null
    or instance.thumbnail_media_id is null
  );

-- Attach uploaded task media assets to their canonical task rows for cross-device lookups.
update public.media_assets as media
set
  entity_type = 'task',
  entity_id = task_row.id,
  purpose = coalesce(media.purpose, 'content')
from public.tasks as task_row
where media.family_id = task_row.family_id
  and media.child_id = task_row.child_id
  and media.id in (task_row.task_image_media_id, task_row.thumbnail_media_id)
  and (
    media.entity_id is distinct from task_row.id
    or media.entity_type is distinct from 'task'
  );

-- Expire old daily instances, but keep templates active for future generation.
update public.tasks
set status = 'expired',
    updated_at = now()
where category = 'daily'
  and coalesce(daily_template_active, false) = false
  and occurrence_date < public.taipei_today()
  and status in ('pending', 'rejected')
  and archived_at is null;

-- If a future data import produces duplicates, keep the highest-progress instance canonical.
with ranked_daily as (
  select
    id,
    row_number() over (
      partition by family_id, child_id, daily_template_id, occurrence_date
      order by
        case status
          when 'approved' then 1
          when 'submitted' then 2
          when 'pending' then 3
          when 'rejected' then 4
          else 5
        end,
        updated_at desc,
        created_at desc
    ) as rank_in_day
  from public.tasks
  where category = 'daily'
    and coalesce(daily_template_active, false) = false
    and daily_template_id is not null
    and occurrence_date is not null
    and archived_at is null
    and status <> 'cancelled'
)
update public.tasks as task_row
set status = 'cancelled',
    updated_at = now()
from ranked_daily
where task_row.id = ranked_daily.id
  and ranked_daily.rank_in_day > 1;

drop index if exists public.uq_daily_task_instance;

create unique index if not exists uq_daily_task_instance
  on public.tasks(family_id, child_id, daily_template_id, occurrence_date)
  where category = 'daily'
    and coalesce(daily_template_active, false) = false
    and daily_template_id is not null
    and occurrence_date is not null
    and archived_at is null
    and status <> 'cancelled';

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
    and coalesce(task_row.daily_template_active, false) = false
    and task_row.occurrence_date < v_date
    and task_row.status in ('pending', 'rejected')
    and task_row.archived_at is null;
  get diagnostics v_expired = row_count;

  insert into public.tasks (
    family_id, child_id, title, description, category, task_date, task_image_media_id,
    thumbnail_media_id, daily_template_id, occurrence_date, template_snapshot, daily_template_active,
    due_at, recurrence_rule, status, reward_stars, reward_screen_minutes, completion_note,
    completed_at, reviewed_by, reviewed_at, rejection_reason, created_by, created_at,
    updated_at, archived_at
  )
  select
    template.family_id,
    template.child_id,
    template.title,
    template.description,
    'daily',
    v_date,
    template.task_image_media_id,
    template.thumbnail_media_id,
    template.id,
    v_date,
    coalesce(template.template_snapshot, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'title', template.title,
        'description', template.description,
        'reward_stars', template.reward_stars,
        'reward_screen_minutes', template.reward_screen_minutes,
        'task_image_media_id', template.task_image_media_id,
        'thumbnail_media_id', template.thumbnail_media_id,
        'recurrence_rule', coalesce(template.recurrence_rule, 'FREQ=DAILY')
      )),
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
        and coalesce(existing.daily_template_active, false) = false
        and existing.daily_template_id = template.id
        and existing.occurrence_date = v_date
        and existing.archived_at is null
        and existing.status <> 'cancelled'
    )
  on conflict do nothing;
  get diagnostics v_created = row_count;

  return jsonb_build_object('occurrence_date', v_date, 'created', v_created, 'expired', v_expired);
end;
$$;

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
  v_task_image_media_id uuid := nullif(p_task ->> 'task_image_media_id', '')::uuid;
  v_thumbnail_media_id uuid := nullif(p_task ->> 'thumbnail_media_id', '')::uuid;
  v_daily_template_id uuid := nullif(p_task ->> 'daily_template_id', '')::uuid;
  v_occurrence_date date := nullif(p_task ->> 'occurrence_date', '')::date;
  v_daily_template_active boolean;
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
    v_daily_template_active := coalesce((p_task ->> 'daily_template_active')::boolean, v_daily_template_id = v_id);
    if v_daily_template_active then
      v_occurrence_date := null;
    else
      v_occurrence_date := coalesce(v_occurrence_date, v_task_date);
    end if;
  else
    v_daily_template_id := null;
    v_occurrence_date := null;
    v_daily_template_active := null;
  end if;

  insert into public.tasks (
    id, family_id, child_id, title, description, category, task_date, task_image_media_id,
    thumbnail_media_id, daily_template_id, occurrence_date, template_snapshot, daily_template_active,
    due_at, recurrence_rule, status, reward_stars, reward_screen_minutes, completion_note,
    completed_at, reviewed_by, reviewed_at, rejection_reason, created_by, created_at,
    updated_at, archived_at
  )
  values (
    v_id,
    v_family_id,
    v_child_id,
    coalesce(p_task ->> 'title', ''),
    nullif(p_task ->> 'description', ''),
    v_category,
    v_task_date,
    v_task_image_media_id,
    v_thumbnail_media_id,
    v_daily_template_id,
    v_occurrence_date,
    coalesce(p_task -> 'template_snapshot', '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'task_image_media_id', v_task_image_media_id,
        'thumbnail_media_id', v_thumbnail_media_id
      )),
    v_daily_template_active,
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
    task_image_media_id = excluded.task_image_media_id,
    thumbnail_media_id = excluded.thumbnail_media_id,
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

  update public.media_assets as media
  set entity_type = 'task',
      entity_id = v_task.id,
      purpose = coalesce(media.purpose, 'content')
  where media.family_id = v_task.family_id
    and media.child_id = v_task.child_id
    and media.id in (v_task.task_image_media_id, v_task.thumbnail_media_id);

  return v_task;
end;
$$;

revoke all on function public.upsert_parent_task_from_repository(jsonb) from public;
grant execute on function public.upsert_parent_task_from_repository(jsonb) to authenticated;
