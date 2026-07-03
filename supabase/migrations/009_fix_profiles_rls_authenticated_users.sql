-- Allow authenticated users to create, read, and update their own profile row.
-- profiles uses id = auth.users.id as the ownership key in the current schema.

drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_select_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;

create policy "profiles_insert_self"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "profiles_select_self"
on public.profiles
for select
using (auth.uid() = id);

create policy "profiles_update_self"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);
