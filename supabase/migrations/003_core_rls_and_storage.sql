-- Little Dreamers Family
-- Core RLS policies and private Storage configuration.
-- Depends on: 001_initial_schema.sql and 002_core_product_schema.sql

-- ---------------------------------------------------------------------------
-- JWT and family authorization helpers.
-- Child-device JWTs must contain child_id and child_device_id claims.
-- ---------------------------------------------------------------------------

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
stable
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

create or replace function public.has_family_role(
  target_family_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
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
stable
security definer
set search_path = public
as $$
  select public.has_family_role(
    target_family_id,
    array['owner', 'admin', 'guardian']
  );
$$;

create or replace function public.is_child_device_for_family(target_family_id uuid)
returns boolean
language sql
stable
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
stable
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

revoke all on function public.current_child_id() from public;
revoke all on function public.current_child_device_id() from public;
revoke all on function public.is_family_member(uuid) from public;
revoke all on function public.has_family_role(uuid, text[]) from public;
revoke all on function public.can_write_family(uuid) from public;
revoke all on function public.is_child_device_for_family(uuid) from public;
revoke all on function public.is_current_child(uuid) from public;

grant execute on function public.current_child_id() to authenticated;
grant execute on function public.current_child_device_id() to authenticated;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.has_family_role(uuid, text[]) to authenticated;
grant execute on function public.can_write_family(uuid) to authenticated;
grant execute on function public.is_child_device_for_family(uuid) to authenticated;
grant execute on function public.is_current_child(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Drop only policies owned by this migration, making local resets repeatable.
-- ---------------------------------------------------------------------------

drop policy if exists core_children_select on public.children;
drop policy if exists core_children_insert on public.children;
drop policy if exists core_children_update on public.children;
drop policy if exists core_children_delete on public.children;

drop policy if exists core_tasks_select on public.tasks;
drop policy if exists core_tasks_insert_parent on public.tasks;
drop policy if exists core_tasks_update_parent on public.tasks;
drop policy if exists core_tasks_update_child_submit on public.tasks;
drop policy if exists core_tasks_delete_parent on public.tasks;

drop policy if exists core_stars_select on public.stars;
drop policy if exists core_dreams_select on public.dreams;
drop policy if exists core_dreams_insert_parent on public.dreams;
drop policy if exists core_dreams_insert_child on public.dreams;
drop policy if exists core_dreams_update_parent on public.dreams;
drop policy if exists core_dreams_delete_parent on public.dreams;
drop policy if exists core_dream_funds_select on public.dream_funds;

drop policy if exists core_shares_select on public.shares;
drop policy if exists core_shares_insert_parent on public.shares;
drop policy if exists core_shares_insert_child on public.shares;
drop policy if exists core_shares_update_parent on public.shares;
drop policy if exists core_shares_update_child_draft on public.shares;
drop policy if exists core_shares_delete_parent on public.shares;

drop policy if exists core_share_media_select on public.share_media;
drop policy if exists core_share_media_insert_parent on public.share_media;
drop policy if exists core_share_media_insert_child on public.share_media;
drop policy if exists core_share_media_delete_parent on public.share_media;
drop policy if exists core_share_media_delete_child_draft on public.share_media;

drop policy if exists core_cards_select on public.encouragement_cards;
drop policy if exists core_cards_insert_parent on public.encouragement_cards;
drop policy if exists core_cards_update_parent on public.encouragement_cards;
drop policy if exists core_cards_update_child_open on public.encouragement_cards;
drop policy if exists core_cards_delete_parent_draft on public.encouragement_cards;

drop policy if exists core_screen_time_select on public.screen_time_logs;
drop policy if exists core_special_days_select on public.special_days;
drop policy if exists core_special_days_insert on public.special_days;
drop policy if exists core_special_days_update on public.special_days;
drop policy if exists core_special_days_delete on public.special_days;
drop policy if exists core_notifications_select on public.notifications;
drop policy if exists core_notifications_update_user_read on public.notifications;
drop policy if exists core_notifications_update_child_read on public.notifications;

-- children
create policy core_children_select
on public.children for select
to authenticated
using (
  public.is_family_member(family_id)
  or (
    public.is_child_device_for_family(family_id)
    and public.is_current_child(id)
  )
);

create policy core_children_insert
on public.children for insert
to authenticated
with check (
  public.has_family_role(family_id, array['owner', 'admin', 'guardian'])
  and created_by = auth.uid()
);

create policy core_children_update
on public.children for update
to authenticated
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy core_children_delete
on public.children for delete
to authenticated
using (public.has_family_role(family_id, array['owner', 'admin']));

-- tasks
create policy core_tasks_select
on public.tasks for select
to authenticated
using (
  public.is_family_member(family_id)
  or (
    public.is_child_device_for_family(family_id)
    and public.is_current_child(child_id)
  )
);

create policy core_tasks_insert_parent
on public.tasks for insert
to authenticated
with check (
  public.can_write_family(family_id)
  and created_by = auth.uid()
);

create policy core_tasks_update_parent
on public.tasks for update
to authenticated
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy core_tasks_update_child_submit
on public.tasks for update
to authenticated
using (
  public.is_child_device_for_family(family_id)
  and public.is_current_child(child_id)
  and status = 'pending'
)
with check (
  public.is_child_device_for_family(family_id)
  and public.is_current_child(child_id)
  and status = 'submitted'
  and completed_at is not null
  and reviewed_by is null
  and reviewed_at is null
);

create policy core_tasks_delete_parent
on public.tasks for delete
to authenticated
using (public.has_family_role(family_id, array['owner', 'admin']));

-- immutable ledgers are readable by family members and the current child.
-- Inserts are intentionally omitted: use service-role code or controlled RPCs.
create policy core_stars_select
on public.stars for select
to authenticated
using (
  public.is_family_member(family_id)
  or (
    public.is_child_device_for_family(family_id)
    and public.is_current_child(child_id)
  )
);

create policy core_dream_funds_select
on public.dream_funds for select
to authenticated
using (
  public.is_family_member(family_id)
  or (
    public.is_child_device_for_family(family_id)
    and public.is_current_child(child_id)
  )
);

create policy core_screen_time_select
on public.screen_time_logs for select
to authenticated
using (
  public.is_family_member(family_id)
  or (
    public.is_child_device_for_family(family_id)
    and public.is_current_child(child_id)
  )
);

-- dreams
create policy core_dreams_select
on public.dreams for select
to authenticated
using (
  public.is_family_member(family_id)
  or (
    public.is_child_device_for_family(family_id)
    and public.is_current_child(child_id)
  )
);

create policy core_dreams_insert_parent
on public.dreams for insert
to authenticated
with check (
  public.can_write_family(family_id)
  and created_by = auth.uid()
);

create policy core_dreams_insert_child
on public.dreams for insert
to authenticated
with check (
  public.is_child_device_for_family(family_id)
  and public.is_current_child(child_id)
  and requested_by_child = true
  and status = 'pending_approval'
  and created_by is null
  and approved_by is null
  and approved_at is null
);

create policy core_dreams_update_parent
on public.dreams for update
to authenticated
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy core_dreams_delete_parent
on public.dreams for delete
to authenticated
using (public.has_family_role(family_id, array['owner', 'admin']));

-- shares
create policy core_shares_select
on public.shares for select
to authenticated
using (
  public.is_family_member(family_id)
  or (
    public.is_child_device_for_family(family_id)
    and public.is_current_child(child_id)
  )
);

create policy core_shares_insert_parent
on public.shares for insert
to authenticated
with check (
  public.can_write_family(family_id)
  and source_type = 'parent'
  and created_by_user_id = auth.uid()
  and created_by_device_id is null
);

create policy core_shares_insert_child
on public.shares for insert
to authenticated
with check (
  public.is_child_device_for_family(family_id)
  and public.is_current_child(child_id)
  and source_type = 'child_device'
  and created_by_user_id is null
  and created_by_device_id = public.current_child_device_id()
  and status in ('draft', 'pending_review')
);

create policy core_shares_update_parent
on public.shares for update
to authenticated
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy core_shares_update_child_draft
on public.shares for update
to authenticated
using (
  public.is_child_device_for_family(family_id)
  and public.is_current_child(child_id)
  and created_by_device_id = public.current_child_device_id()
  and status in ('draft', 'rejected')
)
with check (
  public.is_child_device_for_family(family_id)
  and public.is_current_child(child_id)
  and created_by_device_id = public.current_child_device_id()
  and status in ('draft', 'pending_review')
  and reviewed_by is null
  and reviewed_at is null
  and rejection_reason is null
  and published_at is null
);

create policy core_shares_delete_parent
on public.shares for delete
to authenticated
using (public.has_family_role(family_id, array['owner', 'admin']));

-- share media
create policy core_share_media_select
on public.share_media for select
to authenticated
using (
  public.is_family_member(family_id)
  or (
    public.is_child_device_for_family(family_id)
    and public.is_current_child(child_id)
  )
);

create policy core_share_media_insert_parent
on public.share_media for insert
to authenticated
with check (
  public.can_write_family(family_id)
  and exists (
    select 1
    from public.shares s
    where s.id = share_id
      and s.family_id = family_id
      and s.child_id = child_id
      and s.source_type = 'parent'
      and s.created_by_user_id = auth.uid()
  )
);

create policy core_share_media_insert_child
on public.share_media for insert
to authenticated
with check (
  public.is_child_device_for_family(family_id)
  and public.is_current_child(child_id)
  and exists (
    select 1
    from public.shares s
    where s.id = share_id
      and s.family_id = family_id
      and s.child_id = child_id
      and s.created_by_device_id = public.current_child_device_id()
      and s.status in ('draft', 'pending_review')
  )
);

create policy core_share_media_delete_parent
on public.share_media for delete
to authenticated
using (public.can_write_family(family_id));

create policy core_share_media_delete_child_draft
on public.share_media for delete
to authenticated
using (
  public.is_child_device_for_family(family_id)
  and public.is_current_child(child_id)
  and exists (
    select 1
    from public.shares s
    where s.id = share_id
      and s.created_by_device_id = public.current_child_device_id()
      and s.status in ('draft', 'rejected')
  )
);

-- encouragement cards
create policy core_cards_select
on public.encouragement_cards for select
to authenticated
using (
  public.is_family_member(family_id)
  or (
    public.is_child_device_for_family(family_id)
    and public.is_current_child(child_id)
    and status in ('sent', 'opened', 'archived')
  )
);

create policy core_cards_insert_parent
on public.encouragement_cards for insert
to authenticated
with check (
  public.can_write_family(family_id)
  and sender_user_id = auth.uid()
  and created_by = auth.uid()
);

create policy core_cards_update_parent
on public.encouragement_cards for update
to authenticated
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy core_cards_update_child_open
on public.encouragement_cards for update
to authenticated
using (
  public.is_child_device_for_family(family_id)
  and public.is_current_child(child_id)
  and status = 'sent'
)
with check (
  public.is_child_device_for_family(family_id)
  and public.is_current_child(child_id)
  and status = 'opened'
  and opened_at is not null
);

create policy core_cards_delete_parent_draft
on public.encouragement_cards for delete
to authenticated
using (
  public.has_family_role(family_id, array['owner', 'admin'])
  and status in ('draft', 'cancelled')
);

-- special days
create policy core_special_days_select
on public.special_days for select
to authenticated
using (
  public.is_family_member(family_id)
  or (
    public.is_child_device_for_family(family_id)
    and (child_id is null or public.is_current_child(child_id))
  )
);

create policy core_special_days_insert
on public.special_days for insert
to authenticated
with check (
  public.can_write_family(family_id)
  and created_by = auth.uid()
);

create policy core_special_days_update
on public.special_days for update
to authenticated
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy core_special_days_delete
on public.special_days for delete
to authenticated
using (public.has_family_role(family_id, array['owner', 'admin']));

-- notifications are created by trusted backend/service-role code.
create policy core_notifications_select
on public.notifications for select
to authenticated
using (
  recipient_user_id = auth.uid()
  or (
    recipient_child_id = public.current_child_id()
    and public.is_child_device_for_family(family_id)
  )
);

create policy core_notifications_update_user_read
on public.notifications for update
to authenticated
using (recipient_user_id = auth.uid())
with check (
  recipient_user_id = auth.uid()
  and recipient_child_id is null
);

create policy core_notifications_update_child_read
on public.notifications for update
to authenticated
using (
  recipient_child_id = public.current_child_id()
  and public.is_child_device_for_family(family_id)
)
with check (
  recipient_child_id = public.current_child_id()
  and recipient_user_id is null
  and public.is_child_device_for_family(family_id)
);

-- ---------------------------------------------------------------------------
-- Table grants. RLS remains the final authorization boundary.
-- Ledger and notification writes are deliberately reserved for service_role.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.children to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select on public.stars to authenticated;
grant select, insert, update, delete on public.dreams to authenticated;
grant select on public.dream_funds to authenticated;
grant select, insert, update, delete on public.shares to authenticated;
grant select, insert, delete on public.share_media to authenticated;
grant select, insert, update, delete on public.encouragement_cards to authenticated;
grant select on public.screen_time_logs to authenticated;
grant select, insert, update, delete on public.special_days to authenticated;
grant select, update on public.notifications to authenticated;

grant select on public.child_star_balances to authenticated;
grant select on public.dream_fund_balances to authenticated;
grant select on public.child_screen_time_balances to authenticated;

-- ---------------------------------------------------------------------------
-- Private Supabase Storage buckets.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'profile-avatars',
    'profile-avatars',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'child-avatars',
    'child-avatars',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'family-media',
    'family-media',
    false,
    209715200,
    array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'video/mp4',
      'video/quicktime'
    ]
  ),
  (
    'family-documents',
    'family-documents',
    false,
    20971520,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage path conventions:
-- profile-avatars/{user_id}/{asset_id}.{ext}
-- child-avatars/{family_id}/{child_id}/{asset_id}.{ext}
-- family-media/{family_id}/{child_id}/{yyyy}/{mm}/{asset_id}.{ext}
-- family-documents/{family_id}/{child_id}/{document_type}/{asset_id}.{ext}

drop policy if exists core_profile_avatars_select on storage.objects;
drop policy if exists core_profile_avatars_insert on storage.objects;
drop policy if exists core_profile_avatars_update on storage.objects;
drop policy if exists core_profile_avatars_delete on storage.objects;
drop policy if exists core_child_avatars_select on storage.objects;
drop policy if exists core_child_avatars_insert on storage.objects;
drop policy if exists core_child_avatars_update on storage.objects;
drop policy if exists core_child_avatars_delete on storage.objects;
drop policy if exists core_family_media_select on storage.objects;
drop policy if exists core_family_media_insert on storage.objects;
drop policy if exists core_family_media_update on storage.objects;
drop policy if exists core_family_media_delete on storage.objects;
drop policy if exists core_family_documents_select on storage.objects;
drop policy if exists core_family_documents_insert on storage.objects;
drop policy if exists core_family_documents_update on storage.objects;
drop policy if exists core_family_documents_delete on storage.objects;

create policy core_profile_avatars_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy core_profile_avatars_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy core_profile_avatars_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-avatars'
  and owner_id = auth.uid()::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy core_profile_avatars_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and owner_id = auth.uid()::text
);

