-- 小小夢想家 Family - RLS policy draft
-- Phase 1 planning artifact. Review before applying to Supabase.
--
-- Parent sessions use Supabase Auth user JWTs.
-- Child tablet sessions are expected to use controlled JWT claims:
--   child_id: uuid
--   child_device_id: uuid
--
-- Service role bypasses RLS and is used for push delivery, audit writes,
-- background cleanup, scheduled jobs, and trusted server-side automation.

create or replace function public.current_child_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'child_id', '')::uuid;
$$;

create or replace function public.current_child_device_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'child_device_id', '')::uuid;
$$;

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function public.has_family_role(target_family_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
      and fm.role = any(allowed_roles)
  );
$$;

create or replace function public.can_write_family(target_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_family_role(target_family_id, array['owner', 'admin', 'guardian']);
$$;

create or replace function public.is_child_device_for_family(target_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.child_devices cd
    where cd.id = public.current_child_device_id()
      and cd.child_id = public.current_child_id()
      and cd.family_id = target_family_id
      and cd.status = 'active'
  );
$$;

create or replace function public.is_current_child(target_child_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.child_devices cd
    where cd.id = public.current_child_device_id()
      and cd.child_id = target_child_id
      and cd.child_id = public.current_child_id()
      and cd.status = 'active'
  );
$$;

drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_select_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;

create policy "profiles_insert_self"
on public.profiles for insert
with check (id = auth.uid());

create policy "profiles_select_self"
on public.profiles for select
using (id = auth.uid());

create policy "profiles_update_self"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "families_select_member_or_child_device"
on public.families for select
using (
  public.is_family_member(id)
  or public.is_child_device_for_family(id)
);

create policy "families_insert_authenticated"
on public.families for insert
with check (owner_id = auth.uid());

create policy "families_update_admin"
on public.families for update
using (public.has_family_role(id, array['owner', 'admin']))
with check (public.has_family_role(id, array['owner', 'admin']));

create policy "family_members_select_member"
on public.family_members for select
using (public.is_family_member(family_id));

create policy "family_members_manage_admin"
on public.family_members for all
using (public.has_family_role(family_id, array['owner', 'admin']))
with check (public.has_family_role(family_id, array['owner', 'admin']));

create policy "children_select_parent_or_self"
on public.children for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(id)
);

create policy "children_write_guardian"
on public.children for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "child_devices_select_parent_or_own_device"
on public.child_devices for select
using (
  public.is_family_member(family_id)
  or (id = public.current_child_device_id() and child_id = public.current_child_id() and status = 'active')
);

create policy "child_devices_manage_parent"
on public.child_devices for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "growth_categories_select_parent_or_child"
on public.growth_categories for select
using (
  is_system = true
  or public.is_family_member(family_id)
  or public.is_child_device_for_family(family_id)
);

create policy "growth_categories_write_family"
on public.growth_categories for all
using (family_id is not null and public.can_write_family(family_id))
with check (family_id is not null and public.can_write_family(family_id));

create policy "growth_records_select_parent_or_self"
on public.growth_records for select
using (
  (
    public.is_family_member(family_id)
    and (
      visibility = 'family'
      or public.has_family_role(family_id, array['owner', 'admin', 'guardian'])
    )
  )
  or (
    public.is_current_child(child_id)
    and public.is_child_device_for_family(family_id)
  )
);

create policy "growth_records_insert_parent"
on public.growth_records for insert
with check (public.can_write_family(family_id) and created_by = auth.uid());

create policy "growth_records_insert_child_share"
on public.growth_records for insert
with check (
  public.is_current_child(child_id)
  and public.is_child_device_for_family(family_id)
  and source_type = 'child_device'
  and source_child_device_id = public.current_child_device_id()
  and created_by is null
  and record_type in ('album', 'memory', 'growth')
);

create policy "growth_records_update_parent"
on public.growth_records for update
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "growth_records_delete_parent_or_author"
on public.growth_records for delete
using (
  created_by = auth.uid()
  or public.has_family_role(family_id, array['owner', 'admin'])
);

