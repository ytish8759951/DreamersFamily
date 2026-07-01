-- Little Dreamers Family
-- Core product schema after UI acceptance.
-- Depends on: 001_initial_schema.sql
-- No seed or fake data is created by this migration.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- children: extend the existing foundation table.
-- ---------------------------------------------------------------------------

alter table public.children
  add column if not exists legal_name text,
  add column if not exists theme_color text,
  add column if not exists timezone text not null default 'Asia/Taipei',
  add column if not exists status text not null default 'active',
  add column if not exists archived_at timestamptz;

alter table public.children
  drop constraint if exists children_status_check;

alter table public.children
  add constraint children_status_check
  check (status in ('active', 'archived'));

alter table public.children
  drop constraint if exists children_family_id_id_key;

alter table public.children
  add constraint children_family_id_id_key unique (family_id, id);

create index if not exists idx_children_family_status_name
  on public.children(family_id, status, display_name);

drop trigger if exists set_children_updated_at on public.children;
create trigger set_children_updated_at
before update on public.children
for each row execute function public.set_updated_at();

alter table public.child_devices
  drop constraint if exists child_devices_family_id_id_key,
  drop constraint if exists child_devices_family_child_id_key;

alter table public.child_devices
  add constraint child_devices_family_id_id_key unique (family_id, id),
  add constraint child_devices_family_child_id_key unique (family_id, child_id, id);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  title text not null,
  description text,
  category text not null default 'daily',
  task_date date not null default current_date,
  due_at timestamptz,
  recurrence_rule text,
  status text not null default 'pending',
  reward_stars integer not null default 0,
  reward_screen_minutes integer not null default 0,
  completion_note text,
  completed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint tasks_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id),
  constraint tasks_category_check
    check (category in ('daily', 'habit', 'household', 'challenge')),
  constraint tasks_status_check
    check (status in ('pending', 'submitted', 'approved', 'rejected', 'cancelled', 'expired')),
  constraint tasks_rewards_nonnegative_check
    check (reward_stars >= 0 and reward_screen_minutes >= 0),
  constraint tasks_approval_fields_check
    check (
      status <> 'approved'
      or (
        completed_at is not null
        and reviewed_by is not null
        and reviewed_at is not null
      )
    ),
  constraint tasks_rejection_fields_check
    check (
      status <> 'rejected'
      or (reviewed_by is not null and reviewed_at is not null)
    ),
  constraint tasks_family_child_id_key unique (family_id, child_id, id),
  constraint tasks_family_id_id_key unique (family_id, id)
);

create index idx_tasks_family_child_date
  on public.tasks(family_id, child_id, task_date desc);

create index idx_tasks_family_status_due
  on public.tasks(family_id, status, due_at);

create index idx_tasks_child_status_date
  on public.tasks(child_id, status, task_date desc);

create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- dreams
-- ---------------------------------------------------------------------------

create table public.dreams (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  title text not null,
  description text,
  cover_path text,
  target_amount numeric(12,2) not null default 0,
  currency char(3) not null default 'TWD',
  status text not null default 'active',
  priority smallint not null default 0,
  requested_by_child boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  target_date date,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint dreams_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id),
  constraint dreams_target_amount_check check (target_amount >= 0),
  constraint dreams_status_check
    check (status in ('pending_approval', 'active', 'funded', 'completed', 'cancelled', 'archived')),
  constraint dreams_approval_check
    check (
      status = 'pending_approval'
      or requested_by_child = false
      or (approved_by is not null and approved_at is not null)
    ),
  constraint dreams_completed_at_check
    check (status <> 'completed' or completed_at is not null),
  constraint dreams_family_child_id_key unique (family_id, child_id, id),
  constraint dreams_family_id_id_key unique (family_id, id)
);

create index idx_dreams_family_child_status_priority
  on public.dreams(family_id, child_id, status, priority desc);

create index idx_dreams_child_created
  on public.dreams(child_id, created_at desc);

