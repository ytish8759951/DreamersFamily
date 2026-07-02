-- Little Dreamers Family
-- Repository foundation for Supabase-backed Parent / Child sharing.

create extension if not exists "pgcrypto";

-- MVP anonymous scope used by the client-side SupabaseRepository until auth is
-- introduced. These UUIDs intentionally match apps/web/src/lib/supabaseData.ts.
do $$
begin
  alter table public.profiles drop constraint if exists profiles_id_fkey;
exception
  when undefined_table then null;
end $$;

create table if not exists public.parents (
  id uuid primary key,
  family_id uuid,
  display_name text not null default 'Parent',
  email text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.profiles (id, display_name, timezone, locale)
values ('00000000-0000-4000-8000-000000000002', 'Parent', 'Asia/Taipei', 'zh-TW')
on conflict (id) do update set
  display_name = excluded.display_name,
  updated_at = now();

insert into public.families (id, name, owner_id)
values (
  '00000000-0000-4000-8000-000000000001',
  'Dreamers Family',
  '00000000-0000-4000-8000-000000000002'
)
on conflict (id) do update set
  name = excluded.name,
  owner_id = excluded.owner_id,
  updated_at = now();

insert into public.family_members (family_id, user_id, role, status)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'owner',
  'active'
)
on conflict (family_id, user_id) do update set
  role = excluded.role,
  status = excluded.status;

insert into public.parents (id, family_id, display_name)
values (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'Parent'
)
on conflict (id) do update set
  family_id = excluded.family_id,
  display_name = excluded.display_name,
  updated_at = now();

alter table public.parents
  drop constraint if exists parents_family_id_fkey;

alter table public.parents
  add constraint parents_family_id_fkey
  foreign key (family_id) references public.families(id) on delete cascade;

alter table public.children
  add column if not exists parent_id uuid references public.parents(id) on delete set null,
  add column if not exists birthday date,
  add column if not exists avatar_media_id uuid,
  add column if not exists child_token text,
  add column if not exists child_token_updated_at timestamptz,
  add column if not exists child_token_consumed_at timestamptz,
  add column if not exists binding_status text not null default 'unbound',
  add column if not exists bound_device_id uuid,
  add column if not exists bound_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_login_device text;

update public.children
set
  parent_id = coalesce(parent_id, created_by),
  birthday = coalesce(birthday, birth_date),
  child_token_updated_at = coalesce(child_token_updated_at, created_at),
  binding_status = coalesce(binding_status, 'unbound')
where family_id = '00000000-0000-4000-8000-000000000001';

alter table public.children
  drop constraint if exists children_binding_status_check;

alter table public.children
  add constraint children_binding_status_check
  check (binding_status in ('unbound', 'bound'));

create unique index if not exists uq_children_child_token_active
  on public.children(child_token)
  where child_token is not null and child_token_consumed_at is null;

create index if not exists idx_children_family_parent
  on public.children(family_id, parent_id, status);

create table if not exists public.device_bindings (
  id text primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  device_id uuid not null,
  last_login_at timestamptz,
  last_login_device text,
  binding_status text not null default 'unbound',
  qr_token_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_bindings_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id)
    on delete cascade,
  constraint device_bindings_binding_status_check
    check (binding_status in ('unbound', 'bound')),
  constraint device_bindings_qr_token_status_check
    check (qr_token_status in ('active', 'consumed', 'revoked')),
  constraint device_bindings_child_device_key unique (child_id, device_id)
);

create index if not exists idx_device_bindings_child
  on public.device_bindings(child_id, updated_at desc);

drop trigger if exists set_parents_updated_at on public.parents;
create trigger set_parents_updated_at
before update on public.parents
for each row execute function public.set_updated_at();

drop trigger if exists set_device_bindings_updated_at on public.device_bindings;
create trigger set_device_bindings_updated_at
before update on public.device_bindings
for each row execute function public.set_updated_at();

create table if not exists public.task_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  task_id uuid references public.tasks(id) on delete set null,
  status text not null,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint task_records_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id)
);

create table if not exists public.piggy_banks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  balance numeric(12,2) not null default 0,
  currency text not null default 'TWD',
  updated_at timestamptz not null default now(),
  constraint piggy_banks_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id),
  constraint piggy_banks_child_key unique (family_id, child_id)
);

create table if not exists public.piggy_bank_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  amount numeric(12,2) not null,
  record_type text not null,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint piggy_bank_records_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id)
);

create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  name text not null,
  price numeric(12,2) not null default 0,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_items_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id)
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  store_item_id uuid references public.store_items(id) on delete set null,
  status text not null default 'pending_parent_purchase',
  amount numeric(12,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id)
);

create table if not exists public.mailbox_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  sender_role text not null,
  title text,
  message text,
  media_id uuid,
  status text not null default 'sent',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mailbox_messages_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id)
);

create table if not exists public.tablet_time (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  entry_type text not null,
  minutes integer not null default 0,
  status text,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tablet_time_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id)
);

create index if not exists idx_task_records_child on public.task_records(child_id, created_at desc);
create index if not exists idx_piggy_bank_records_child on public.piggy_bank_records(child_id, created_at desc);
create index if not exists idx_store_items_child on public.store_items(child_id, updated_at desc);
create index if not exists idx_purchases_child on public.purchases(child_id, updated_at desc);
create index if not exists idx_mailbox_messages_child on public.mailbox_messages(child_id, created_at desc);
create index if not exists idx_tablet_time_child on public.tablet_time(child_id, created_at desc);

alter table public.parents enable row level security;
alter table public.device_bindings enable row level security;
alter table public.task_records enable row level security;
alter table public.piggy_banks enable row level security;
alter table public.piggy_bank_records enable row level security;
alter table public.store_items enable row level security;
alter table public.purchases enable row level security;
alter table public.mailbox_messages enable row level security;
alter table public.tablet_time enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'parents',
    'children',
    'device_bindings',
    'tasks',
    'task_records',
    'stars',
    'piggy_banks',
    'piggy_bank_records',
    'store_items',
    'purchases',
    'shares',
    'mailbox_messages',
    'growth_records',
    'special_days',
    'tablet_time',
    'dreams'
  ]
  loop
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', table_name);
    execute format('drop policy if exists repository_foundation_all on public.%I', table_name);
    execute format(
      'create policy repository_foundation_all on public.%I for all using (true) with check (true)',
      table_name
    );
  end loop;
end $$;