create policy "growth_measurements_select_parent_or_self"
on public.growth_measurements for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "growth_measurements_write_guardian"
on public.growth_measurements for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "milestones_select_parent_or_child"
on public.milestones for select
using (
  is_system = true
  or public.is_family_member(family_id)
  or public.is_child_device_for_family(family_id)
);

create policy "milestones_write_family"
on public.milestones for all
using (family_id is not null and public.can_write_family(family_id))
with check (family_id is not null and public.can_write_family(family_id));

create policy "child_milestones_select_parent_or_self"
on public.child_milestones for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "child_milestones_write_guardian"
on public.child_milestones for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "media_assets_select_parent_or_self"
on public.media_assets for select
using (
  public.is_family_member(family_id)
  or (
    child_id = public.current_child_id()
    and public.is_child_device_for_family(family_id)
  )
);

create policy "media_assets_insert_parent"
on public.media_assets for insert
with check (
  public.can_write_family(family_id)
  and uploaded_by = auth.uid()
  and uploaded_by_child_id is null
  and uploaded_by_device_id is null
);

create policy "media_assets_insert_child"
on public.media_assets for insert
with check (
  public.is_current_child(child_id)
  and public.is_child_device_for_family(family_id)
  and uploaded_by is null
  and uploaded_by_child_id = public.current_child_id()
  and uploaded_by_device_id = public.current_child_device_id()
);

create policy "media_assets_update_parent_or_uploader"
on public.media_assets for update
using (
  uploaded_by = auth.uid()
  or public.has_family_role(family_id, array['owner', 'admin', 'guardian'])
)
with check (
  uploaded_by = auth.uid()
  or public.has_family_role(family_id, array['owner', 'admin', 'guardian'])
);

create policy "media_assets_delete_parent_or_uploader"
on public.media_assets for delete
using (
  uploaded_by = auth.uid()
  or public.has_family_role(family_id, array['owner', 'admin', 'guardian'])
);

create policy "artifacts_select_parent_or_self"
on public.artifacts for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "artifacts_write_parent"
on public.artifacts for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "special_events_select_parent_or_self"
on public.special_events for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
  or (child_id is null and public.is_child_device_for_family(family_id))
);

create policy "special_events_write_parent"
on public.special_events for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "encouragement_cards_select_parent_or_recipient_child"
on public.encouragement_cards for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "encouragement_cards_write_parent"
on public.encouragement_cards for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "album_entries_select_parent_or_self"
on public.album_entries for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "album_entries_insert_parent"
on public.album_entries for insert
with check (
  public.can_write_family(family_id)
  and source_type = 'parent'
  and created_by_user_id = auth.uid()
  and created_by_child_device_id is null
);

create policy "album_entries_insert_child"
on public.album_entries for insert
with check (
  public.is_current_child(child_id)
  and public.is_child_device_for_family(family_id)
  and source_type = 'child_device'
  and created_by_user_id is null
  and created_by_child_device_id = public.current_child_device_id()
);

create policy "album_entries_update_parent"
on public.album_entries for update
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "album_entries_delete_parent"
on public.album_entries for delete
using (public.can_write_family(family_id));

create policy "comments_select_parent_or_self"
on public.comments for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "comments_insert_parent"
on public.comments for insert
with check (
  public.can_write_family(family_id)
  and author_type = 'parent'
  and created_by_user_id = auth.uid()
  and created_by_child_device_id is null
);

create policy "comments_insert_child_self"
on public.comments for insert
with check (
  public.is_current_child(child_id)
  and public.is_child_device_for_family(family_id)
  and author_type = 'child_device'
  and created_by_user_id is null
  and created_by_child_device_id = public.current_child_device_id()
);

create policy "comments_update_parent"
on public.comments for update
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "comments_delete_parent"
on public.comments for delete
using (public.can_write_family(family_id));

