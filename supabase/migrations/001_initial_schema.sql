-- 小小夢想家 Family - initial schema draft
-- Phase 1 planning artifact. Review before applying to Supabase.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  timezone text not null default 'Asia/Taipei',
  locale text not null default 'zh-TW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'guardian', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table if not exists public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'guardian', 'viewer')),
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  display_name text not null,
  birth_date date,
  gender text,
  avatar_path text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.child_devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  device_name text not null,
  device_label text,
  pairing_code_hash text,
  platform text not null check (platform in ('ios', 'android', 'web')),
  push_enabled boolean not null default true,
  status text not null default 'active' check (status in ('active', 'revoked', 'lost')),
  last_seen_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  sort_order integer not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.growth_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  category_id uuid references public.growth_categories(id),
  title text not null,
  content text,
  record_type text not null default 'growth' check (record_type in ('growth', 'album', 'special_event', 'first_time', 'memory')),
  recorded_on date not null default current_date,
  mood text,
  visibility text not null default 'family' check (visibility in ('family', 'guardians_only')),
  source_type text not null default 'parent' check (source_type in ('parent', 'child_device', 'system')),
  created_by uuid references public.profiles(id),
  source_child_device_id uuid references public.child_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_measurements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  record_id uuid references public.growth_records(id) on delete set null,
  measurement_type text not null check (measurement_type in ('height_cm', 'weight_kg', 'head_cm')),
  value numeric(8,2) not null,
  measured_on date not null default current_date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  category_id uuid references public.growth_categories(id),
  title text not null,
  description text,
  expected_age_months integer,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.child_milestones (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  milestone_id uuid not null references public.milestones(id),
  achieved_on date not null default current_date,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (child_id, milestone_id)
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  record_id uuid references public.growth_records(id) on delete set null,
  entity_type text check (entity_type in ('growth_record', 'encouragement_card', 'album_entry', 'comment', 'artifact', 'special_event', 'wish', 'achievement_message')),
  entity_id uuid,
  media_kind text not null check (media_kind in ('photo', 'audio', 'video', 'document')),
  purpose text check (purpose in ('content', 'cover', 'voice_note', 'attachment', 'honor_wall', 'avatar')),
  bucket text not null,
  path text not null,
  mime_type text not null,
  file_size bigint not null default 0,
  caption text,
  uploaded_by uuid references public.profiles(id),
  uploaded_by_child_id uuid references public.children(id) on delete set null,
  uploaded_by_device_id uuid references public.child_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  artifact_type text not null default 'other' check (artifact_type in ('certificate', 'drawing', 'craft', 'award', 'competition_photo', 'other')),
  title text not null,
  description text,
  artifact_date date not null default current_date,
  display_on_honor_wall boolean not null default true,
  awarded_on date,
  issuer text,
  event_name text,
  primary_media_id uuid references public.media_assets(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.special_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  event_type text not null check (event_type in ('birthday', 'graduation', 'family_trip', 'first_time', 'custom')),
  title text not null,
  description text,
  event_date date not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.encouragement_cards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  title text,
  message text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'opened', 'archived')),
  sent_at timestamptz,
  opened_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.album_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  title text,
  caption text,
  voice_media_id uuid references public.media_assets(id) on delete set null,
  source_type text not null default 'parent' check (source_type in ('parent', 'child_device')),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_by_child_device_id uuid references public.child_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  entity_type text not null check (entity_type in ('growth_record', 'encouragement_card', 'album_entry', 'artifact', 'special_event', 'wish', 'achievement_message')),
  entity_id uuid not null,
  body text,
  voice_media_id uuid references public.media_assets(id) on delete set null,
  author_type text not null check (author_type in ('parent', 'child_device')),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_by_child_device_id uuid references public.child_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  icon text,
  image_media_id uuid references public.media_assets(id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (family_id, code)
);

create table if not exists public.child_badges (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_by uuid references public.profiles(id) on delete set null,
  source_entity_type text check (source_entity_type in ('reward_transaction', 'growth_record', 'album_entry', 'artifact', 'special_event', 'wish')),
  source_entity_id uuid,
  note text,
  awarded_at timestamptz not null default now(),
  unique (child_id, badge_id, source_entity_type, source_entity_id)
);

create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  title text not null,
  description text,
  target_amount numeric(12,2) not null default 0,
  current_amount numeric(12,2) not null default 0,
  unit text not null default 'wish_fund' check (unit in ('wish_fund', 'stars', 'minutes')),
  status text not null default 'active' check (status in ('draft', 'active', 'fulfilled', 'cancelled', 'archived')),
  ai_split_enabled boolean not null default false,
  ai_split_status text not null default 'none' check (ai_split_status in ('none', 'pending', 'processing', 'completed', 'failed')),
  original_image_url text,
  requested_by_child_device_id uuid references public.child_devices(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wish_stages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  wish_id uuid not null references public.wishes(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  mask_url text,
  sort_order integer not null default 0,
  unlock_percentage integer not null check (unlock_percentage between 0 and 100),
  ai_generated boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wish_id, sort_order),
  unique (wish_id, unlock_percentage)
);

