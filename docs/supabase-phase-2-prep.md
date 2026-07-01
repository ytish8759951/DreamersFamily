# Supabase Phase 2 Preparation

Status: planning only. Do not connect Supabase, Storage, Auth, or deployment in this phase.

The active runtime binding remains:

```ts
export const dataMode: DataMode = 'local';
export const dataRepository: LocalDataRepository = localData;
```

## Repository Contract

`LocalDataRepository` in `apps/web/src/lib/localData.ts` is the current UI contract. `SupabaseDataRepository` in `apps/web/src/lib/supabaseData.ts` implements the same method surface as a disabled skeleton.

| Area | LocalDataRepository method | SupabaseDataRepository skeleton | Primary tables |
| --- | --- | --- | --- |
| State | `getState()` | yes | all MVP tables |
| State | `resetLocalData()` | yes | local only; no Supabase equivalent for production users |
| State | `subscribe(listener)` | yes | realtime subscriptions later |
| Children | `createChild(input)` | yes | `children` |
| Children | `updateChild(childId, input)` | yes | `children` |
| Children | `deleteChild(childId)` | yes | `children` soft archive |
| Children | `switchChild(childId)` | yes | client session preference, optional `family_members.active_child_id` |
| Children | `listChildren(includeArchived)` | yes | `children` |
| Tasks | `createTask(input)` | yes | `tasks` |
| Tasks | `completeTask(taskId, completionNote)` | yes | `tasks` |
| Tasks | `approveTask(taskId)` | yes | `tasks`, `star_transactions`, `screen_time_logs` |
| Tasks | `listTasks(childId)` | yes | `tasks` |
| Stars | `getStarBalance(childId)` | yes | `star_transactions` |
| Stars | `listStarTransactions(childId)` | yes | `star_transactions` |
| Dreams | `createDream(input)` | yes | `dreams` |
| Dreams | `addDreamDeposit(dreamId, amount, note)` | yes | `dream_funds`, `dreams` |
| Dreams | `completeDream(dreamId)` | yes | `dreams`, `dream_funds` |
| Dreams | `listDreams(childId, includeCompleted)` | yes | `dreams`, `dream_funds` |
| Shares | `createShare(input)` | yes | `shares`, `share_media` |
| Shares | `listShares(childId)` | yes | `shares`, `share_media` |
| Shares | `approveShare(shareId, rewardStars)` | yes | `shares`, `star_transactions` |
| Mailbox | `createMailboxMessage(input)` | yes | `mailbox_messages` |
| Mailbox | `markMessageRead(messageId)` | yes | `mailbox_messages` |
| Mailbox | `listMailboxMessages(childId)` | yes | `mailbox_messages` |
| Badges | `createBadge(input)` | yes | `badges` |
| Badges | `deleteBadge(badgeId)` | yes | `badges` soft delete |
| Badges | `awardBadge(input)` | yes | `child_badges`, `star_transactions` |
| Badges | `getBadges(includeDeleted)` | yes | `badges` |
| Badges | `getChildBadges(childId)` | yes | `child_badges`, `badges` |
| Special Days | `createSpecialDay(input)` | yes | `special_days` |
| Special Days | `updateSpecialDay(specialDayId, input)` | yes | `special_days` |
| Special Days | `deleteSpecialDay(specialDayId)` | yes | `special_days` soft delete |
| Special Days | `getSpecialDays(childId, includeDeleted)` | yes | `special_days` |
| Special Days | `getUpcomingSpecialDays(childId, limit)` | yes | `special_days` |
| Settings | `getSettings()` | yes | `family_settings` |
| Settings | `updateSettings(input)` | yes | `family_settings` |
| Settings | `exportData()` | yes | all MVP tables |
| Settings | `importData(raw)` | yes | all MVP tables, admin/dev-only importer |
| Settings | `resetAllData()` | yes | admin/dev-only reset, not normal production action |
| Screen Time | `updateScreenTime(input)` | yes | `screen_time_logs` |
| Screen Time | `getScreenTimeBalance(childId)` | yes | `screen_time_logs` |
| Screen Time | `listScreenTimeLogs(childId)` | yes | `screen_time_logs` |

## Table Design

### Core ownership

