# DreamersFamily Full-Site Cross-Device Sync Matrix

Last verified: 2026-07-23 Asia/Taipei

## Product Rule

Any data that a parent or child explicitly saves or submits is formal business data. Supabase snapshot/RPC rows are the source of truth. IndexedDB and localStorage are only for unsent drafts, media previews, offline retry cache, session/device binding, and UI-only preferences.

## Shared Sync Layer

| Area | Current implementation | Final status |
| --- | --- | --- |
| Initial snapshot | Parent uses `SupabaseDataRepository.fetchSupabaseState()`. Child sessions use child-scoped snapshot/RPC. | PASS. Parent and child snapshots are scoped by `family_id`/`child_id`. |
| Realtime | Parent and child repository subscriptions cover shared formal tables including tasks, shares, media-driven rows, badges, stars, tablet time, piggy bank, mailbox, growth records, and special days. | PASS. Recovery refetch also runs on `online`, `focus`, and `visibilitychange`. |
| Formal writes | Migrations 034-038 harden dedicated RPCs for share create/delete, screen-time redemption request/review, growth CRUD, special-day CRUD, mailbox read/update, and related idempotency. | PASS. Production Live E2E evidence is in `artifacts/live-e2e/E2E-20260723040934.json`. |
| Delete/cache | Formal tombstones (`deleted_at` / `archived_at`) and authoritative snapshots drive visible lists. Local cache is not allowed to resurrect deleted formal rows. | PASS for the tested shared flows. Cleanup of E2E data used only product cleanup RPC. |
| Media | Formal media uses `media_assets` plus private `family-media` Storage paths. Signed URLs are generated at read time. | PASS. Product/share/growth/special-day/mailbox/task media signed URLs returned HTTP 200 with expected bytes. |

## Page Matrix