create table if not exists public.wish_progress_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  wish_id uuid not null references public.wishes(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  delta_amount numeric(12,2) not null,
  note text,
  source_entity_type text check (source_entity_type in ('reward_transaction', 'album_entry', 'growth_record', 'manual_adjustment')),
  source_entity_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.screen_time (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  entry_type text not null check (entry_type in ('fixed_window', 'minute_adjustment', 'usage_session')),
  day_of_week integer check (day_of_week between 0 and 6),
  starts_at time,
  ends_at time,
  minutes_delta integer,
  session_started_at timestamptz,
  session_ended_at timestamptz,
  reason text,
  source_entity_type text check (source_entity_type in ('reward_transaction', 'wish', 'manual_adjustment')),
  source_entity_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  reward_type text not null check (reward_type in ('stars', 'wish_fund', 'screen_time', 'badge')),
  amount numeric(12,2),
  minutes integer,
  badge_id uuid references public.badges(id) on delete set null,
  wish_id uuid references public.wishes(id) on delete set null,
  direction text not null default 'grant' check (direction in ('grant', 'deduct', 'redeem', 'adjust')),
  reason text,
  source_entity_type text check (source_entity_type in ('encouragement_card', 'album_entry', 'comment', 'artifact', 'special_event', 'growth_record', 'manual_adjustment')),
  source_entity_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.achievement_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  title text not null,
  body text,
  message_type text not null default 'achievement' check (message_type in ('achievement', 'encouragement', 'badge', 'wish', 'system')),
  source_entity_type text check (source_entity_type in ('encouragement_card', 'reward_transaction', 'badge', 'child_badge', 'wish', 'album_entry', 'artifact', 'special_event')),
  source_entity_id uuid,
  sent_at timestamptz,
  opened_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  title text not null,
  description text,
  reminder_type text not null default 'custom' check (reminder_type in ('vaccine', 'health', 'activity', 'memory', 'custom')),
  due_at timestamptz not null,
  repeat_rule text,
  status text not null default 'active' check (status in ('active', 'done', 'cancelled')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  child_device_id uuid references public.child_devices(id) on delete cascade,
  device_role text not null default 'parent_device' check (device_role in ('parent_device', 'child_tablet')),
  provider text not null check (provider in ('fcm', 'expo', 'apns')),
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  device_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, token),
  check (
    (device_role = 'parent_device' and user_id is not null and child_id is null and child_device_id is null)
    or
    (device_role = 'child_tablet' and user_id is null and child_id is not null and child_device_id is not null)
  )
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  record_created boolean not null default true,
  media_uploaded boolean not null default true,
  encouragement_card_received boolean not null default true,
  achievement_message_received boolean not null default true,
  reminder_due boolean not null default true,
  weekly_digest boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, user_id),
  unique (family_id, child_id),
  check (
    (user_id is not null and child_id is null)
    or
    (user_id is null and child_id is not null)
  )
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  recipient_child_id uuid references public.children(id) on delete cascade,
  target_device_id uuid references public.child_devices(id) on delete set null,
  event_type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  check (
    recipient_user_id is not null
    or recipient_child_id is not null
    or target_device_id is not null
  )
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_family_members_family_user on public.family_members(family_id, user_id);
create index if not exists idx_children_family on public.children(family_id);
create index if not exists idx_child_devices_child on public.child_devices(child_id, status);
create index if not exists idx_growth_records_child_date on public.growth_records(child_id, recorded_on desc);
create index if not exists idx_growth_measurements_child_date on public.growth_measurements(child_id, measured_on desc);
create index if not exists idx_media_assets_record on public.media_assets(record_id);
create index if not exists idx_media_assets_family_child on public.media_assets(family_id, child_id);
create index if not exists idx_media_assets_entity on public.media_assets(entity_type, entity_id);
create index if not exists idx_encouragement_cards_child on public.encouragement_cards(child_id, status, created_at desc);
create index if not exists idx_album_entries_child on public.album_entries(child_id, created_at desc);
create index if not exists idx_comments_entity on public.comments(entity_type, entity_id, created_at);
create index if not exists idx_reward_transactions_child on public.reward_transactions(child_id, created_at desc);
create index if not exists idx_child_badges_child on public.child_badges(child_id, awarded_at desc);
create index if not exists idx_special_events_child_date on public.special_events(child_id, event_date desc);
create index if not exists idx_screen_time_child on public.screen_time(child_id, entry_type, created_at desc);
create index if not exists idx_wishes_child_status on public.wishes(child_id, status);
create index if not exists idx_wish_stages_wish_order on public.wish_stages(wish_id, sort_order);
create index if not exists idx_wish_stages_child_unlock on public.wish_stages(child_id, unlock_percentage);
create index if not exists idx_wish_progress_wish on public.wish_progress_entries(wish_id, created_at);
create index if not exists idx_achievement_messages_child on public.achievement_messages(child_id, created_at desc);
create index if not exists idx_reminders_due on public.reminders(family_id, status, due_at);
create index if not exists idx_device_tokens_user_active on public.device_tokens(user_id, is_active);
create index if not exists idx_device_tokens_child_active on public.device_tokens(child_id, child_device_id, is_active);
create index if not exists idx_notification_events_pending on public.notification_events(status, scheduled_at);

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invitations enable row level security;
alter table public.children enable row level security;
alter table public.child_devices enable row level security;
alter table public.growth_categories enable row level security;
alter table public.growth_records enable row level security;
alter table public.growth_measurements enable row level security;
alter table public.milestones enable row level security;
alter table public.child_milestones enable row level security;
alter table public.media_assets enable row level security;
alter table public.artifacts enable row level security;
alter table public.special_events enable row level security;
alter table public.encouragement_cards enable row level security;
alter table public.album_entries enable row level security;
alter table public.comments enable row level security;
alter table public.badges enable row level security;
alter table public.child_badges enable row level security;
alter table public.wishes enable row level security;
alter table public.wish_stages enable row level security;
alter table public.wish_progress_entries enable row level security;
alter table public.screen_time enable row level security;
alter table public.reward_transactions enable row level security;
alter table public.achievement_messages enable row level security;
alter table public.reminders enable row level security;
alter table public.device_tokens enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;
alter table public.audit_logs enable row level security;