| Table | Purpose | Key columns |
| --- | --- | --- |
| `families` | Family tenant root | `id uuid pk`, `name text`, `intro text`, `avatar_path text`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz` |
| `family_members` | Auth user to family membership | `id uuid pk`, `family_id uuid fk`, `user_id uuid fk auth.users`, `role text`, `active_child_id uuid null`, `created_at timestamptz` |
| `children` | Child profiles | `id uuid pk`, `family_id uuid fk`, `display_name text`, `legal_name text null`, `birth_date date null`, `gender text null`, `avatar_path text null`, `theme_color text null`, `timezone text`, `status text`, `notes text null`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`, `archived_at timestamptz null` |

### Tasks and rewards

| Table | Purpose | Key columns |
| --- | --- | --- |
| `tasks` | Child tasks | `id uuid pk`, `family_id uuid fk`, `child_id uuid fk`, `title text`, `description text null`, `category text`, `task_date date`, `due_at timestamptz null`, `recurrence_rule text null`, `status text`, `reward_stars int`, `reward_screen_minutes int`, `completion_note text null`, `completed_at timestamptz null`, `reviewed_by uuid null`, `reviewed_at timestamptz null`, `rejection_reason text null`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`, `archived_at timestamptz null` |
| `star_transactions` | Star ledger | `id uuid pk`, `family_id uuid fk`, `child_id uuid fk`, `amount int`, `transaction_type text`, `reason text null`, `task_id uuid null`, `share_id uuid null`, `dream_id uuid null`, `reversal_of_id uuid null`, `idempotency_key text unique null`, `created_by uuid null`, `created_at timestamptz` |
| `screen_time_logs` | Screen-time ledger | `id uuid pk`, `family_id uuid fk`, `child_id uuid fk`, `entry_type text`, `minutes_delta int`, `task_id uuid null`, `session_started_at timestamptz null`, `session_ended_at timestamptz null`, `device_id uuid null`, `reason text null`, `reversal_of_id uuid null`, `idempotency_key text unique null`, `created_by uuid null`, `created_at timestamptz` |

### Dreams

| Table | Purpose | Key columns |
| --- | --- | --- |
| `dreams` | Dream fund goals | `id uuid pk`, `family_id uuid fk`, `child_id uuid fk`, `title text`, `description text null`, `cover_path text null`, `target_amount numeric`, `currency text`, `status text`, `priority int`, `requested_by_child boolean`, `approved_by uuid null`, `approved_at timestamptz null`, `target_date date null`, `completed_at timestamptz null`, `created_by uuid null`, `created_at timestamptz`, `updated_at timestamptz`, `archived_at timestamptz null` |
| `dream_funds` | Dream fund ledger | `id uuid pk`, `family_id uuid fk`, `child_id uuid fk`, `dream_id uuid fk`, `amount numeric`, `transaction_type text`, `note text null`, `source_star_id uuid null`, `reversal_of_id uuid null`, `idempotency_key text unique null`, `created_by uuid null`, `created_at timestamptz` |

### Shares

| Table | Purpose | Key columns |
| --- | --- | --- |
| `shares` | Child shares and review status | `id uuid pk`, `family_id uuid fk`, `child_id uuid fk`, `title text null`, `caption text null`, `share_type text`, `source_type text`, `status text`, `submitted_at timestamptz`, `reviewed_by uuid null`, `reviewed_at timestamptz null`, `rejection_reason text null`, `published_at timestamptz null`, `created_by_user_id uuid null`, `created_by_device_id uuid null`, `created_at timestamptz`, `updated_at timestamptz`, `deleted_at timestamptz null` |
| `share_media` | Share attachments | `id uuid pk`, `family_id uuid fk`, `child_id uuid fk`, `share_id uuid fk`, `media_type text`, `bucket text`, `storage_path text`, `mime_type text`, `file_size_bytes bigint`, `width int null`, `height int null`, `duration_seconds numeric null`, `thumbnail_path text null`, `sort_order int`, `created_at timestamptz` |

### Mailbox

| Table | Purpose | Key columns |
| --- | --- | --- |
| `mailbox_messages` | Parent-to-child mailbox | `id uuid pk`, `family_id uuid fk`, `child_id uuid fk`, `sender_user_id uuid`, `title text null`, `message text null`, `card_type text`, `template_key text null`, `media_bucket text null`, `media_path text null`, `media_mime_type text null`, `status text`, `scheduled_at timestamptz null`, `sent_at timestamptz null`, `opened_at timestamptz null`, `archived_at timestamptz null`, `created_at timestamptz`, `updated_at timestamptz` |

### Honor Wall

| Table | Purpose | Key columns |
| --- | --- | --- |
| `badges` | Badge catalog | `id uuid pk`, `family_id uuid fk`, `name text`, `icon text`, `description text null`, `reward_stars int`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`, `deleted_at timestamptz null` |
| `child_badges` | Badge awards | `id uuid pk`, `family_id uuid fk`, `child_id uuid fk`, `badge_id uuid fk`, `note text null`, `awarded_by uuid`, `awarded_at timestamptz`, unique `(child_id, badge_id)` |