create policy core_child_avatars_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'child-avatars'
  and (
    public.is_family_member(((storage.foldername(name))[1])::uuid)
    or (
      public.is_child_device_for_family(((storage.foldername(name))[1])::uuid)
      and public.is_current_child(((storage.foldername(name))[2])::uuid)
    )
  )
);

create policy core_child_avatars_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'child-avatars'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
);

create policy core_child_avatars_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'child-avatars'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'child-avatars'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
);

create policy core_child_avatars_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'child-avatars'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
);

create policy core_family_media_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'family-media'
  and (
    public.is_family_member(((storage.foldername(name))[1])::uuid)
    or (
      public.is_child_device_for_family(((storage.foldername(name))[1])::uuid)
      and public.is_current_child(((storage.foldername(name))[2])::uuid)
    )
  )
);

create policy core_family_media_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'family-media'
  and (
    public.can_write_family(((storage.foldername(name))[1])::uuid)
    or (
      public.is_child_device_for_family(((storage.foldername(name))[1])::uuid)
      and public.is_current_child(((storage.foldername(name))[2])::uuid)
    )
  )
);

create policy core_family_media_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'family-media'
  and (
    public.can_write_family(((storage.foldername(name))[1])::uuid)
    or owner_id = auth.uid()::text
  )
)
with check (
  bucket_id = 'family-media'
  and (
    public.can_write_family(((storage.foldername(name))[1])::uuid)
    or (
      public.is_child_device_for_family(((storage.foldername(name))[1])::uuid)
      and public.is_current_child(((storage.foldername(name))[2])::uuid)
    )
  )
);

create policy core_family_media_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'family-media'
  and (
    public.can_write_family(((storage.foldername(name))[1])::uuid)
    or owner_id = auth.uid()::text
  )
);

create policy core_family_documents_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'family-documents'
  and public.is_family_member(((storage.foldername(name))[1])::uuid)
);

create policy core_family_documents_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'family-documents'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
);

create policy core_family_documents_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'family-documents'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'family-documents'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
);

create policy core_family_documents_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'family-documents'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
);