create policy "badges_select_parent_or_child"
on public.badges for select
using (
  is_system = true
  or public.is_family_member(family_id)
  or public.is_child_device_for_family(family_id)
);

create policy "badges_write_parent"
on public.badges for all
using (family_id is not null and public.can_write_family(family_id))
with check (family_id is not null and public.can_write_family(family_id));

create policy "child_badges_select_parent_or_self"
on public.child_badges for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "child_badges_write_parent"
on public.child_badges for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "wishes_select_parent_or_self"
on public.wishes for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "wishes_write_parent"
on public.wishes for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "wish_stages_select_parent_or_self"
on public.wish_stages for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "wish_stages_write_parent"
on public.wish_stages for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "wish_progress_entries_select_parent_or_self"
on public.wish_progress_entries for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "wish_progress_entries_write_parent"
on public.wish_progress_entries for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "screen_time_select_parent_or_self"
on public.screen_time for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "screen_time_write_parent"
on public.screen_time for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "reward_transactions_select_parent_or_self"
on public.reward_transactions for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "reward_transactions_write_parent"
on public.reward_transactions for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "achievement_messages_select_parent_or_self"
on public.achievement_messages for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
);

create policy "achievement_messages_write_parent"
on public.achievement_messages for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "reminders_select_parent_or_self"
on public.reminders for select
using (
  public.is_family_member(family_id)
  or public.is_current_child(child_id)
  or (child_id is null and public.is_child_device_for_family(family_id))
);

create policy "reminders_write_parent"
on public.reminders for all
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy "device_tokens_parent_self_or_child_device_select"
on public.device_tokens for select
using (
  user_id = auth.uid()
  or (
    child_id = public.current_child_id()
    and child_device_id = public.current_child_device_id()
    and public.is_current_child(child_id)
  )
);

create policy "device_tokens_parent_self_insert"
on public.device_tokens for insert
with check (
  device_role = 'parent_device'
  and user_id = auth.uid()
  and child_id is null
  and child_device_id is null
);

create policy "device_tokens_child_device_insert"
on public.device_tokens for insert
with check (
  device_role = 'child_tablet'
  and user_id is null
  and child_id = public.current_child_id()
  and child_device_id = public.current_child_device_id()
  and public.is_current_child(child_id)
);

create policy "device_tokens_parent_self_update"
on public.device_tokens for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "device_tokens_child_device_update"
on public.device_tokens for update
using (
  child_id = public.current_child_id()
  and child_device_id = public.current_child_device_id()
  and public.is_current_child(child_id)
)
with check (
  child_id = public.current_child_id()
  and child_device_id = public.current_child_device_id()
  and public.is_current_child(child_id)
);

create policy "device_tokens_self_delete"
on public.device_tokens for delete
using (
  user_id = auth.uid()
  or (
    child_id = public.current_child_id()
    and child_device_id = public.current_child_device_id()
    and public.is_current_child(child_id)
  )
);

create policy "notification_preferences_parent_or_child_select"
on public.notification_preferences for select
using (
  (user_id = auth.uid() and public.is_family_member(family_id))
  or (child_id = public.current_child_id() and public.is_child_device_for_family(family_id))
);

create policy "notification_preferences_parent_self_write"
on public.notification_preferences for all
using (user_id = auth.uid() and public.is_family_member(family_id))
with check (user_id = auth.uid() and public.is_family_member(family_id));

create policy "notification_preferences_child_self_write"
on public.notification_preferences for all
using (child_id = public.current_child_id() and public.is_child_device_for_family(family_id))
with check (child_id = public.current_child_id() and public.is_child_device_for_family(family_id));

create policy "notification_events_recipient_select"
on public.notification_events for select
using (
  recipient_user_id = auth.uid()
  or (
    recipient_child_id = public.current_child_id()
    and (
      target_device_id is null
      or target_device_id = public.current_child_device_id()
    )
  )
);

create policy "audit_logs_admin_select"
on public.audit_logs for select
using (public.has_family_role(family_id, array['owner', 'admin']));
