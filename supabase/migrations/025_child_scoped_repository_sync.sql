-- Child-session scoped repository sync for QR + PIN device binding.
-- These RPCs are security-definer entry points for anonymous child devices.
-- Every request is constrained by an active, unreplaced, unrecalled device binding.

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

create or replace function public.sync_child_scoped_repository_delta(
  p_child_id uuid,
  p_device_binding_id text,
  p_device_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_child public.children%rowtype;
begin
  select binding_row.family_id
  into v_family_id
  from public.device_bindings as binding_row
  where binding_row.id = p_device_binding_id
    and binding_row.child_id = p_child_id
    and binding_row.device_id = p_device_id
    and binding_row.binding_status = 'bound'
    and coalesce(binding_row.device_binding_status, 'active') = 'active'
    and binding_row.revoked_at is null
    and binding_row.replaced_at is null
  limit 1;

  if v_family_id is null then
    raise exception 'Child device binding is invalid'
      using errcode = '28000';
  end if;

  select child_row.*
  into v_child
  from public.children as child_row
  where child_row.id = p_child_id
    and child_row.family_id = v_family_id
    and child_row.status = 'active'
  limit 1;

  if not found then
    raise exception 'Child is not active'
      using errcode = '28000';
  end if;

  insert into public.tasks (
    id, family_id, child_id, title, description, category, task_date, due_at, recurrence_rule, status,
    reward_stars, reward_screen_minutes, completion_note, completed_at, reviewed_by, reviewed_at,
    rejection_reason, created_by, created_at, updated_at, archived_at
  )
  select task_row.id, task_row.family_id, task_row.child_id, task_row.title, task_row.description, task_row.category,
    task_row.task_date, task_row.due_at, task_row.recurrence_rule, task_row.status, task_row.reward_stars,
    task_row.reward_screen_minutes, task_row.completion_note, task_row.completed_at, task_row.reviewed_by,
    task_row.reviewed_at, task_row.rejection_reason, task_row.created_by, task_row.created_at,
    task_row.updated_at, task_row.archived_at
  from jsonb_populate_recordset(null::public.tasks, coalesce(p_payload -> 'tasks', '[]'::jsonb)) as task_row
  where task_row.family_id = v_family_id and task_row.child_id = p_child_id
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    category = excluded.category,
    task_date = excluded.task_date,
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
    archived_at = excluded.archived_at;

  insert into public.task_records (id, family_id, child_id, task_id, status, note, payload, created_at)
  select record_row.id, record_row.family_id, record_row.child_id, record_row.task_id, record_row.status,
    record_row.note, record_row.payload, record_row.created_at
  from jsonb_populate_recordset(null::public.task_records, coalesce(p_payload -> 'task_records', '[]'::jsonb)) as record_row
  where record_row.family_id = v_family_id and record_row.child_id = p_child_id
  on conflict (id) do update set
    task_id = excluded.task_id,
    status = excluded.status,
    note = excluded.note,
    payload = excluded.payload,
    created_at = excluded.created_at;

  insert into public.stars (
    id, family_id, child_id, amount, transaction_type, reason, task_id, share_id, dream_id,
    reversal_of_id, idempotency_key, created_by, created_at
  )
  select star_row.id, star_row.family_id, star_row.child_id, star_row.amount, star_row.transaction_type,
    star_row.reason, star_row.task_id, star_row.share_id, star_row.dream_id, star_row.reversal_of_id,
    star_row.idempotency_key, star_row.created_by, star_row.created_at
  from jsonb_populate_recordset(null::public.stars, coalesce(p_payload -> 'stars', '[]'::jsonb)) as star_row
  where star_row.family_id = v_family_id and star_row.child_id = p_child_id
  on conflict (id) do nothing;

  insert into public.dreams (
    id, family_id, child_id, title, description, cover_path, target_amount, currency, status, priority,
    requested_by_child, approved_by, approved_at, target_date, completed_at, created_by, created_at, updated_at, archived_at
  )
  select dream_row.id, dream_row.family_id, dream_row.child_id, dream_row.title, dream_row.description,
    dream_row.cover_path, dream_row.target_amount, dream_row.currency, dream_row.status, dream_row.priority,
    dream_row.requested_by_child, dream_row.approved_by, dream_row.approved_at, dream_row.target_date,
    dream_row.completed_at, dream_row.created_by, dream_row.created_at, dream_row.updated_at, dream_row.archived_at
  from jsonb_populate_recordset(null::public.dreams, coalesce(p_payload -> 'dreams', '[]'::jsonb)) as dream_row
  where dream_row.family_id = v_family_id and dream_row.child_id = p_child_id
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    cover_path = excluded.cover_path,
    target_amount = excluded.target_amount,
    currency = excluded.currency,
    status = excluded.status,
    priority = excluded.priority,
    requested_by_child = excluded.requested_by_child,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    target_date = excluded.target_date,
    completed_at = excluded.completed_at,
    updated_at = excluded.updated_at,
    archived_at = excluded.archived_at;

  insert into public.shares (
    id, family_id, child_id, title, caption, share_type, source_type, status, submitted_at,
    reviewed_by, reviewed_at, rejection_reason, published_at, created_by_user_id, created_by_device_id,
    created_at, updated_at, deleted_at
  )
  select share_row.id, share_row.family_id, share_row.child_id, share_row.title, share_row.caption,
    share_row.share_type, share_row.source_type, share_row.status, share_row.submitted_at, share_row.reviewed_by,
    share_row.reviewed_at, share_row.rejection_reason, share_row.published_at, share_row.created_by_user_id,
    share_row.created_by_device_id, share_row.created_at, share_row.updated_at, share_row.deleted_at
  from jsonb_populate_recordset(null::public.shares, coalesce(p_payload -> 'shares', '[]'::jsonb)) as share_row
  where share_row.family_id = v_family_id and share_row.child_id = p_child_id
  on conflict (id) do update set
    title = excluded.title,
    caption = excluded.caption,
    share_type = excluded.share_type,
    source_type = excluded.source_type,
    status = excluded.status,
    submitted_at = excluded.submitted_at,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    rejection_reason = excluded.rejection_reason,
    published_at = excluded.published_at,
    created_by_user_id = excluded.created_by_user_id,
    created_by_device_id = excluded.created_by_device_id,
    updated_at = excluded.updated_at,
    deleted_at = excluded.deleted_at;

  insert into public.share_media (
    id, family_id, child_id, share_id, media_type, bucket, storage_path, mime_type, file_size_bytes,
    width, height, duration_seconds, thumbnail_path, sort_order, created_at
  )
  select media_row.id, media_row.family_id, media_row.child_id, media_row.share_id, media_row.media_type,
    media_row.bucket, media_row.storage_path, media_row.mime_type, media_row.file_size_bytes,
    media_row.width, media_row.height, media_row.duration_seconds, media_row.thumbnail_path,
    media_row.sort_order, media_row.created_at
  from jsonb_populate_recordset(null::public.share_media, coalesce(p_payload -> 'share_media', '[]'::jsonb)) as media_row
  where media_row.family_id = v_family_id and media_row.child_id = p_child_id
  on conflict (id) do update set
    share_id = excluded.share_id,
    media_type = excluded.media_type,
    bucket = excluded.bucket,
    storage_path = excluded.storage_path,
    mime_type = excluded.mime_type,
    file_size_bytes = excluded.file_size_bytes,
    width = excluded.width,
    height = excluded.height,
    duration_seconds = excluded.duration_seconds,
    thumbnail_path = excluded.thumbnail_path,
    sort_order = excluded.sort_order,
    created_at = excluded.created_at;

  insert into public.piggy_bank_records (id, family_id, child_id, amount, record_type, note, payload, created_at)
  select piggy_row.id, piggy_row.family_id, piggy_row.child_id, piggy_row.amount, piggy_row.record_type,
    piggy_row.note, piggy_row.payload, piggy_row.created_at
  from jsonb_populate_recordset(null::public.piggy_bank_records, coalesce(p_payload -> 'piggy_bank_records', '[]'::jsonb)) as piggy_row
  where piggy_row.family_id = v_family_id and piggy_row.child_id = p_child_id
  on conflict (id) do update set
    amount = excluded.amount,
    record_type = excluded.record_type,
    note = excluded.note,
    payload = excluded.payload,
    created_at = excluded.created_at;

  insert into public.store_items (id, family_id, child_id, name, price, status, payload, created_at, updated_at)
  select store_row.id, store_row.family_id, store_row.child_id, store_row.name, store_row.price,
    store_row.status, store_row.payload, store_row.created_at, store_row.updated_at
  from jsonb_populate_recordset(null::public.store_items, coalesce(p_payload -> 'store_items', '[]'::jsonb)) as store_row
  where store_row.family_id = v_family_id and store_row.child_id = p_child_id
  on conflict (id) do update set
    name = excluded.name,
    price = excluded.price,
    status = excluded.status,
    payload = excluded.payload,
    updated_at = excluded.updated_at;

  insert into public.purchases (id, family_id, child_id, store_item_id, status, amount, payload, created_at, updated_at)
  select purchase_row.id, purchase_row.family_id, purchase_row.child_id, purchase_row.store_item_id,
    purchase_row.status, purchase_row.amount, purchase_row.payload, purchase_row.created_at, purchase_row.updated_at
  from jsonb_populate_recordset(null::public.purchases, coalesce(p_payload -> 'purchases', '[]'::jsonb)) as purchase_row
  where purchase_row.family_id = v_family_id and purchase_row.child_id = p_child_id
  on conflict (id) do update set
    store_item_id = excluded.store_item_id,
    status = excluded.status,
    amount = excluded.amount,
    payload = excluded.payload,
    updated_at = excluded.updated_at;

  insert into public.encouragement_cards (
    id, family_id, child_id, title, message, status, sent_at, opened_at, created_by, created_at,
    updated_at, sender_user_id, card_type, template_key, media_bucket, media_path, media_mime_type,
    scheduled_at, archived_at
  )
  select card_row.id, card_row.family_id, card_row.child_id, card_row.title, card_row.message,
    card_row.status, card_row.sent_at, card_row.opened_at, card_row.created_by, card_row.created_at,
    card_row.updated_at, card_row.sender_user_id, card_row.card_type, card_row.template_key,
    card_row.media_bucket, card_row.media_path, card_row.media_mime_type, card_row.scheduled_at,
    card_row.archived_at
  from jsonb_populate_recordset(null::public.encouragement_cards, coalesce(p_payload -> 'encouragement_cards', '[]'::jsonb)) as card_row
  where card_row.family_id = v_family_id and card_row.child_id = p_child_id
  on conflict (id) do update set
    status = excluded.status,
    opened_at = excluded.opened_at,
    updated_at = excluded.updated_at,
    archived_at = excluded.archived_at;

  insert into public.special_days (
    id, family_id, child_id, event_type, title, description, event_date, is_recurring,
    recurrence_rule, reminder_enabled, remind_days_before, cover_path, created_by, created_at,
    updated_at, archived_at
  )
  select day_row.id, day_row.family_id, day_row.child_id, day_row.event_type, day_row.title,
    day_row.description, day_row.event_date, day_row.is_recurring, day_row.recurrence_rule,
    day_row.reminder_enabled, day_row.remind_days_before, day_row.cover_path, day_row.created_by,
    day_row.created_at, day_row.updated_at, day_row.archived_at
  from jsonb_populate_recordset(null::public.special_days, coalesce(p_payload -> 'special_days', '[]'::jsonb)) as day_row
  where day_row.family_id = v_family_id and day_row.child_id = p_child_id
  on conflict (id) do update set
    event_type = excluded.event_type,
    title = excluded.title,
    description = excluded.description,
    event_date = excluded.event_date,
    is_recurring = excluded.is_recurring,
    recurrence_rule = excluded.recurrence_rule,
    reminder_enabled = excluded.reminder_enabled,
    remind_days_before = excluded.remind_days_before,
    cover_path = excluded.cover_path,
    updated_at = excluded.updated_at,
    archived_at = excluded.archived_at;

  insert into public.growth_records (
    id, family_id, child_id, category_id, title, content, record_type, recorded_on, mood,
    visibility, source_type, created_by, source_child_device_id, created_at, updated_at
  )
  select growth_row.id, growth_row.family_id, growth_row.child_id, growth_row.category_id, growth_row.title,
    growth_row.content, growth_row.record_type, growth_row.recorded_on, growth_row.mood, growth_row.visibility,
    growth_row.source_type, growth_row.created_by, growth_row.source_child_device_id, growth_row.created_at,
    growth_row.updated_at
  from jsonb_populate_recordset(null::public.growth_records, coalesce(p_payload -> 'growth_records', '[]'::jsonb)) as growth_row
  where growth_row.family_id = v_family_id and growth_row.child_id = p_child_id
  on conflict (id) do update set
    category_id = excluded.category_id,
    title = excluded.title,
    content = excluded.content,
    record_type = excluded.record_type,
    recorded_on = excluded.recorded_on,
    mood = excluded.mood,
    visibility = excluded.visibility,
    source_type = excluded.source_type,
    created_by = excluded.created_by,
    source_child_device_id = excluded.source_child_device_id,
    updated_at = excluded.updated_at;

  insert into public.tablet_time (id, family_id, child_id, entry_type, minutes, status, note, payload, created_at, updated_at)
  select tablet_row.id, tablet_row.family_id, tablet_row.child_id, tablet_row.entry_type, tablet_row.minutes,
    tablet_row.status, tablet_row.note, tablet_row.payload, tablet_row.created_at, tablet_row.updated_at
  from jsonb_populate_recordset(null::public.tablet_time, coalesce(p_payload -> 'tablet_time', '[]'::jsonb)) as tablet_row
  where tablet_row.family_id = v_family_id and tablet_row.child_id = p_child_id
  on conflict (id) do update set
    entry_type = excluded.entry_type,
    minutes = excluded.minutes,
    status = excluded.status,
    note = excluded.note,
    payload = excluded.payload,
    updated_at = excluded.updated_at;

  insert into public.dream_funds (
    id, family_id, child_id, dream_id, amount, transaction_type, note, source_star_id,
    reversal_of_id, idempotency_key, created_by, created_at
  )
  select fund_row.id, fund_row.family_id, fund_row.child_id, fund_row.dream_id, fund_row.amount,
    fund_row.transaction_type, fund_row.note, fund_row.source_star_id, fund_row.reversal_of_id,
    fund_row.idempotency_key, fund_row.created_by, fund_row.created_at
  from jsonb_populate_recordset(null::public.dream_funds, coalesce(p_payload -> 'dream_funds', '[]'::jsonb)) as fund_row
  where fund_row.family_id = v_family_id and fund_row.child_id = p_child_id
  on conflict (id) do nothing;

  insert into public.child_badges (id, family_id, child_id, badge_id, awarded_by, source_entity_type, source_entity_id, note, awarded_at)
  select child_badge_row.id, child_badge_row.family_id, child_badge_row.child_id, child_badge_row.badge_id,
    child_badge_row.awarded_by, child_badge_row.source_entity_type, child_badge_row.source_entity_id,
    child_badge_row.note, child_badge_row.awarded_at
  from jsonb_populate_recordset(null::public.child_badges, coalesce(p_payload -> 'child_badges', '[]'::jsonb)) as child_badge_row
  where child_badge_row.family_id = v_family_id and child_badge_row.child_id = p_child_id
  on conflict (id) do update set
    badge_id = excluded.badge_id,
    awarded_by = excluded.awarded_by,
    source_entity_type = excluded.source_entity_type,
    source_entity_id = excluded.source_entity_id,
    note = excluded.note,
    awarded_at = excluded.awarded_at;

  update public.device_bindings as binding_row
  set last_heartbeat_at = now(),
      updated_at = now()
  where binding_row.id = p_device_binding_id;

  return jsonb_build_object('family_id', v_family_id, 'child_id', p_child_id, 'synced_at', now());
end;
$$;

revoke all on function public.get_child_scoped_repository_state(uuid, text, uuid) from public;
revoke all on function public.sync_child_scoped_repository_delta(uuid, text, uuid, jsonb) from public;
grant execute on function public.get_child_scoped_repository_state(uuid, text, uuid) to anon, authenticated;
grant execute on function public.sync_child_scoped_repository_delta(uuid, text, uuid, jsonb) to anon, authenticated;