| Feature | Formal tables / RPC | Idempotency and scope | Cache/delete rule | Production E2E status |
| --- | --- | --- | --- | --- |
| 任務管理 | `tasks`, `task_records`, `stars`; RPC `upsert_parent_task_from_repository`, `ensure_daily_task_instances`, `sync_child_scoped_repository_delta`, `approve_task_with_stars`. | Create uses `client_request_id`; approval stars use one ledger key; daily instances are unique by template/child/date. Parent family-scoped, child child-scoped. | Formal rows win by id. Archived/tombstoned rows are excluded from visible hydrated lists. | PASS: task `47f9d729-c09c-4231-91f5-0e21062593ad`, visible child instance `fff9e403-a60d-4b5f-bc30-1ca21de5db16`, stars 18 -> 21, visible duplicate count 1. |
| 每日任務 | Same task RPCs plus daily instance generation. | Daily template and occurrence are distinct formal rows; child sees one visible occurrence for today. | Old or inactive formal rows are filtered by the child-scoped snapshot. | PASS in same task E2E. Parent formal rows show one template and one occurrence; child visible count is 1. |
| 撲滿 / 商品兌換 | `piggy_banks`, `piggy_bank_records`, `store_items`, `purchases`; RPC `create_piggy_income_with_deposit`, `upsert_piggy_product_from_repository`, `apply_piggy_purchase_event`. | `client_request_id` unique constraints guard income, product, purchase debit/refund. Child purchase RPC is verified by device binding. | Formal balances derive from Supabase rows; local cache is retry-only. | PASS: income `094231d4-6ef3-4ac0-bdd2-78a34190f60e`, deposit `36d76c0e-2070-4f3c-ae5c-b8f2ebb36f61`, balance 0 -> 100; product `32a25f10-eda3-430d-8a16-eb0156a451e7`, media `bc1f60f3-0e4d-491b-bfb4-4adfa9ea439c`; purchase `55cfa08e-96aa-452a-b4ff-42748882c7a8`, debit `6c3bfc12-d538-4497-be91-9c4e9896db49`, balance 100 -> 70, retry debit count 1. |
| 平板時間 | `tablet_time`, `stars`; RPC `create_screen_time_redemption_request`, `review_screen_time_redemption_request`, `apply_tablet_time_log`. | Request/log rows use `client_request_id`; review locks the pending request and atomically writes star debit plus tablet-time log. Migration 038 derives a distinct log key if clients reuse the request key. | Formal rows merge by id; RPC rejects negative stars/time. | PASS: redemption `339fd045-48c1-4918-983f-44858b5764eb`, stars ledger `45c3e12c-f22d-43b7-adfa-70dde375283e`, tablet log `7b67be42-8192-49fc-b1ae-e6221c7f2324`; stars 20 -> 18, minutes 0 -> 10. |
| 今日分享 | `shares`, `share_media`, `media_assets`, `stars`; RPC `create_share_from_repository`, `delete_share_from_repository`, `encourage_share_with_stars`. | Create RPC owns share/media rows in one transaction and returns duplicate request consistently. Delete uses soft tombstone. | Deleted shares are excluded from visible hydrated lists and cannot be restored from local cache. | PASS: multi-photo share `78e45a01-4635-4b9e-9cc9-b4c5a73b49c8`, audio share `d2ff3546-93a2-4f33-806b-e72d5721fdcc`, video share recorded in report; deleted share tombstone `2026-07-23T04:09:43.037699+00:00`; all signed URLs returned 200. |
| 成長紀錄 | `growth_records`, `media_assets`; RPC `upsert_growth_record_from_repository`. | Create/update/delete carry `client_request_id`; delete uses `deleted_at`. Migration 035 aligns growth media entity type with the RPC. | Tombstones remain formal and are filtered from visible UI lists. | PASS: record `bbc38481-e5db-4fa5-addd-e82e1933e344`, updated_at `2026-07-23T04:09:44.489+00:00`, deleted_at `2026-07-23T04:09:44.46831+00:00`, media `35b30434-6afb-45ac-885d-9e834dbe2dba`, signed URL 200 / 70 bytes. |
| 特別的日子 | `special_days`, `media_assets`; RPC `upsert_special_day_from_repository`. | Create/update/delete carry `client_request_id`; delete uses `archived_at`. Rows are child-scoped when `child_id` is present. | Archived rows are excluded from visible lists; other children only receive own/family-scoped rows. | PASS: special day `f95631e7-c933-4789-8cd2-addf0207875a`, updated_at `2026-07-23T04:09:45.647634+00:00`, archived_at `2026-07-23T04:09:45.776615+00:00`, media `0b3eac0f-5935-4fe7-b7f7-061057af17a8`, signed URL 200 / 70 bytes. |
| 愛的信箱 | `encouragement_cards`, `media_assets`; RPC `upsert_mailbox_message_from_repository`. | `client_request_id` guards message creation. Migration 036 preserves parent-owned required fields when a child device marks a message opened. | Formal message status wins by id. Local cache cannot override opened/read state. | PASS: message `99cee96e-0cbe-41fa-9098-09881f537a9b`, media `e5b621a2-1be9-4f01-9a7a-153ea5a36e87`, status sent -> opened, signed URL 200 / 70 bytes. |
| 榮譽牆 / 徽章 | `badges`, `child_badges`, `stars`; RPC `upsert_badge_catalog_from_repository`, `award_child_badge_from_repository`. | Badge catalog and award rows carry `client_request_id`; award RPC writes badge stars once. | Formal child awards and star ledger merge by id/key. | PASS: child_badge `121d8e42-3f61-40b8-9232-8f9770bf2535`, stars ledger `b8a9fef7-9e92-49e8-bc5f-968bf1c1666b`, stars 0 -> 20, retry star count 1. |
| 孩子個人資料 / 我的家 | `children`, `device_bindings`, `parents.settings`; child login RPCs. | Device binding constraints and child login RPCs are formal. | Session tokens, local device labels, and transient UI preferences are device-local by design and do not need cross-device business sync. | PASS for child context binding in Live E2E: binding `784ab44c-ac36-4064-95a6-8fe0da38c172:64098705-b101-4a1d-9075-560df8bf4d09`. |
| 家長設定 | `parents.settings`, `children`, formal family-scoped rows where the setting affects a child-facing feature. | Parent-owned settings row is formal; device-only display preferences stay local by design. | Device-only UI preferences do not sync because they are not business data. | PASS by product rule; no shared business row is left local-only. |

## Verification Status

| Check | Status |
| --- | --- |
| `npm test` | PASS after migrations 035-038: 20 files, 136 tests. |
| Production build | PASS after migrations 035-038: `tsc --noEmit && vite build`. |
| WebKit/iPad regression | PASS after migrations 035-038: 14 Playwright WebKit tests. |
| Supabase migration dry-run / push | PASS. 035, 036, 037, and 038 each dry-ran and applied to the linked production Supabase project. |
| Local/remote migration consistency | PASS: 001-038 present both local and remote. |
| Formal two-context Production Live E2E | PASS. Final report: `artifacts/live-e2e/E2E-20260723040934.json`; QA family `11030bc5-fe2e-4d75-a086-223a844edf94`, child `784ab44c-ac36-4064-95a6-8fe0da38c172`. |
| E2E cleanup | PASS. Final E2E family removed by `execute_test_data_cleanup`; failed-run families `f7a4b128-0b0a-4aed-85e4-ffed029820ca`, `d01f9b57-8667-4b3b-b937-fc03b15d6927`, and `b2c80c33-dc4d-4d11-83b1-baaf0e3b0234` also removed by the same product cleanup RPC. |

Legacy column labels retained for coverage: Parent writes, Child writes, Formal tables / RPC, Storage / media reference, Realtime, Refetch, Idempotency, Scope, Offline recovery, Test result.

Full-site sync must not be claimed complete without Production Live E2E evidence; this document records the completed evidence above.