create trigger set_dreams_updated_at
before update on public.dreams
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- shares
-- ---------------------------------------------------------------------------

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  title text,
  caption text,
  share_type text not null,
  source_type text not null,
  status text not null default 'pending_review',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  published_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_by_device_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint shares_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id),
  constraint shares_family_child_device_fk
    foreign key (family_id, child_id, created_by_device_id)
    references public.child_devices(family_id, child_id, id)
    on delete restrict,
  constraint shares_type_check
    check (share_type in ('text', 'photo', 'audio', 'video', 'mixed')),
  constraint shares_source_type_check
    check (source_type in ('child_device', 'parent', 'system')),
  constraint shares_status_check
    check (status in ('draft', 'pending_review', 'approved', 'rejected', 'archived')),
  constraint shares_source_actor_check
    check (
      (source_type = 'parent' and created_by_user_id is not null and created_by_device_id is null)
      or
      (source_type = 'child_device' and created_by_user_id is null and created_by_device_id is not null)
      or
      (source_type = 'system' and created_by_device_id is null)
    ),
  constraint shares_review_check
    check (
      status not in ('approved', 'rejected')
      or (reviewed_by is not null and reviewed_at is not null)
    ),
  constraint shares_publish_check
    check (status <> 'approved' or published_at is not null),
  constraint shares_family_child_id_key unique (family_id, child_id, id),
  constraint shares_family_id_id_key unique (family_id, id)
);

create index idx_shares_family_status_submitted
  on public.shares(family_id, status, submitted_at desc);

create index idx_shares_child_published
  on public.shares(child_id, published_at desc)
  where deleted_at is null;

create index idx_shares_child_status_created
  on public.shares(child_id, status, created_at desc);

create trigger set_shares_updated_at
before update on public.shares
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- stars: immutable ledger.
-- ---------------------------------------------------------------------------

create table public.stars (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  amount integer not null,
  transaction_type text not null,
  reason text,
  task_id uuid,
  share_id uuid,
  dream_id uuid,
  reversal_of_id uuid,
  idempotency_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stars_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id),
  constraint stars_family_task_fk
    foreign key (family_id, child_id, task_id)
    references public.tasks(family_id, child_id, id),
  constraint stars_family_share_fk
    foreign key (family_id, child_id, share_id)
    references public.shares(family_id, child_id, id),
  constraint stars_family_dream_fk
    foreign key (family_id, child_id, dream_id)
    references public.dreams(family_id, child_id, id),
  constraint stars_family_reversal_fk
    foreign key (family_id, child_id, reversal_of_id)
    references public.stars(family_id, child_id, id)
    on delete restrict,
  constraint stars_amount_check check (amount <> 0),
  constraint stars_transaction_type_check
    check (transaction_type in (
      'task_reward',
      'share_reward',
      'encouragement',
      'dream_redeem',
      'manual_adjustment',
      'reversal'
    )),
  constraint stars_reversal_check
    check (
      (transaction_type = 'reversal' and reversal_of_id is not null)
      or
      (transaction_type <> 'reversal' and reversal_of_id is null)
    ),
  constraint stars_self_reversal_check check (reversal_of_id is null or reversal_of_id <> id),
  constraint stars_family_id_id_key unique (family_id, id),
  constraint stars_family_child_id_key unique (family_id, child_id, id)
);

create unique index uq_stars_family_idempotency
  on public.stars(family_id, idempotency_key)
  where idempotency_key is not null;

create index idx_stars_family_child_created
  on public.stars(family_id, child_id, created_at desc);

create index idx_stars_task
  on public.stars(task_id)
  where task_id is not null;

create index idx_stars_share
  on public.stars(share_id)
  where share_id is not null;

-- ---------------------------------------------------------------------------
-- dream_funds: immutable ledger.
-- ---------------------------------------------------------------------------

