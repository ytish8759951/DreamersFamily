-- Ensure child-route device binding sync can write the repository table.
-- The table intentionally uses binding_status/qr_token_status instead of revoked_at.

alter table public.device_bindings enable row level security;

grant select, insert, update, delete on public.device_bindings to anon, authenticated;

drop policy if exists device_bindings_repository_sync_all on public.device_bindings;
create policy device_bindings_repository_sync_all
on public.device_bindings
for all
using (true)
with check (true);
