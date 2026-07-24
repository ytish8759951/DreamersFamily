-- Little Dreamers Family
-- Keep child interaction notifications compatible with notifications.body NOT NULL.

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
    coalesce(nullif(p_title, ''), '家長有新的互動'),
    coalesce(p_body, ''),
    p_category,
    p_entity_id,
    p_dedupe_key
  );
  return v_notification;
end;
$$;