create table public.dream_funds (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  dream_id uuid not null,
  amount numeric(12,2) not null,
  transaction_type text not null,
  note text,
  source_star_id uuid,
  reversal_of_id uuid,
  idempotency_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint dream_funds_family_dream_fk
    foreign key (family_id, child_id, dream_id)
    references public.dreams(family_id, child_id, id),
  constraint dream_funds_family_star_fk
    foreign key (family_id, child_id, source_star_id)
    references public.stars(family_id, child_id, id),
  constraint dream_funds_family_reversal_fk
    foreign key (family_id, child_id, reversal_of_id)
    references public.dream_funds(family_id, child_id, id)
    on delete restrict,
  constraint dream_funds_amount_check check (amount <> 0),
  constraint dream_funds_transaction_type_check
    check (transaction_type in (
      'deposit',
      'star_conversion',
      'purchase',
      'refund',
      'manual_adjustment',
      'reversal'
    )),
  constraint dream_funds_source_star_check
    check (
      transaction_type <> 'star_conversion'
      or source_star_id is not null
    ),
  constraint dream_funds_reversal_check
    check (
      (transaction_type = 'reversal' and reversal_of_id is not null)
      or
      (transaction_type <> 'reversal' and reversal_of_id is null)
    ),
  constraint dream_funds_self_reversal_check
    check (reversal_of_id is null or reversal_of_id <> id),
  constraint dream_funds_family_child_id_key unique (family_id, child_id, id)
);

create unique index uq_dream_funds_family_idempotency
  on public.dream_funds(family_id, idempotency_key)
  where idempotency_key is not null;

create index idx_dream_funds_dream_created
  on public.dream_funds(dream_id, created_at desc);

create index idx_dream_funds_child_created
  on public.dream_funds(child_id, created_at desc);

-- ---------------------------------------------------------------------------
-- share_media
-- ---------------------------------------------------------------------------

create table public.share_media (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  share_id uuid not null,
  media_type text not null,
  bucket text not null default 'family-media',
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  width integer,
  height integer,
  duration_seconds numeric(10,2),
  thumbnail_path text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint share_media_family_share_fk
    foreign key (family_id, child_id, share_id)
    references public.shares(family_id, child_id, id)
    on delete cascade,
  constraint share_media_type_check
    check (media_type in ('photo', 'audio', 'video')),
  constraint share_media_size_check check (file_size_bytes >= 0),
  constraint share_media_dimensions_check
    check (
      (width is null or width > 0)
      and (height is null or height > 0)
      and (duration_seconds is null or duration_seconds >= 0)
    ),
  constraint share_media_bucket_path_key unique (bucket, storage_path),
  constraint share_media_share_order_key unique (share_id, sort_order)
);

create index idx_share_media_share_order
  on public.share_media(share_id, sort_order);

create index idx_share_media_family_child
  on public.share_media(family_id, child_id);

-- ---------------------------------------------------------------------------
-- encouragement_cards: extend the existing table.
-- ---------------------------------------------------------------------------

alter table public.encouragement_cards
  add column if not exists sender_user_id uuid references public.profiles(id) on delete restrict,
  add column if not exists card_type text not null default 'text',
  add column if not exists template_key text,
  add column if not exists media_bucket text,
  add column if not exists media_path text,
  add column if not exists media_mime_type text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists archived_at timestamptz;

update public.encouragement_cards
set sender_user_id = created_by
where sender_user_id is null;

alter table public.encouragement_cards
  alter column sender_user_id set not null;

alter table public.encouragement_cards
  drop constraint if exists encouragement_cards_status_check,
  drop constraint if exists encouragement_cards_card_type_check,
  drop constraint if exists encouragement_cards_content_check,
  drop constraint if exists encouragement_cards_family_child_fk;

alter table public.encouragement_cards
  add constraint encouragement_cards_status_check
    check (status in ('draft', 'scheduled', 'sent', 'opened', 'archived', 'cancelled')),
  add constraint encouragement_cards_card_type_check
    check (card_type in ('text', 'photo', 'audio', 'video', 'mixed')),
  add constraint encouragement_cards_content_check
    check (
      nullif(btrim(coalesce(message, '')), '') is not null
      or media_path is not null
    ) not valid,
  add constraint encouragement_cards_delivery_check
    check (
      (status not in ('sent', 'opened') or sent_at is not null)
      and (status <> 'opened' or opened_at is not null)
      and (status <> 'scheduled' or scheduled_at is not null)
    ),
  add constraint encouragement_cards_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id);

create index if not exists idx_encouragement_cards_family_child_status
  on public.encouragement_cards(family_id, child_id, status, created_at desc);

drop trigger if exists set_encouragement_cards_updated_at on public.encouragement_cards;
create trigger set_encouragement_cards_updated_at
before update on public.encouragement_cards
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- screen_time_logs: immutable ledger.
-- ---------------------------------------------------------------------------

