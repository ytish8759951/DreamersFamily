-- Little Dreamers Family
-- Formal mailbox and special-day notifications for cross-device sync.

create unique index if not exists uq_encouragement_cards_family_child_request
  on public.encouragement_cards(family_id, child_id, client_request_id)
  where client_request_id is not null;

create or replace function public._insert_repository_notification(
  p_family_id uuid,
  p_child_id uuid,
  p_audience text,
  p_type text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid,
  p_dedupe_key text
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notifications%rowtype;
  v_parent_id uuid;
begin
  select coalesce(parent_row.id, family_row.owner_id)
  into v_parent_id
  from public.families as family_row
  left join public.parents as parent_row
    on parent_row.family_id = family_row.id
   and parent_row.id = family_row.owner_id
  where family_row.id = p_family_id
  limit 1;

  insert into public.notifications (
    family_id,
    recipient_user_id,
    recipient_child_id,
    notification_type,
    title,
    body,
    entity_type,
    entity_id,
    payload,
    channel,
    status,
    scheduled_at,
    dedupe_key
  )
  values (
    p_family_id,
    case when p_audience = 'parent' then v_parent_id else null end,
    case when p_audience = 'child' then p_child_id else null end,
    p_type,
    p_title,
    p_body,
    p_entity_type,
    p_entity_id,
    jsonb_build_object('child_id', p_child_id),
    'in_app',
    'pending',
    now(),
    p_dedupe_key
  )
  on conflict (family_id, dedupe_key) where dedupe_key is not null do update
    set scheduled_at = least(public.notifications.scheduled_at, excluded.scheduled_at)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public._insert_repository_notification(uuid, uuid, text, text, text, text, text, uuid, text) from public;
grant execute on function public._insert_repository_notification(uuid, uuid, text, text, text, text, text, uuid, text) to anon, authenticated;

create or replace function public.upsert_mailbox_message_from_repository(
  p_message jsonb,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns public.encouragement_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.encouragement_cards%rowtype;
  v_existing public.encouragement_cards%rowtype;
  v_id uuid := nullif(p_message ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_message ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_message ->> 'child_id', '')::uuid;
  v_key text := nullif(p_message ->> 'client_request_id', '');
  v_media_id uuid := nullif(p_message ->> 'media_id', '')::uuid;
  v_sender_role text;
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_id is null then
    raise exception 'Mailbox message id is required' using errcode = '22023';
  end if;

  if v_key is not null then
    select * into v_row
    from public.encouragement_cards
    where family_id = v_family_id and child_id = v_child_id and client_request_id = v_key
    limit 1;
    if found then
      return v_row;
    end if;
  end if;

  select * into v_existing
  from public.encouragement_cards
  where id = v_id and family_id = v_family_id and child_id = v_child_id
  limit 1;

  v_sender_role := coalesce(nullif(p_message ->> 'sender_role', ''), v_existing.sender_role, case when auth.uid() is null then 'child' else 'parent' end);

  insert into public.encouragement_cards (
    id, family_id, child_id, title, message, status, sent_at, opened_at,
    created_by, sender_user_id, sender_role, card_type, template_key,
    media_id, media_bucket, media_path, media_mime_type, scheduled_at,
    archived_at, client_request_id, created_at, updated_at
  )
  values (
    v_id, v_family_id, v_child_id,
    coalesce(nullif(p_message ->> 'title', ''), v_existing.title),
    coalesce(nullif(p_message ->> 'message', ''), v_existing.message),
    coalesce(nullif(p_message ->> 'status', ''), v_existing.status, 'sent'),
    coalesce(nullif(p_message ->> 'sent_at', '')::timestamptz, v_existing.sent_at, now()),
    coalesce(nullif(p_message ->> 'opened_at', '')::timestamptz, v_existing.opened_at),
    coalesce(nullif(p_message ->> 'created_by', '')::uuid, v_existing.created_by, auth.uid()),
    coalesce(nullif(p_message ->> 'sender_user_id', '')::uuid, v_existing.sender_user_id, auth.uid()),
    v_sender_role,
    coalesce(nullif(p_message ->> 'card_type', ''), v_existing.card_type, 'text'),
    coalesce(nullif(p_message ->> 'template_key', ''), v_existing.template_key),
    coalesce(v_media_id, v_existing.media_id),
    coalesce(nullif(p_message ->> 'media_bucket', ''), v_existing.media_bucket),
    coalesce(nullif(p_message ->> 'media_path', ''), v_existing.media_path),
    coalesce(nullif(p_message ->> 'media_mime_type', ''), v_existing.media_mime_type),
    coalesce(nullif(p_message ->> 'scheduled_at', '')::timestamptz, v_existing.scheduled_at),
    coalesce(nullif(p_message ->> 'archived_at', '')::timestamptz, v_existing.archived_at),
    coalesce(v_key, v_existing.client_request_id),
    coalesce(nullif(p_message ->> 'created_at', '')::timestamptz, v_existing.created_at, now()),
    coalesce(nullif(p_message ->> 'updated_at', '')::timestamptz, now())
  )
  on conflict (id) do update set
    title = excluded.title,
    message = excluded.message,
    status = excluded.status,
    sent_at = excluded.sent_at,
    opened_at = excluded.opened_at,
    sender_role = excluded.sender_role,
    card_type = excluded.card_type,
    template_key = excluded.template_key,
    media_id = excluded.media_id,
    media_bucket = excluded.media_bucket,
    media_path = excluded.media_path,
    media_mime_type = excluded.media_mime_type,
    scheduled_at = excluded.scheduled_at,
    archived_at = excluded.archived_at,
    client_request_id = coalesce(public.encouragement_cards.client_request_id, excluded.client_request_id),
    updated_at = excluded.updated_at
  returning * into v_row;

  if v_media_id is not null then
    update public.media_assets
    set entity_type = 'mailbox',
        entity_id = v_row.id,
        purpose = coalesce(purpose, 'attachment')
    where family_id = v_family_id
      and child_id = v_child_id
      and id = v_media_id;
  end if;

  if v_sender_role = 'parent' and v_row.archived_at is null then
    perform public._insert_repository_notification(
      v_family_id,
      v_child_id,
      'child',
      'encouragement_card_received',
      '你收到一封新的信',
      coalesce(v_row.title, v_row.message, '家長寫了一封信給你'),
      'mailbox',
      v_row.id,
      coalesce(v_key, 'mailbox:' || v_row.id::text) || ':notify:child'
    );
  end if;

  return v_row;
end;
$$;

revoke all on function public.upsert_mailbox_message_from_repository(jsonb, text, uuid) from public;
grant execute on function public.upsert_mailbox_message_from_repository(jsonb, text, uuid) to anon, authenticated;

create or replace function public.upsert_special_day_from_repository(
  p_day jsonb,
  p_operation text default 'upsert',
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns public.special_days
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.special_days%rowtype;
  v_id uuid := nullif(p_day ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_day ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_day ->> 'child_id', '')::uuid;
  v_key text := coalesce(nullif(p_day ->> 'client_request_id', ''), 'special-day:' || coalesce(p_operation, 'upsert') || ':' || v_id::text);
  v_media_id uuid := nullif(coalesce(p_day ->> 'image_media_id', p_day ->> 'cover_path', ''), '')::uuid;
  v_created_by_role text := coalesce(nullif(p_day ->> 'created_by_role', ''), case when v_key like '%:child:%' or p_device_binding_id is not null then 'child' else 'parent' end);
  v_child_name text;
begin
  if v_child_id is not null then
    perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  elsif not public.can_write_family(v_family_id) then
    raise exception 'Not allowed to write this special day' using errcode = '42501';
  end if;
  if v_id is null or v_key is null then
    raise exception 'Special day id and client_request_id are required' using errcode = '22023';
  end if;

  if p_operation = 'delete' then
    update public.special_days
    set archived_at = coalesce(archived_at, now()), updated_at = now(), client_request_id = coalesce(client_request_id, v_key)
    where id = v_id and family_id = v_family_id and (child_id is not distinct from v_child_id)
    returning * into v_row;
    if not found then raise exception 'Special day not found' using errcode = 'P0002'; end if;
    return v_row;
  end if;

  select * into v_row
  from public.special_days
  where family_id = v_family_id and client_request_id = v_key and child_id is not distinct from v_child_id
  limit 1;
  if found then return v_row; end if;

  insert into public.special_days (
    id, family_id, child_id, event_type, title, description, event_date, is_recurring,
    recurrence_rule, reminder_enabled, remind_days_before, cover_path, image_media_id,
    created_by, client_request_id, created_at, updated_at, archived_at
  )
  values (
    v_id, v_family_id, v_child_id, coalesce(nullif(p_day ->> 'event_type', ''), 'custom'),
    coalesce(nullif(p_day ->> 'title', ''), 'Special day'), nullif(p_day ->> 'description', ''),
    coalesce(nullif(p_day ->> 'event_date', '')::date, current_date),
    coalesce(nullif(p_day ->> 'is_recurring', '')::boolean, false),
    nullif(p_day ->> 'recurrence_rule', ''),
    coalesce(nullif(p_day ->> 'reminder_enabled', '')::boolean, true),
    coalesce(nullif(p_day ->> 'remind_days_before', '')::integer, 7),
    v_media_id::text,
    v_media_id,
    coalesce(auth.uid(), (select owner_id from public.families where id = v_family_id), nullif(p_day ->> 'created_by', '')::uuid),
    v_key,
    coalesce(nullif(p_day ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_day ->> 'updated_at', '')::timestamptz, now()),
    nullif(p_day ->> 'archived_at', '')::timestamptz
  )
  on conflict (id) do update set
    child_id = excluded.child_id,
    event_type = excluded.event_type,
    title = excluded.title,
    description = excluded.description,
    event_date = excluded.event_date,
    is_recurring = excluded.is_recurring,
    recurrence_rule = excluded.recurrence_rule,
    reminder_enabled = excluded.reminder_enabled,
    remind_days_before = excluded.remind_days_before,
    cover_path = excluded.cover_path,
    image_media_id = excluded.image_media_id,
    client_request_id = coalesce(public.special_days.client_request_id, excluded.client_request_id),
    archived_at = excluded.archived_at,
    updated_at = excluded.updated_at
  returning * into v_row;

  if v_media_id is not null then
    update public.media_assets
    set entity_type = 'special-day',
        entity_id = v_row.id,
        purpose = coalesce(purpose, 'content')
    where family_id = v_family_id
      and (v_child_id is null or child_id = v_child_id)
      and id = v_media_id;
  end if;

  select display_name into v_child_name from public.children where id = v_child_id limit 1;

  if v_row.archived_at is null and v_child_id is not null then
    if v_created_by_role = 'child' then
      perform public._insert_repository_notification(
        v_family_id,
        v_child_id,
        'parent',
        'special_day_reminder',
        coalesce(v_child_name, '孩子') || '新增了一個重要日子：' || v_row.title,
        v_row.description,
        'special_day',
        v_row.id,
        v_key || ':notify:parent'
      );
    else
      perform public._insert_repository_notification(
        v_family_id,
        v_child_id,
        'child',
        'special_day_reminder',
        '家長新增了一個重要日子：' || v_row.title,
        v_row.description,
        'special_day',
        v_row.id,
        v_key || ':notify:child'
      );
    end if;
  end if;

  return v_row;
end;
$$;

revoke all on function public.upsert_special_day_from_repository(jsonb, text, text, uuid) from public;
grant execute on function public.upsert_special_day_from_repository(jsonb, text, text, uuid) to anon, authenticated;

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
  v_today date := public.taipei_today();
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

  perform public._ensure_daily_task_instances(v_child.family_id, v_child.id, v_today);
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
    'tasks', coalesce((select jsonb_agg(to_jsonb(task_row) order by task_row.updated_at desc) from public.tasks as task_row where task_row.family_id = v_child.family_id and task_row.child_id = v_child.id and task_row.archived_at is null and task_row.status not in ('cancelled', 'expired') and (task_row.category <> 'daily' or (coalesce(task_row.daily_template_active, false) = false and task_row.occurrence_date = v_today))), '[]'::jsonb),
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
    'special_days', coalesce((select jsonb_agg(to_jsonb(day_row) order by day_row.updated_at desc) from public.special_days as day_row where day_row.family_id = v_child.family_id and day_row.child_id = v_child.id), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(notification_row) order by notification_row.created_at desc) from public.notifications as notification_row where notification_row.family_id = v_child.family_id and notification_row.recipient_child_id = v_child.id), '[]'::jsonb),
    'growth_records', coalesce((select jsonb_agg(to_jsonb(growth_row) order by growth_row.updated_at desc) from public.growth_records as growth_row where growth_row.family_id = v_child.family_id and growth_row.child_id = v_child.id), '[]'::jsonb),
    'tablet_time', coalesce((select jsonb_agg(to_jsonb(tablet_row) order by tablet_row.updated_at desc) from public.tablet_time as tablet_row where tablet_row.family_id = v_child.family_id and tablet_row.child_id = v_child.id), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(to_jsonb(badge_row) order by badge_row.created_at desc) from public.badges as badge_row where badge_row.family_id = v_child.family_id), '[]'::jsonb),
    'child_badges', coalesce((select jsonb_agg(to_jsonb(child_badge_row) order by child_badge_row.awarded_at desc) from public.child_badges as child_badge_row where child_badge_row.family_id = v_child.family_id and child_badge_row.child_id = v_child.id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_child_scoped_repository_state(uuid, text, uuid) from public;
grant execute on function public.get_child_scoped_repository_state(uuid, text, uuid) to anon, authenticated;
