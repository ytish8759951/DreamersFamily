-- Little Dreamers Family
-- Drawing shares reuse formal shares/share_media/media_assets and notify parents once.

alter table public.shares
  drop constraint if exists shares_type_check;

alter table public.shares
  add constraint shares_type_check
  check (share_type in ('text', 'photo', 'audio', 'video', 'drawing', 'mixed'));

create or replace function public._notify_parent_share_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child_name text;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if new.family_id is null or new.child_id is null then
    return new;
  end if;
  if new.created_by_user_id is not null or new.source_type = 'parent' then
    return new;
  end if;

  select display_name
  into v_child_name
  from public.children
  where id = new.child_id and family_id = new.family_id
  limit 1;

  perform public._insert_repository_notification(
    new.family_id,
    new.child_id,
    'parent',
    'share_submitted',
    coalesce(v_child_name, '孩子') || '送出了一個分享',
    case
      when new.share_type = 'drawing' then coalesce(nullif(new.title, ''), '新的畫作分享')
      when new.share_type = 'photo' then coalesce(nullif(new.title, ''), '新的照片分享')
      when new.share_type = 'audio' then coalesce(nullif(new.title, ''), '新的語音分享')
      when new.share_type = 'video' then coalesce(nullif(new.title, ''), '新的影片分享')
      else coalesce(nullif(new.title, ''), nullif(new.caption, ''), '新的分享')
    end,
    'share',
    new.id,
    'share:' || new.id::text || ':submitted:parent'
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_parent_share_submitted on public.shares;
create trigger trg_notify_parent_share_submitted
after insert on public.shares
for each row execute function public._notify_parent_share_submitted();
