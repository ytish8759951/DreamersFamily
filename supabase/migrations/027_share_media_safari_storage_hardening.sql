-- Harden Today's Share media uploads for Safari/iOS MIME variants and
-- explicit private family-media access boundaries.

update storage.buckets
set
  public = false,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'audio/aac',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-m4v'
  ]
where id = 'family-media';

drop policy if exists family_media_family_member_select on storage.objects;
drop policy if exists family_media_family_member_insert on storage.objects;
drop policy if exists family_media_family_member_update on storage.objects;
drop policy if exists family_media_family_member_delete on storage.objects;

create policy family_media_family_member_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'family-media'
  and public.is_family_member(((storage.foldername(name))[1])::uuid)
);

create policy family_media_family_member_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'family-media'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
);

create policy family_media_family_member_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'family-media'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'family-media'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
);

create policy family_media_family_member_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'family-media'
  and public.can_write_family(((storage.foldername(name))[1])::uuid)
);
