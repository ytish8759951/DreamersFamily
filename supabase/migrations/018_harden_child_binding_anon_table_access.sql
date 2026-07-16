-- Harden anonymous access after moving child-device binding to the RPC.
-- This removes direct anonymous table privileges without deleting data.

revoke all privileges on table public.device_bindings from anon;
revoke all privileges on table public.children from anon;

grant select, insert, update, delete on public.device_bindings to authenticated;
grant select, insert, update, delete on public.children to authenticated;

drop policy if exists repository_foundation_all on public.device_bindings;
drop policy if exists repository_foundation_all on public.children;

grant execute on function public.bind_child_device_with_token(text, uuid, text) to anon, authenticated;
