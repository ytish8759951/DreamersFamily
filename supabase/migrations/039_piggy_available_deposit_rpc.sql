-- Little Dreamers Family
-- Piggy-bank available-funds flow: parent income only adds available money;
-- child coin deposit atomically moves available money into savings.

alter table public.share_media
  add column if not exists media_asset_id uuid references public.media_assets(id) on delete set null;

update public.share_media as sm
set media_asset_id = sm.id
where sm.media_asset_id is null
  and exists (
    select 1
    from public.media_assets ma
    where ma.id = sm.id
  );

create or replace function public.create_share_from_repository(
  p_share jsonb,
  p_media jsonb default '[]'::jsonb,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.shares%rowtype;
  v_id uuid := nullif(p_share ->> 'id', '')::uuid;
  v_family_id uuid := nullif(p_share ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_share ->> 'child_id', '')::uuid;
  v_key text := coalesce(nullif(p_share ->> 'client_request_id', ''), 'share:create:' || v_id::text);
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_now timestamptz := now();
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_id is null or v_key is null then
    raise exception 'Share id and client_request_id are required' using errcode = '22023';
  end if;

  select * into v_share
  from public.shares
  where family_id = v_family_id and child_id = v_child_id and client_request_id = v_key
  limit 1;
  if found then
    return jsonb_build_object(
      'share', to_jsonb(v_share),
      'share_media', coalesce((select jsonb_agg(to_jsonb(sm) order by sm.sort_order) from public.share_media sm where sm.share_id = v_share.id), '[]'::jsonb)
    );
  end if;

  insert into public.shares (
    id, family_id, child_id, title, caption, share_type, source_type, status,
    submitted_at, reviewed_by, reviewed_at, rejection_reason, published_at,
    created_by_user_id, created_by_device_id, client_request_id, created_at, updated_at, deleted_at
  )
  values (
    v_id, v_family_id, v_child_id, nullif(p_share ->> 'title', ''), nullif(p_share ->> 'caption', ''),
    coalesce(nullif(p_share ->> 'share_type', ''), 'text'),
    case when public.can_write_family(v_family_id) then coalesce(nullif(p_share ->> 'source_type', ''), 'parent') else 'system' end,
    case when public.can_write_family(v_family_id) then coalesce(nullif(p_share ->> 'status', ''), 'pending_review') else 'pending_review' end,
    coalesce(nullif(p_share ->> 'submitted_at', '')::timestamptz, v_now),
    case when public.can_write_family(v_family_id) then nullif(p_share ->> 'reviewed_by', '')::uuid else null end,
    case when public.can_write_family(v_family_id) then nullif(p_share ->> 'reviewed_at', '')::timestamptz else null end,
    nullif(p_share ->> 'rejection_reason', ''),
    case when public.can_write_family(v_family_id) then nullif(p_share ->> 'published_at', '')::timestamptz else null end,
    case when public.can_write_family(v_family_id) then auth.uid() else null end,
    null,
    v_key,
    coalesce(nullif(p_share ->> 'created_at', '')::timestamptz, v_now),
    coalesce(nullif(p_share ->> 'updated_at', '')::timestamptz, v_now),
    nullif(p_share ->> 'deleted_at', '')::timestamptz
  )
  returning * into v_share;

  insert into public.share_media (
    id, media_asset_id, family_id, child_id, share_id, media_type, bucket, storage_path, mime_type,
    file_size_bytes, width, height, duration_seconds, thumbnail_path, sort_order, created_at
  )
  select
    nullif(item ->> 'id', '')::uuid,
    coalesce(nullif(item ->> 'media_asset_id', '')::uuid, nullif(item ->> 'id', '')::uuid),
    v_family_id,
    v_child_id,
    v_share.id,
    item ->> 'media_type',
    coalesce(nullif(item ->> 'bucket', ''), 'family-media'),
    item ->> 'storage_path',
    item ->> 'mime_type',
    coalesce(nullif(item ->> 'file_size_bytes', '')::bigint, 0),
    nullif(item ->> 'width', '')::integer,
    nullif(item ->> 'height', '')::integer,
    nullif(item ->> 'duration_seconds', '')::numeric,
    nullif(item ->> 'thumbnail_path', ''),
    coalesce(nullif(item ->> 'sort_order', '')::smallint, ordinality::smallint - 1),
    coalesce(nullif(item ->> 'created_at', '')::timestamptz, v_now)
  from jsonb_array_elements(v_media) with ordinality as media(item, ordinality);

  update public.media_assets
  set entity_type = 'share',
      entity_id = v_share.id,
      purpose = coalesce(purpose, 'content')
  where family_id = v_family_id
    and child_id = v_child_id
    and id in (
      select coalesce(nullif(item ->> 'media_asset_id', '')::uuid, nullif(item ->> 'id', '')::uuid)
      from jsonb_array_elements(v_media) as media(item)
    );

  return jsonb_build_object(
    'share', to_jsonb(v_share),
    'share_media', coalesce((select jsonb_agg(to_jsonb(sm) order by sm.sort_order) from public.share_media sm where sm.share_id = v_share.id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_share_from_repository(jsonb, jsonb, text, uuid) from public;
grant execute on function public.create_share_from_repository(jsonb, jsonb, text, uuid) to anon, authenticated;

create or replace function public.create_piggy_income_from_repository(
  p_income jsonb,
  p_device_binding_id text default null,
  p_device_id uuid default null
)
returns public.piggy_bank_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.piggy_bank_records%rowtype;
  v_family_id uuid := nullif(p_income ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_income ->> 'child_id', '')::uuid;
  v_income_id uuid := nullif(p_income ->> 'id', '')::uuid;
  v_key text := nullif(p_income ->> 'client_request_id', '');
  v_amount numeric := coalesce(nullif(p_income ->> 'amount', '')::numeric, 0);
  v_remaining numeric := coalesce(nullif(p_income #>> '{payload,income,remaining_amount}', '')::numeric, v_amount);
  v_source text := coalesce(nullif(p_income ->> 'note', ''), p_income #>> '{payload,income,source}', '收入');
  v_created_at timestamptz := coalesce(nullif(p_income ->> 'created_at', '')::timestamptz, now());
  v_payload jsonb := coalesce(p_income -> 'payload', jsonb_build_object('kind', 'income', 'income', p_income));
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_income_id is null or v_amount <= 0 then
    raise exception 'Income id and positive amount are required' using errcode = '22023';
  end if;
  if v_remaining < 0 or v_remaining > v_amount then
    raise exception 'Income remaining amount is invalid' using errcode = '22023';
  end if;

  if v_key is not null then
    select * into v_row
    from public.piggy_bank_records
    where family_id = v_family_id
      and child_id = v_child_id
      and client_request_id = v_key
    limit 1;
    if found then
      return v_row;
    end if;
  end if;

  v_payload := jsonb_set(v_payload, '{income,remaining_amount}', to_jsonb(v_remaining), true);

  insert into public.piggy_bank_records (
    id, family_id, child_id, amount, record_type, note, payload,
    client_request_id, product_id, purchase_id, created_at
  )
  values (
    v_income_id, v_family_id, v_child_id, v_amount, 'income', v_source,
    v_payload, v_key, null, null, v_created_at
  )
  on conflict (family_id, child_id, client_request_id) where client_request_id is not null do update
  set payload = public.piggy_bank_records.payload
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_piggy_income_from_repository(jsonb, text, uuid) from public;
grant execute on function public.create_piggy_income_from_repository(jsonb, text, uuid) to anon, authenticated;

create or replace function public.deposit_piggy_coin_from_repository(
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
  v_existing public.piggy_bank_records%rowtype;
  v_income public.piggy_bank_records%rowtype;
  v_family_id uuid := nullif(p_deposit ->> 'family_id', '')::uuid;
  v_child_id uuid := nullif(p_deposit ->> 'child_id', '')::uuid;
  v_deposit_id uuid := nullif(p_deposit ->> 'id', '')::uuid;
  v_key text := nullif(p_deposit ->> 'client_request_id', '');
  v_amount numeric := coalesce(nullif(p_deposit ->> 'amount', '')::numeric, 0);
  v_available_before numeric := 0;
  v_available_after numeric := 0;
  v_savings_before numeric := 0;
  v_savings_after numeric := 0;
  v_remaining_to_use numeric := 0;
  v_income_remaining numeric := 0;
  v_used numeric := 0;
  v_inserted boolean := false;
  v_has_existing boolean := false;
begin
  perform public._assert_piggy_access(v_family_id, v_child_id, p_device_binding_id, p_device_id);
  if v_deposit_id is null or v_key is null or v_amount <= 0 then
    raise exception 'Deposit id, client request id and positive amount are required' using errcode = '22023';
  end if;

  insert into public.piggy_banks (family_id, child_id, balance, currency, updated_at)
  values (v_family_id, v_child_id, 0, 'TWD', now())
  on conflict (family_id, child_id) do nothing;

  perform 1
  from public.piggy_banks
  where family_id = v_family_id and child_id = v_child_id
  for update;

  select * into v_existing
  from public.piggy_bank_records
  where family_id = v_family_id
    and child_id = v_child_id
    and client_request_id = v_key
  limit 1;
  v_has_existing := found;

  select coalesce(sum(coalesce(nullif(payload #>> '{income,remaining_amount}', '')::numeric, 0)), 0)
    into v_available_before
  from public.piggy_bank_records
  where family_id = v_family_id
    and child_id = v_child_id
    and record_type = 'income';

  select coalesce(sum(
    case
      when record_type in ('coin_deposit', 'purchase_refund') then amount
      when record_type = 'purchase_debit' then -amount
      else 0
    end
  ), 0)
    into v_savings_before
  from public.piggy_bank_records
  where family_id = v_family_id
    and child_id = v_child_id;

  if v_has_existing then
    return jsonb_build_object(
      'deposit_id', v_existing.id,
      'client_request_id', v_existing.client_request_id,
      'available_before', v_available_before,
      'available_after', v_available_before,
      'savings_before', v_savings_before,
      'savings_after', v_savings_before,
      'idempotent', true
    );
  end if;

  if v_available_before < v_amount then
    raise exception 'Piggy deposit exceeds available income' using errcode = '22003';
  end if;

  v_remaining_to_use := v_amount;
  for v_income in
    select *
    from public.piggy_bank_records
    where family_id = v_family_id
      and child_id = v_child_id
      and record_type = 'income'
      and coalesce(nullif(payload #>> '{income,remaining_amount}', '')::numeric, 0) > 0
    order by created_at, id
    for update
  loop
    exit when v_remaining_to_use <= 0;
    v_income_remaining := coalesce(nullif(v_income.payload #>> '{income,remaining_amount}', '')::numeric, 0);
    v_used := least(v_income_remaining, v_remaining_to_use);
    update public.piggy_bank_records
    set payload = jsonb_set(
        payload,
        '{income,remaining_amount}',
        to_jsonb(v_income_remaining - v_used),
        true
      )
    where id = v_income.id;
    v_remaining_to_use := v_remaining_to_use - v_used;
  end loop;

  if v_remaining_to_use <> 0 then
    raise exception 'Piggy deposit allocation failed' using errcode = '40001';
  end if;

  insert into public.piggy_bank_records (
    id, family_id, child_id, amount, record_type, note, payload,
    client_request_id, product_id, purchase_id, created_at
  )
  values (
    v_deposit_id, v_family_id, v_child_id, v_amount, 'coin_deposit',
    nullif(p_deposit ->> 'note', ''),
    coalesce(p_deposit -> 'payload', jsonb_build_object('kind', 'bank_log', 'bank_log', p_deposit)),
    v_key, null, null,
    coalesce(nullif(p_deposit ->> 'created_at', '')::timestamptz, now())
  )
  on conflict (family_id, child_id, client_request_id) where client_request_id is not null do nothing;

  v_inserted := found;

  if v_inserted then
    update public.piggy_banks
    set balance = balance + v_amount,
        updated_at = now()
    where family_id = v_family_id and child_id = v_child_id;
  end if;

  v_available_after := v_available_before - v_amount;
  v_savings_after := v_savings_before + v_amount;

  return jsonb_build_object(
    'deposit_id', v_deposit_id,
    'client_request_id', v_key,
    'available_before', v_available_before,
    'available_after', v_available_after,
    'savings_before', v_savings_before,
    'savings_after', v_savings_after,
    'idempotent', false
  );
end;
$$;

revoke all on function public.deposit_piggy_coin_from_repository(jsonb, text, uuid) from public;
grant execute on function public.deposit_piggy_coin_from_repository(jsonb, text, uuid) to anon, authenticated;
