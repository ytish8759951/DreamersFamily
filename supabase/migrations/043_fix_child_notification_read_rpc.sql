-- Little Dreamers Family
-- Fix child notification read RPC for the existing notifications schema.

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
  set read_at = coalesce(read_at, now())
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
