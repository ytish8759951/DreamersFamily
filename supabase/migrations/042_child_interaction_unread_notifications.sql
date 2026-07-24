-- Little Dreamers Family
-- Child bottom-nav unread indicators backed by formal Supabase notifications.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (notification_type in (
    'task_assigned',
    'task_updated',
    'task_submitted',
    'task_approved',
    'task_stars_awarded',
    'share_submitted',
    'share_approved',
    'share_encouraged',
    'share_stars_awarded',
    'encouragement_card_received',
    'piggy_income_added',
    'piggy_product_created',
    'piggy_product_updated',
    'piggy_product_status_updated',
    'piggy_purchase_status_updated',
    'dream_funded',
    'dream_completed',
    'screen_time_low',
    'special_day_reminder',
    'weekly_digest'
  ));

create or replace function public._notify_child_interaction(
  p_family_id uuid,
  p_child_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_category text,
  p_entity_id uuid,
  p_dedupe_key text
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification public.notifications%rowtype;
begin
  if p_family_id is null or p_child_id is null or p_dedupe_key is null then
    return null;
  end if;
  if auth.uid() is null or not public.can_write_family(p_family_id) then
    return null;
  end if;

  v_notification := public._insert_repository_notification(
    p_family_id,
    p_child_id,
    'child',
    p_type,
    p_title,
    p_body,
    p_category,
    p_entity_id,
    p_dedupe_key
  );
  return v_notification;
end;
$$;

create or replace function public._notify_child_task_interaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean := false;
begin
  if new.archived_at is not null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public._notify_child_interaction(
      new.family_id,
      new.child_id,
      'task_assigned',
      '家長新增了新任務',
      nullif(new.title, ''),
      'task',
      new.id,
      'task:' || new.id::text || ':assigned'
    );
    return new;
  end if;

  v_changed :=
    old.title is distinct from new.title or
    old.description is distinct from new.description or
    old.task_date is distinct from new.task_date or
    old.due_at is distinct from new.due_at or
    old.reward_stars is distinct from new.reward_stars or
    old.reward_screen_minutes is distinct from new.reward_screen_minutes or
    old.task_image_media_id is distinct from new.task_image_media_id or
    old.thumbnail_media_id is distinct from new.thumbnail_media_id;

  if old.status is distinct from new.status and new.status = 'approved' and coalesce(new.reward_stars, 0) <= 0 then
    perform public._notify_child_interaction(
      new.family_id,
      new.child_id,
      'task_approved',
      '家長完成了任務審核',
      nullif(new.title, ''),
      'task',
      new.id,
      'task:' || new.id::text || ':approved'
    );
  elsif v_changed then
    perform public._notify_child_interaction(
      new.family_id,
      new.child_id,
      'task_updated',
      '家長更新了任務',
      nullif(new.title, ''),
      'task',
      new.id,
      'task:' || new.id::text || ':updated:' || extract(epoch from coalesce(new.updated_at, now()))::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_child_task_interaction on public.tasks;
create trigger trg_notify_child_task_interaction
after insert or update on public.tasks
for each row execute function public._notify_child_task_interaction();

create or replace function public._notify_child_star_interaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.transaction_type = 'task_reward' and new.task_id is not null then
    perform public._notify_child_interaction(
      new.family_id,
      new.child_id,
      'task_stars_awarded',
      '家長給了你星星',
      case when new.amount > 0 then new.amount::text || ' 顆星星' else null end,
      'task',
      new.task_id,
      coalesce(new.idempotency_key, 'star:' || new.id::text) || ':notify'
    );
  elsif new.transaction_type = 'share_reward' and new.share_id is not null then
    perform public._notify_child_interaction(
      new.family_id,
      new.child_id,
      'share_stars_awarded',
      '家長鼓勵了你的分享',
      case when new.amount > 0 then new.amount::text || ' 顆星星' else null end,
      'share',
      new.share_id,
      coalesce(new.idempotency_key, 'share_reward:' || new.share_id::text) || ':notify'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_child_star_interaction on public.stars;
create trigger trg_notify_child_star_interaction
after insert on public.stars
for each row execute function public._notify_child_star_interaction();

create or replace function public._notify_child_piggy_record_interaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_type = 'income' then
    perform public._notify_child_interaction(
      new.family_id,
      new.child_id,
      'piggy_income_added',
      '家長新增了可投入金額',
      case when new.amount is not null then new.amount::text || ' 元' else null end,
      'piggy',
      new.id,
      coalesce(new.client_request_id, 'piggy:income:' || new.id::text) || ':notify'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_child_piggy_record_interaction on public.piggy_bank_records;
create trigger trg_notify_child_piggy_record_interaction
after insert on public.piggy_bank_records
for each row execute function public._notify_child_piggy_record_interaction();

create or replace function public._notify_child_store_item_interaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_title text;
begin
  if new.deleted_at is not null or new.status = 'deleted' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_type := 'piggy_product_created';
    v_title := '家長新增了新商品';
  elsif old.status is distinct from new.status then
    v_type := 'piggy_product_status_updated';
    v_title := '商品狀態更新了';
  elsif old.name is distinct from new.name or old.price is distinct from new.price
     or old.main_media_id is distinct from new.main_media_id
     or old.gallery_media_ids is distinct from new.gallery_media_ids then
    v_type := 'piggy_product_updated';
    v_title := '家長更新了商品';
  else
    return new;
  end if;

  perform public._notify_child_interaction(
    new.family_id,
    new.child_id,
    v_type,
    v_title,
    nullif(new.name, ''),
    'piggy',
    new.id,
    'piggy:product:' || new.id::text || ':' || v_type || ':' || extract(epoch from coalesce(new.updated_at, now()))::text
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_child_store_item_interaction on public.store_items;
create trigger trg_notify_child_store_item_interaction
after insert or update on public.store_items
for each row execute function public._notify_child_store_item_interaction();

create or replace function public._notify_child_purchase_interaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;
  if new.status not in ('arrived', 'purchased', 'completed') then
    return new;
  end if;

  perform public._notify_child_interaction(
    new.family_id,
    new.child_id,
    'piggy_purchase_status_updated',
    case
      when new.status = 'arrived' then '商品已到貨'
      when new.status = 'purchased' then '商品等待到貨'
      else '購買狀態已確認'
    end,
    null,
    'piggy',
    new.id,
    'piggy:purchase:' || new.id::text || ':status:' || new.status
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_child_purchase_interaction on public.purchases;
create trigger trg_notify_child_purchase_interaction
after insert or update on public.purchases
for each row execute function public._notify_child_purchase_interaction();

create or replace function public.mark_child_notifications_read(
  p_child_id uuid,
  p_category text,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_count integer := 0;
begin
  if p_category not in ('task', 'share', 'piggy') then
    raise exception 'Unsupported notification category' using errcode = '22023';
  end if;

  select family_id into v_family_id
  from public.children
  where id = p_child_id and status = 'active';
  if v_family_id is null then
    raise exception 'Child not found' using errcode = 'P0002';
  end if;

  perform public._assert_piggy_access(v_family_id, p_child_id, p_device_binding_id, p_device_id);

  update public.notifications
  set read_at = coalesce(read_at, now()),
      updated_at = now()
  where family_id = v_family_id
    and recipient_child_id = p_child_id
    and entity_type = p_category
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_child_notifications_read(uuid, text, text, uuid) from public;
grant execute on function public.mark_child_notifications_read(uuid, text, text, uuid) to anon, authenticated;
