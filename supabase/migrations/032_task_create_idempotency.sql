-- Little Dreamers Family
-- Make parent task creation idempotent and keep daily templates out of active lists.

alter table public.tasks
  add column if not exists client_request_id text;

create unique index if not exists uq_tasks_family_child_client_request
  on public.tasks(family_id, child_id, client_request_id)
  where client_request_id is not null;

update public.tasks
set status = 'cancelled',
    updated_at = now()
where category = 'daily'
  and daily_template_active is true
  and status in ('pending', 'rejected')
  and archived_at is null;

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
  v_client_request_id text := nullif(p_task ->> 'client_request_id', '');
  v_daily_template_id uuid := nullif(p_task ->> 'daily_template_id', '')::uuid;
  v_occurrence_date date := nullif(p_task ->> 'occurrence_date', '')::date;
  v_daily_template_active boolean;
  v_status text := coalesce(nullif(p_task ->> 'status', ''), 'pending');
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

  if v_client_request_id is not null then
    select *
    into v_task
    from public.tasks
    where family_id = v_family_id
      and child_id = v_child_id
      and client_request_id = v_client_request_id
    limit 1;
    if found then
      return v_task;
    end if;
  end if;

  if v_category = 'daily' then
    v_daily_template_id := coalesce(v_daily_template_id, v_id);
    v_daily_template_active := coalesce((p_task ->> 'daily_template_active')::boolean, v_daily_template_id = v_id);
    if v_daily_template_active then
      v_occurrence_date := null;
      v_status := 'cancelled';
    else
      v_occurrence_date := coalesce(v_occurrence_date, v_task_date);
    end if;
  else
    v_daily_template_id := null;
    v_occurrence_date := null;
    v_daily_template_active := null;
  end if;

  begin
    insert into public.tasks (
      id, family_id, child_id, title, description, category, task_date, task_image_media_id,
      thumbnail_media_id, client_request_id, daily_template_id, occurrence_date, template_snapshot,
      daily_template_active, due_at, recurrence_rule, status, reward_stars, reward_screen_minutes,
      completion_note, completed_at, reviewed_by, reviewed_at, rejection_reason, created_by,
      created_at, updated_at, archived_at
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
      v_client_request_id,
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
      v_status,
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
      client_request_id = coalesce(public.tasks.client_request_id, excluded.client_request_id),
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
  exception
    when unique_violation then
      if v_client_request_id is null then
        raise;
      end if;
      select *
      into v_task
      from public.tasks
      where family_id = v_family_id
        and child_id = v_child_id
        and client_request_id = v_client_request_id
      limit 1;
      if not found then
        raise;
      end if;
  end;

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
