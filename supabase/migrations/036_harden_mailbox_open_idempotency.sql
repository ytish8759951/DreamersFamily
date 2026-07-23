-- Preserve parent-owned required fields when a child device updates an existing
-- mailbox message, such as marking it opened. Without this, the excluded row
-- built for ON CONFLICT can violate encouragement_cards.created_by not-null
-- before the update branch runs.

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
    coalesce(nullif(p_message ->> 'sent_at', '')::timestamptz, v_existing.sent_at),
    coalesce(nullif(p_message ->> 'opened_at', '')::timestamptz, v_existing.opened_at),
    coalesce(nullif(p_message ->> 'created_by', '')::uuid, v_existing.created_by, auth.uid()),
    coalesce(nullif(p_message ->> 'sender_user_id', '')::uuid, v_existing.sender_user_id, auth.uid()),
    coalesce(nullif(p_message ->> 'sender_role', ''), v_existing.sender_role, case when auth.uid() is null then 'child' else 'parent' end),
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

  return v_row;
end;
$$;

revoke all on function public.upsert_mailbox_message_from_repository(jsonb, text, uuid) from public;
grant execute on function public.upsert_mailbox_message_from_repository(jsonb, text, uuid) to anon, authenticated;
