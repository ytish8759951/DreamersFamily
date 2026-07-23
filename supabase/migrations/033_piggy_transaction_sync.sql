-- Little Dreamers Family
-- Formal piggy-bank/product/purchase sync with idempotent transaction RPCs.

alter table public.piggy_bank_records
  add column if not exists client_request_id text,
  add column if not exists product_id uuid,
  add column if not exists purchase_id uuid;

alter table public.store_items
  add column if not exists main_media_id uuid references public.media_assets(id) on delete set null,
  add column if not exists gallery_media_ids uuid[] not null default '{}',
  add column if not exists shelf_slot integer,
  add column if not exists client_request_id text,
  add column if not exists deleted_at timestamptz;

alter table public.purchases
  add column if not exists client_request_id text;

create unique index if not exists uq_piggy_bank_records_request
  on public.piggy_bank_records(family_id, child_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists uq_store_items_request
  on public.store_items(family_id, child_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists uq_purchases_request
  on public.purchases(family_id, child_id, client_request_id)
  where client_request_id is not null;

create index if not exists idx_piggy_bank_records_purchase
  on public.piggy_bank_records(purchase_id)
  where purchase_id is not null;

create or replace function public._assert_piggy_access(
  p_family_id uuid,
  p_child_id uuid,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_family_id is null or p_child_id is null then
    raise exception 'Family and child are required' using errcode = '22023';
  end if;

  if public.can_write_family(p_family_id) then
    if not exists (
      select 1 from public.children
      where family_id = p_family_id and id = p_child_id and status = 'active'
    ) then
      raise exception 'Child is not active in this family' using errcode = '23503';
    end if;
    return;
  end if;

  if p_device_binding_id is not null and p_device_id is not null and exists (
    select 1
    from public.device_bindings as binding_row
    join public.children as child_row
      on child_row.family_id = binding_row.family_id
     and child_row.id = binding_row.child_id
     and child_row.status = 'active'
    where binding_row.id = p_device_binding_id
      and binding_row.family_id = p_family_id
      and binding_row.child_id = p_child_id
      and binding_row.device_id = p_device_id
      and binding_row.binding_status = 'bound'
      and coalesce(binding_row.device_binding_status, 'active') = 'active'
      and binding_row.revoked_at is null
      and binding_row.replaced_at is null
  ) then
    return;
  end if;

  raise exception 'Not allowed to write piggy data for this child' using errcode = '42501';
end;
$$;

revoke all on function public._assert_piggy_access(uuid, uuid, text, uuid) from public;

create or replace function public.create_piggy_income_with_deposit(
  p_income jsonb,
  p_deposit jsonb,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid := nullif(p_income ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_income ->> 'child_id', '')::uuid;
  v_income_id uuid := nullif(p_income ->> 'id', '')::uuid;
  v_deposit_id uuid := nullif(p_deposit ->> 'id', '')::uuid;
  v_income_key text := nullif(p_income ->> 'client_request_id', '');
  v_deposit_key text := nullif(p_deposit ->> 'client_request_id', '');
  v_amount numeric := coalesce(nullif(p_income ->> 'amount', '')::numeric, 0);
  v_source text := coalesce(nullif(p_income ->> 'note', ''), p_income #>> '{payload,income,source}', '零用錢');
  v_created_at timestamptz := coalesce(nullif(p_income ->> 'created_at', '')::timestamptz, now());
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_income_id is null or v_deposit_id is null or v_amount <= 0 then
    raise exception 'Income id, deposit id and positive amount are required' using errcode = '22023';
  end if;

  insert into public.piggy_bank_records (
    id, family_id, child_id, amount, record_type, note, payload,
    client_request_id, product_id, purchase_id, created_at
  )
  values (
    v_income_id, v_family_id, v_child_id, v_amount, 'income', v_source,
    p_income -> 'payload', v_income_key, null, null, v_created_at
  )
  on conflict (family_id, child_id, client_request_id) where client_request_id is not null do nothing;

  insert into public.piggy_bank_records (
    id, family_id, child_id, amount, record_type, note, payload,
    client_request_id, product_id, purchase_id, created_at
  )
  values (
    v_deposit_id, v_family_id, v_child_id, v_amount, 'coin_deposit', v_source,
    p_deposit -> 'payload', v_deposit_key, null, null, v_created_at
  )
  on conflict (family_id, child_id, client_request_id) where client_request_id is not null do nothing;

  if found then
    insert into public.piggy_banks (family_id, child_id, balance, currency, updated_at)
    values (v_family_id, v_child_id, v_amount, 'TWD', now())
    on conflict (family_id, child_id) do update
    set balance = public.piggy_banks.balance + excluded.balance,
        updated_at = now();
  end if;

  return jsonb_build_object('income_id', v_income_id, 'deposit_id', v_deposit_id);
end;
$$;

revoke all on function public.create_piggy_income_with_deposit(jsonb, jsonb, text, uuid) from public;
grant execute on function public.create_piggy_income_with_deposit(jsonb, jsonb, text, uuid) to anon, authenticated;

create or replace function public.upsert_piggy_product_from_repository(
  p_product jsonb,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns public.store_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.store_items%rowtype;
  v_id uuid := nullif(p_product ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_product ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_product ->> 'child_id', '')::uuid;
  v_key text := nullif(p_product ->> 'client_request_id', '');
  v_main_media_id uuid := nullif(p_product ->> 'main_media_id', '')::uuid;
  v_gallery uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_product -> 'gallery_media_ids', '[]'::jsonb))::uuid), '{}');
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_id is null then
    raise exception 'Product id is required' using errcode = '22023';
  end if;

  if v_key is not null then
    select * into v_product
    from public.store_items
    where family_id = v_family_id and child_id = v_child_id and client_request_id = v_key
    limit 1;
    if found then
      return v_product;
    end if;
  end if;

  insert into public.store_items (
    id, family_id, child_id, name, price, status, main_media_id, gallery_media_ids,
    shelf_slot, client_request_id, deleted_at, payload, created_at, updated_at
  )
  values (
    v_id, v_family_id, v_child_id, coalesce(nullif(p_product ->> 'name', ''), '未命名商品'),
    coalesce(nullif(p_product ->> 'price', '')::numeric, 0),
    coalesce(nullif(p_product ->> 'status', ''), 'backlog'),
    v_main_media_id, v_gallery,
    nullif(p_product ->> 'shelf_slot', '')::integer,
    v_key,
    nullif(p_product ->> 'deleted_at', '')::timestamptz,
    coalesce(p_product -> 'payload', jsonb_build_object('local_product', p_product)),
    coalesce(nullif(p_product ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_product ->> 'updated_at', '')::timestamptz, now())
  )
  on conflict (id) do update set
    name = excluded.name,
    price = excluded.price,
    status = excluded.status,
    main_media_id = excluded.main_media_id,
    gallery_media_ids = excluded.gallery_media_ids,
    shelf_slot = excluded.shelf_slot,
    client_request_id = coalesce(public.store_items.client_request_id, excluded.client_request_id),
    deleted_at = excluded.deleted_at,
    payload = excluded.payload,
    updated_at = excluded.updated_at
  returning * into v_product;

  update public.media_assets
  set entity_type = 'piggy-product',
      entity_id = v_product.id,
      purpose = coalesce(purpose, 'content')
  where family_id = v_family_id
    and child_id = v_child_id
    and id = any(array_append(v_gallery, v_main_media_id));

  return v_product;
end;
$$;

revoke all on function public.upsert_piggy_product_from_repository(jsonb, text, uuid) from public;
grant execute on function public.upsert_piggy_product_from_repository(jsonb, text, uuid) to anon, authenticated;

create or replace function public.apply_piggy_purchase_event(
  p_purchase jsonb,
  p_bank_log jsonb default null,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.purchases%rowtype;
  v_id uuid := nullif(p_purchase ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_purchase ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_purchase ->> 'child_id', '')::uuid;
  v_product_id uuid := nullif(p_purchase ->> 'store_item_id', '')::uuid;
  v_status text := coalesce(nullif(p_purchase ->> 'status', ''), 'pendingPurchase');
  v_amount numeric := coalesce(nullif(p_purchase ->> 'amount', '')::numeric, 0);
  v_key text := nullif(p_purchase ->> 'client_request_id', '');
  v_log_id uuid := nullif(coalesce(p_bank_log ->> 'id', ''), '')::uuid;
  v_log_key text := nullif(coalesce(p_bank_log ->> 'client_request_id', ''), '');
  v_log_type text := nullif(coalesce(p_bank_log ->> 'record_type', ''), '');
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_id is null then
    raise exception 'Purchase id is required' using errcode = '22023';
  end if;

  if v_key is not null then
    select * into v_purchase
    from public.purchases
    where family_id = v_family_id and child_id = v_child_id and client_request_id = v_key
    limit 1;
    if found and v_purchase.status = v_status then
      return v_purchase;
    end if;
  end if;

  insert into public.purchases (
    id, family_id, child_id, store_item_id, status, amount, client_request_id,
    payload, created_at, updated_at
  )
  values (
    v_id, v_family_id, v_child_id, v_product_id, v_status, v_amount, v_key,
    coalesce(p_purchase -> 'payload', jsonb_build_object('local_purchase', p_purchase)),
    coalesce(nullif(p_purchase ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_purchase ->> 'updated_at', '')::timestamptz, now())
  )
  on conflict (id) do update set
    status = excluded.status,
    amount = excluded.amount,
    client_request_id = coalesce(public.purchases.client_request_id, excluded.client_request_id),
    payload = excluded.payload,
    updated_at = excluded.updated_at
  returning * into v_purchase;

  if p_bank_log is not null and v_log_id is not null and v_log_key is not null then
    if v_log_type = 'purchase_debit' then
      if coalesce((select balance from public.piggy_banks where family_id = v_family_id and child_id = v_child_id), 0) < v_amount then
        raise exception 'Piggy balance is insufficient' using errcode = '22003';
      end if;
    end if;

    insert into public.piggy_bank_records (
      id, family_id, child_id, amount, record_type, note, payload,
      client_request_id, product_id, purchase_id, created_at
    )
    values (
      v_log_id, v_family_id, v_child_id, coalesce(nullif(p_bank_log ->> 'amount', '')::numeric, v_amount),
      v_log_type, nullif(p_bank_log ->> 'note', ''), p_bank_log -> 'payload',
      v_log_key, v_product_id, v_id,
      coalesce(nullif(p_bank_log ->> 'created_at', '')::timestamptz, now())
    )
    on conflict (family_id, child_id, client_request_id) where client_request_id is not null do nothing;

    if found and v_log_type = 'purchase_debit' then
      update public.piggy_banks
      set balance = greatest(0, balance - v_amount),
          updated_at = now()
      where family_id = v_family_id and child_id = v_child_id;
    elsif found and v_log_type = 'purchase_refund' then
      insert into public.piggy_banks (family_id, child_id, balance, currency, updated_at)
      values (v_family_id, v_child_id, v_amount, 'TWD', now())
      on conflict (family_id, child_id) do update
      set balance = public.piggy_banks.balance + excluded.balance,
          updated_at = now();
    end if;
  end if;

  return v_purchase;
end;
$$;

revoke all on function public.apply_piggy_purchase_event(jsonb, jsonb, text, uuid) from public;
grant execute on function public.apply_piggy_purchase_event(jsonb, jsonb, text, uuid) to anon, authenticated;

alter table public.tablet_time
  add column if not exists client_request_id text;

create unique index if not exists uq_tablet_time_request
  on public.tablet_time(family_id, child_id, client_request_id)
  where client_request_id is not null;

create or replace function public.apply_tablet_time_log(
  p_log jsonb,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns public.tablet_time
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tablet_time%rowtype;
  v_id uuid := nullif(p_log ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_log ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_log ->> 'child_id', '')::uuid;
  v_minutes integer := coalesce(nullif(p_log ->> 'minutes', '')::integer, 0);
  v_entry_type text := coalesce(nullif(p_log ->> 'entry_type', ''), 'manual_grant');
  v_status text := coalesce(nullif(p_log ->> 'status', ''), v_entry_type);
  v_key text := coalesce(nullif(p_log ->> 'client_request_id', ''), p_log #>> '{payload,screen_time_log,idempotency_key}');
  v_balance integer;
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_id is null then
    raise exception 'Tablet time log id is required' using errcode = '22023';
  end if;
  if v_key is not null then
    select * into v_row
    from public.tablet_time
    where family_id = v_family_id and child_id = v_child_id and client_request_id = v_key
    limit 1;
    if found then
      return v_row;
    end if;
  end if;

  if v_minutes < 0 then
    select coalesce(sum(minutes), 0)::integer
    into v_balance
    from public.tablet_time
    where family_id = v_family_id
      and child_id = v_child_id
      and entry_type = 'log';
    if v_balance + v_minutes < 0 then
      raise exception 'Screen time cannot be deducted below zero' using errcode = '22003';
    end if;
  end if;

  insert into public.tablet_time (
    id, family_id, child_id, entry_type, minutes, status, note, payload,
    client_request_id, created_at, updated_at
  )
  values (
    v_id, v_family_id, v_child_id, 'log', v_minutes, v_status,
    nullif(p_log ->> 'note', ''), p_log -> 'payload', v_key,
    coalesce(nullif(p_log ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_log ->> 'updated_at', '')::timestamptz, now())
  )
  on conflict (id) do update set
    minutes = excluded.minutes,
    status = excluded.status,
    note = excluded.note,
    payload = excluded.payload,
    client_request_id = coalesce(public.tablet_time.client_request_id, excluded.client_request_id),
    updated_at = excluded.updated_at
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.apply_tablet_time_log(jsonb, text, uuid) from public;
grant execute on function public.apply_tablet_time_log(jsonb, text, uuid) to anon, authenticated;

alter table public.badges
  add column if not exists reward_stars integer not null default 0,
  add column if not exists client_request_id text,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.child_badges
  add column if not exists client_request_id text;

create unique index if not exists uq_badges_request
  on public.badges(family_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists uq_child_badges_request
  on public.child_badges(family_id, child_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists uq_child_badges_child_badge_once
  on public.child_badges(family_id, child_id, badge_id);

create or replace function public.upsert_badge_catalog_from_repository(p_badge jsonb)
returns public.badges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_badge public.badges%rowtype;
  v_id uuid := nullif(p_badge ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_badge ->> 'family_id', '')::uuid;
  v_key text := nullif(p_badge ->> 'client_request_id', '');
begin
  if not public.can_write_family(v_family_id) then
    raise exception 'Not allowed to write this badge catalog' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'Badge id is required' using errcode = '22023';
  end if;
  if v_key is not null then
    select * into v_badge
    from public.badges
    where family_id = v_family_id and client_request_id = v_key
    limit 1;
    if found then
      return v_badge;
    end if;
  end if;

  insert into public.badges (
    id, family_id, code, name, description, icon, image_media_id, is_system,
    reward_stars, client_request_id, deleted_at, created_at, updated_at
  )
  values (
    v_id, v_family_id, coalesce(nullif(p_badge ->> 'code', ''), v_id::text),
    coalesce(nullif(p_badge ->> 'name', ''), '徽章'),
    nullif(p_badge ->> 'description', ''),
    nullif(p_badge ->> 'icon', ''),
    nullif(p_badge ->> 'image_media_id', '')::uuid,
    false,
    coalesce(nullif(p_badge ->> 'reward_stars', '')::integer, 0),
    v_key,
    nullif(p_badge ->> 'deleted_at', '')::timestamptz,
    coalesce(nullif(p_badge ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_badge ->> 'updated_at', '')::timestamptz, now())
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    image_media_id = excluded.image_media_id,
    reward_stars = excluded.reward_stars,
    client_request_id = coalesce(public.badges.client_request_id, excluded.client_request_id),
    deleted_at = excluded.deleted_at,
    updated_at = excluded.updated_at
  returning * into v_badge;

  return v_badge;
end;
$$;

revoke all on function public.upsert_badge_catalog_from_repository(jsonb) from public;
grant execute on function public.upsert_badge_catalog_from_repository(jsonb) to authenticated;

create or replace function public.award_child_badge_from_repository(p_child_badge jsonb)
returns public.child_badges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.child_badges%rowtype;
  v_badge public.badges%rowtype;
  v_id uuid := nullif(p_child_badge ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_child_badge ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_child_badge ->> 'child_id', '')::uuid;
  v_badge_id uuid := nullif(p_child_badge ->> 'badge_id', '')::uuid;
  v_key text := nullif(p_child_badge ->> 'client_request_id', '');
  v_star_key text;
begin
  if not public.can_write_family(v_family_id) then
    raise exception 'Not allowed to award this badge' using errcode = '42501';
  end if;
  if v_id is null or v_child_id is null or v_badge_id is null then
    raise exception 'Badge award id, child id and badge id are required' using errcode = '22023';
  end if;

  select * into v_badge
  from public.badges
  where family_id = v_family_id and id = v_badge_id and deleted_at is null
  limit 1;
  if not found then
    raise exception 'Badge not found' using errcode = 'P0002';
  end if;

  if v_key is not null then
    select * into v_row
    from public.child_badges
    where family_id = v_family_id and child_id = v_child_id and client_request_id = v_key
    limit 1;
    if found then
      return v_row;
    end if;
  end if;

  insert into public.child_badges (
    id, family_id, child_id, badge_id, awarded_by, source_entity_type,
    source_entity_id, note, awarded_at, client_request_id
  )
  values (
    v_id, v_family_id, v_child_id, v_badge_id, auth.uid(), null,
    null, nullif(p_child_badge ->> 'note', ''),
    coalesce(nullif(p_child_badge ->> 'awarded_at', '')::timestamptz, now()),
    v_key
  )
  on conflict (family_id, child_id, badge_id) do update set
    note = coalesce(excluded.note, public.child_badges.note),
    client_request_id = coalesce(public.child_badges.client_request_id, excluded.client_request_id)
  returning * into v_row;

  if v_badge.reward_stars > 0 then
    v_star_key := 'badge:' || v_row.id::text || ':stars';
    insert into public.stars (
      family_id, child_id, amount, transaction_type, reason, task_id, share_id,
      dream_id, reversal_of_id, idempotency_key, created_by
    )
    values (
      v_family_id, v_child_id, v_badge.reward_stars, 'encouragement',
      '獲得徽章：' || v_badge.name, null, null, null, null, v_star_key, auth.uid()
    )
    on conflict (family_id, idempotency_key) where idempotency_key is not null do nothing;
  end if;

  return v_row;
end;
$$;

revoke all on function public.award_child_badge_from_repository(jsonb) from public;
grant execute on function public.award_child_badge_from_repository(jsonb) to authenticated;

alter table public.encouragement_cards
  add column if not exists sender_user_id uuid,
  add column if not exists sender_role text,
  add column if not exists card_type text,
  add column if not exists template_key text,
  add column if not exists media_id uuid references public.media_assets(id) on delete set null,
  add column if not exists media_bucket text,
  add column if not exists media_path text,
  add column if not exists media_mime_type text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists client_request_id text;

alter table public.encouragement_cards
  drop constraint if exists encouragement_cards_status_check;

alter table public.encouragement_cards
  add constraint encouragement_cards_status_check
  check (status in ('draft', 'scheduled', 'sent', 'opened', 'archived', 'cancelled'));

create unique index if not exists uq_encouragement_cards_request
  on public.encouragement_cards(family_id, child_id, client_request_id)
  where client_request_id is not null;

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
  v_id uuid := nullif(p_message ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_message ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_message ->> 'child_id', '')::uuid;
  v_key text := nullif(p_message ->> 'client_request_id', '');
  v_media_id uuid := nullif(p_message ->> 'media_id', '')::uuid;
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

  insert into public.encouragement_cards (
    id, family_id, child_id, title, message, status, sent_at, opened_at,
    created_by, sender_user_id, sender_role, card_type, template_key,
    media_id, media_bucket, media_path, media_mime_type, scheduled_at,
    archived_at, client_request_id, created_at, updated_at
  )
  values (
    v_id, v_family_id, v_child_id,
    nullif(p_message ->> 'title', ''),
    nullif(p_message ->> 'message', ''),
    coalesce(nullif(p_message ->> 'status', ''), 'sent'),
    nullif(p_message ->> 'sent_at', '')::timestamptz,
    nullif(p_message ->> 'opened_at', '')::timestamptz,
    coalesce(nullif(p_message ->> 'created_by', '')::uuid, auth.uid()),
    coalesce(nullif(p_message ->> 'sender_user_id', '')::uuid, auth.uid()),
    coalesce(nullif(p_message ->> 'sender_role', ''), case when auth.uid() is null then 'child' else 'parent' end),
    coalesce(nullif(p_message ->> 'card_type', ''), 'text'),
    nullif(p_message ->> 'template_key', ''),
    v_media_id,
    nullif(p_message ->> 'media_bucket', ''),
    nullif(p_message ->> 'media_path', ''),
    nullif(p_message ->> 'media_mime_type', ''),
    nullif(p_message ->> 'scheduled_at', '')::timestamptz,
    nullif(p_message ->> 'archived_at', '')::timestamptz,
    v_key,
    coalesce(nullif(p_message ->> 'created_at', '')::timestamptz, now()),
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

  return v_row;
end;
$$;

revoke all on function public.upsert_mailbox_message_from_repository(jsonb, text, uuid) from public;
grant execute on function public.upsert_mailbox_message_from_repository(jsonb, text, uuid) to anon, authenticated;
