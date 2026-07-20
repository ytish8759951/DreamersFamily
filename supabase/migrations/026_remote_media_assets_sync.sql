-- Remote media metadata and child-session scoped private Storage access.
-- Keeps family-media private while allowing only verified child device bindings
-- to access objects under family_id/child_id paths.

alter table public.media_assets
  drop constraint if exists media_assets_entity_type_check;

alter table public.media_assets
  add constraint media_assets_entity_type_check
  check (
    entity_type is null
    or entity_type in (
      'growth_record',
      'encouragement_card',
      'album_entry',
      'comment',
      'artifact',
      'special_event',
      'wish',
      'achievement_message',
      'share',
      'dream',
      'mailbox',
      'special-day',
      'avatar',
      'memory',
      'piggy-product',
      'task'
    )
  );

alter table public.media_assets
  drop constraint if exists media_assets_media_kind_check;

alter table public.media_assets
  add constraint media_assets_media_kind_check
  check (media_kind in ('photo', 'audio', 'video', 'document', 'image'));

create index if not exists idx_media_assets_id_family_child
  on public.media_assets(id, family_id, child_id);

grant select, insert, update, delete on public.media_assets to anon, authenticated;

create or replace function public.request_header(header_name text)
returns text
language sql
stable
as $$
  select nullif(coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb) ->> lower(header_name), '');
$$;

create or replace function public.is_verified_child_media_request(target_family_id uuid, target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.device_bindings as binding_row
    where binding_row.family_id = target_family_id
      and binding_row.child_id = target_child_id
      and binding_row.child_id = nullif(public.request_header('x-child-id'), '')::uuid
      and binding_row.device_id = nullif(public.request_header('x-child-device-id'), '')::uuid
      and binding_row.id = public.request_header('x-child-device-binding-id')
      and binding_row.binding_status = 'bound'
      and coalesce(binding_row.device_binding_status, 'active') = 'active'
      and binding_row.revoked_at is null
      and binding_row.replaced_at is null
      and (binding_row.expires_at is null or binding_row.expires_at > now())
  );
$$;

revoke all on function public.request_header(text) from public;
revoke all on function public.is_verified_child_media_request(uuid, uuid) from public;
grant execute on function public.request_header(text) to anon, authenticated;
grant execute on function public.is_verified_child_media_request(uuid, uuid) to anon, authenticated;

drop policy if exists media_assets_family_member_read on public.media_assets;
drop policy if exists media_assets_family_member_write on public.media_assets;
drop policy if exists media_assets_verified_child_read on public.media_assets;
drop policy if exists media_assets_verified_child_write on public.media_assets;
drop policy if exists media_assets_verified_child_update on public.media_assets;
drop policy if exists media_assets_verified_child_delete on public.media_assets;

create policy media_assets_family_member_read
on public.media_assets for select
to authenticated
using (public.is_family_member(family_id));

create policy media_assets_family_member_write
on public.media_assets for all
to authenticated
using (public.can_write_family(family_id))
with check (public.can_write_family(family_id));

create policy media_assets_verified_child_read
on public.media_assets for select
to anon, authenticated
using (
  child_id is not null
  and public.is_verified_child_media_request(family_id, child_id)
);

create policy media_assets_verified_child_write
on public.media_assets for insert
to anon, authenticated
with check (
  child_id is not null
  and public.is_verified_child_media_request(family_id, child_id)
);

create policy media_assets_verified_child_update
on public.media_assets for update
to anon, authenticated
using (
  child_id is not null
  and public.is_verified_child_media_request(family_id, child_id)
)
with check (
  child_id is not null
  and public.is_verified_child_media_request(family_id, child_id)
);

create policy media_assets_verified_child_delete
on public.media_assets for delete
to anon, authenticated
using (
  child_id is not null
  and public.is_verified_child_media_request(family_id, child_id)
);

drop policy if exists family_media_verified_child_select on storage.objects;
drop policy if exists family_media_verified_child_insert on storage.objects;
drop policy if exists family_media_verified_child_update on storage.objects;
drop policy if exists family_media_verified_child_delete on storage.objects;

create policy family_media_verified_child_select
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'family-media'
  and public.is_verified_child_media_request(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);

create policy family_media_verified_child_insert
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'family-media'
  and public.is_verified_child_media_request(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);

create policy family_media_verified_child_update
on storage.objects for update
to anon, authenticated
using (
  bucket_id = 'family-media'
  and public.is_verified_child_media_request(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
)
with check (
  bucket_id = 'family-media'
  and public.is_verified_child_media_request(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);

create policy family_media_verified_child_delete
on storage.objects for delete
to anon, authenticated
using (
  bucket_id = 'family-media'
  and public.is_verified_child_media_request(
    ((storage.foldername(name))[1])::uuid,
    ((storage.foldername(name))[2])::uuid
  )
);
