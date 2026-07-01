# Core RLS Rules

實際可執行 SQL 位於：

- `supabase/migrations/003_core_rls_and_storage.sql`

## 身分模型

- 家長：Supabase Auth `auth.uid()`，並透過 `family_members` 判斷家庭與角色。
- 孩子平板：受控 JWT 必須包含 `child_id` 與 `child_device_id`。
- 後端工作：使用 `service_role`，僅限可信任伺服器或 Edge Function。

## Helper functions

- `current_child_id()`
- `current_child_device_id()`
- `is_family_member(family_id)`
- `has_family_role(family_id, roles[])`
- `can_write_family(family_id)`
- `is_child_device_for_family(family_id)`
- `is_current_child(child_id)`

上述函式已撤銷 `public` 執行權，只授權 `authenticated`。

## 權限矩陣

| Table | Parent | Child device | Trusted backend |
| --- | --- | --- | --- |
| `children` | 同家庭讀取；guardian 以上寫入 | 只讀自己 | 全權 |
| `tasks` | 同家庭讀取與管理 | 只讀自己並提交完成 | 建立獎勵交易 |
| `stars` | 同家庭唯讀 | 自己唯讀 | 唯一寫入者 |
| `dreams` | 同家庭管理 | 讀取自己；可提出待核准夢想 | 狀態自動化 |
| `dream_funds` | 同家庭唯讀 | 自己唯讀 | 唯一寫入者 |
| `shares` | 同家庭審核與管理 | 建立、編輯自己的草稿與重新送審 | 通知與自動化 |
| `share_media` | 同家庭管理 | 自己草稿的媒體新增與刪除 | Storage cleanup |
| `encouragement_cards` | guardian 以上建立與管理 | 讀取收件卡片並標記開啟 | 排程寄送 |
| `screen_time_logs` | 同家庭唯讀 | 自己唯讀 | 唯一寫入者 |
| `special_days` | guardian 以上管理 | 讀取家庭共同或自己的事件 | 提醒排程 |
| `notifications` | 只讀自己的通知並更新已讀 | 只讀自己的通知並更新已讀 | 唯一建立與發送者 |

## 流水帳限制

`stars`、`dream_funds`、`screen_time_logs` 對 `authenticated` 只授權 `select`。寫入必須由：

- service-role backend；
- Supabase Edge Function；
- 後續建立的受控 `security definer` RPC。

一般使用者不能直接新增、修改或刪除流水帳。

## Child update guards

除了 RLS，migration 另建立 trigger guard：

- 孩子提交任務時只能修改完成欄位。
- 孩子編輯分享時只能修改內容與送審欄位。
- 孩子開啟鼓勵卡時只能修改 `status`、`opened_at`。
- 通知收件者只能修改 `read_at`。

這些 guards 防止使用同一個 `authenticated` database role 時越權修改其他欄位。

## Storage

所有 buckets 都是 private：

- `profile-avatars`
- `child-avatars`
- `family-media`
- `family-documents`

Storage policies 以 path 第一層的 `family_id`、第二層的 `child_id` 驗證家庭與孩子身分。檔案不可使用公開 URL，應透過 signed URL 讀取。