create table public.screen_time_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  entry_type text not null,
  minutes_delta integer not null,
  task_id uuid,
  session_started_at timestamptz,
  session_ended_at timestamptz,
  device_id uuid,
  reason text,
  reversal_of_id uuid,
  idempotency_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint screen_time_logs_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id),
  constraint screen_time_logs_family_task_fk
    foreign key (family_id, child_id, task_id)
    references public.tasks(family_id, child_id, id),
  constraint screen_time_logs_family_device_fk
    foreign key (family_id, child_id, device_id)
    references public.child_devices(family_id, child_id, id)
    on delete restrict,
  constraint screen_time_logs_family_reversal_fk
    foreign key (family_id, child_id, reversal_of_id)
    references public.screen_time_logs(family_id, child_id, id)
    on delete restrict,
  constraint screen_time_logs_entry_type_check
    check (entry_type in (
      'task_reward',
      'manual_grant',
      'usage',
      'manual_deduction',
      'expiry',
      'reversal'
    )),
  constraint screen_time_logs_minutes_check check (minutes_delta <> 0),
  constraint screen_time_logs_usage_check
    check (
      entry_type <> 'usage'
      or (
        minutes_delta < 0
        and session_started_at is not null
        and session_ended_at is not null
        and session_ended_at >= session_started_at
      )
    ),
  constraint screen_time_logs_reversal_check
    check (
      (entry_type = 'reversal' and reversal_of_id is not null)
      or
      (entry_type <> 'reversal' and reversal_of_id is null)
    ),
  constraint screen_time_logs_self_reversal_check
    check (reversal_of_id is null or reversal_of_id <> id),
  constraint screen_time_logs_family_child_id_key unique (family_id, child_id, id)
);

create unique index uq_screen_time_logs_family_idempotency
  on public.screen_time_logs(family_id, idempotency_key)
  where idempotency_key is not null;

create index idx_screen_time_logs_family_child_created
  on public.screen_time_logs(family_id, child_id, created_at desc);

create index idx_screen_time_logs_device_session
  on public.screen_time_logs(device_id, session_started_at desc)
  where device_id is not null;

-- ---------------------------------------------------------------------------
-- special_days
-- ---------------------------------------------------------------------------

create table public.special_days (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid,
  event_type text not null default 'custom',
  title text not null,
  description text,
  event_date date not null,
  is_recurring boolean not null default false,
  recurrence_rule text,
  reminder_enabled boolean not null default true,
  remind_days_before integer not null default 7,
  cover_path text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint special_days_family_child_fk
    foreign key (family_id, child_id)
    references public.children(family_id, id),
  constraint special_days_event_type_check
    check (event_type in ('birthday', 'graduation', 'family_trip', 'first_time', 'holiday', 'custom')),
  constraint special_days_reminder_check check (remind_days_before >= 0),
  constraint special_days_recurrence_check
    check (is_recurring = false or recurrence_rule is not null)
);

create index idx_special_days_family_date
  on public.special_days(family_id, event_date);

create index idx_special_days_child_date
  on public.special_days(child_id, event_date desc)
  where child_id is not null;

create trigger set_special_days_updated_at
before update on public.special_days
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  recipient_child_id uuid,
  notification_type text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  channel text not null default 'in_app',
  status text not null default 'pending',
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  error_code text,
  error_message text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  constraint notifications_family_child_fk
    foreign key (family_id, recipient_child_id)
    references public.children(family_id, id)
    on delete cascade,
  constraint notifications_recipient_check
    check (num_nonnulls(recipient_user_id, recipient_child_id) = 1),
  constraint notifications_type_check
    check (notification_type in (
      'task_assigned',
      'task_submitted',
      'task_approved',
      'share_submitted',
      'share_approved',
      'encouragement_card_received',
      'dream_funded',
      'dream_completed',
      'screen_time_low',
      'special_day_reminder',
      'weekly_digest'
    )),
  constraint notifications_channel_check
    check (channel in ('in_app', 'push', 'both')),
  constraint notifications_status_check
    check (status in ('pending', 'sent', 'failed', 'cancelled')),
  constraint notifications_delivery_check
    check (
      (status <> 'sent' or sent_at is not null)
      and (status <> 'failed' or failed_at is not null)
    )
);