### Special days and settings

| Table | Purpose | Key columns |
| --- | --- | --- |
| `special_days` | Family dates and child-specific reminders | `id uuid pk`, `family_id uuid fk`, `child_id uuid null fk`, `title text`, `date date`, `type text`, `description text null`, `image_path text null`, `created_by uuid`, `created_at timestamptz`, `updated_at timestamptz`, `deleted_at timestamptz null` |
| `family_settings` | Per-family settings | `family_id uuid pk fk`, `family_intro text`, `family_avatar_path text null`, `family_created_at timestamptz`, `parent_name text`, `parent_email text`, `parent_avatar_path text null`, `default_daily_screen_minutes int`, `default_daily_star_limit int`, `default_theme_color text`, `allow_photo_sharing boolean`, `allow_video_sharing boolean`, `allow_audio_sharing boolean`, `notify_task_completed boolean`, `notify_dream_completed boolean`, `notify_share_pending boolean`, `notify_special_day boolean`, `updated_at timestamptz` |

## Migration Plan

1. Keep Phase 2 disabled.
   - Do not run `supabase link`.
   - Do not run `supabase db push`.
   - Do not switch `dataMode`.
2. Finalize contract.
   - Treat `LocalDataRepository` as the UI-facing contract.
   - Keep `SupabaseDataRepository` method-for-method compatible.
3. Create SQL migrations later.
   - Add enum or check constraints for statuses and types.
   - Add indexes on `family_id`, `child_id`, `created_at`, `status`, `deleted_at`, and ledger idempotency keys.
4. Create RLS policies later.
   - Parents can manage family data for families where they are members.
   - Children can read their own child-scoped rows and create child-submitted shares/tasks where allowed.
5. Build a data migration utility later.
   - Input: `LocalDataRepository.exportData()` JSON.
   - Output: ordered inserts for families, settings, children, tasks, dreams, ledgers, shares, mailbox, badges, special days.
6. Add Supabase implementation behind a feature flag later.
   - Only switch `dataRepository.ts` after repository tests pass against Supabase local or test project.
7. Add contract tests.
   - Reuse local-data scenarios against both local and Supabase repositories.
   - Verify create/update/delete/list behavior and computed balances.

## Future Auth Integration

Use Supabase Auth after local MVP sign-off:

- Parent accounts map to `auth.users`.
- `family_members` maps users to `families` with roles such as `parent`, `guardian`, and later `child`.
- Current `LOCAL_PARENT_USER_ID` maps to `auth.uid()` in production.
- Children can initially remain parent-managed profiles without Auth accounts.
- Optional child login can be added later with restricted policies.
- `created_by`, `reviewed_by`, `sender_user_id`, and `awarded_by` should use `auth.uid()`.

## Future Storage Integration

Use Supabase Storage after Auth and RLS are stable:

- Replace local `data_url` fields with storage paths.
- Suggested buckets:
  - `family-avatars`
  - `child-avatars`
  - `share-media`
  - `mailbox-media`
  - `special-day-images`
  - `dream-covers`
- Suggested path pattern:
  - `{family_id}/{child_id}/{entity}/{entity_id}/{filename}`
- Table rows should store `bucket`, `storage_path`, `mime_type`, `file_size_bytes`, and media metadata.
- Signed URLs should be generated at read time, not stored in tables.
- Upload validation should enforce MIME type, size limits, and family ownership.

## Mapping Confirmation

Every current `LocalDataRepository` method has a matching `SupabaseDataRepository` skeleton method. The main implementation gap is not method coverage; it is async behavior. The current UI contract is synchronous because localStorage is synchronous. Before enabling Supabase, choose one of these approaches:

1. Add an async repository contract and update UI data loading states.
2. Keep `getState()` as a cached client state and let Supabase methods update local cache plus realtime subscriptions.

Approach 1 is cleaner for production. Approach 2 minimizes UI changes but adds cache complexity.