create unique index uq_notifications_family_dedupe
  on public.notifications(family_id, dedupe_key)
  where dedupe_key is not null;

create index idx_notifications_user_unread
  on public.notifications(recipient_user_id, created_at desc)
  where recipient_user_id is not null and read_at is null;

create index idx_notifications_child_unread
  on public.notifications(recipient_child_id, created_at desc)
  where recipient_child_id is not null and read_at is null;

create index idx_notifications_pending
  on public.notifications(status, scheduled_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Read models. These views avoid storing mutable balances on master records.
-- ---------------------------------------------------------------------------

create or replace view public.child_star_balances
with (security_invoker = true)
as
select
  family_id,
  child_id,
  coalesce(sum(amount), 0)::bigint as balance
from public.stars
group by family_id, child_id;

create or replace view public.dream_fund_balances
with (security_invoker = true)
as
select
  family_id,
  child_id,
  dream_id,
  coalesce(sum(amount), 0::numeric)::numeric(12,2) as balance
from public.dream_funds
group by family_id, child_id, dream_id;

create or replace view public.child_screen_time_balances
with (security_invoker = true)
as
select
  family_id,
  child_id,
  coalesce(sum(minutes_delta), 0)::bigint as balance_minutes
from public.screen_time_logs
group by family_id, child_id;

-- RLS is enabled here. Policies are created in 003_core_rls_and_storage.sql.
alter table public.tasks enable row level security;
alter table public.stars enable row level security;
alter table public.dreams enable row level security;
alter table public.dream_funds enable row level security;
alter table public.shares enable row level security;
alter table public.share_media enable row level security;
alter table public.encouragement_cards enable row level security;
alter table public.screen_time_logs enable row level security;
alter table public.special_days enable row level security;
alter table public.notifications enable row level security;

-- ---------------------------------------------------------------------------
-- Guard child-device direct updates.
--
-- RLS controls which rows may be updated. These triggers also control which
-- columns a child-device session may change, preventing reward, sender, or
-- message fields from being altered while submitting/opening/reading.
-- ---------------------------------------------------------------------------

create or replace function public.guard_child_task_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.current_child_device_id() is not null then
    if (
      to_jsonb(new) - array['status', 'completion_note', 'completed_at', 'updated_at']
    ) is distinct from (
      to_jsonb(old) - array['status', 'completion_note', 'completed_at', 'updated_at']
    ) then
      raise exception 'Child devices may only submit task completion fields';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_child_task_update
before update on public.tasks
for each row execute function public.guard_child_task_update();

create or replace function public.guard_child_share_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.current_child_device_id() is not null then
    if (
      to_jsonb(new) - array[
        'title',
        'caption',
        'share_type',
        'status',
        'submitted_at',
        'reviewed_by',
        'reviewed_at',
        'rejection_reason',
        'updated_at'
      ]
    ) is distinct from (
      to_jsonb(old) - array[
        'title',
        'caption',
        'share_type',
        'status',
        'submitted_at',
        'reviewed_by',
        'reviewed_at',
        'rejection_reason',
        'updated_at'
      ]
    ) then
      raise exception 'Child devices may only edit share content and submission fields';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_child_share_update
before update on public.shares
for each row execute function public.guard_child_share_update();

create or replace function public.guard_child_card_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.current_child_device_id() is not null then
    if (
      to_jsonb(new) - array['status', 'opened_at', 'updated_at']
    ) is distinct from (
      to_jsonb(old) - array['status', 'opened_at', 'updated_at']
    ) then
      raise exception 'Child devices may only mark encouragement cards as opened';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_child_card_update
before update on public.encouragement_cards
for each row execute function public.guard_child_card_update();

create or replace function public.guard_notification_recipient_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if (
      to_jsonb(new) - array['read_at']
    ) is distinct from (
      to_jsonb(old) - array['read_at']
    ) then
      raise exception 'Notification recipients may only update read_at';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_notification_recipient_update
before update on public.notifications
for each row execute function public.guard_notification_recipient_update();
