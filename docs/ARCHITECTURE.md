# 小小夢想家 Family 第一階段架構文件

版本：0.1  
日期：2026-06-17  
狀態：第一階段規劃，不包含畫面開發

## 1. 專案定位

「小小夢想家 Family」是一個全新的家庭兒童成長系統，目標是讓家庭成員共同記錄孩子的成長、里程碑、作品、照片、提醒事項與重要回憶。

本專案不沿用 DEAR ERP 的任何資料表、命名、模組切分或業務架構。資料模型以家庭、孩子、成長記錄、媒體檔案、通知為核心重新設計。

## 2. 第一階段範圍

本階段只交付架構，不開發前端畫面或後端 API：

- 資料表設計
- Supabase Auth 與 Row Level Security 權限設計
- Supabase Storage bucket 與路徑規劃
- 推播通知資料流與資料表規劃
- 專案資料夾結構

## 3. 建議技術基礎

第一階段只規劃，不綁死前端框架。後續若要開發，建議：

- Database：Supabase PostgreSQL
- Auth：Supabase Auth
- File Storage：Supabase Storage
- Push：Firebase Cloud Messaging 或 Expo Push Notifications
- Backend Jobs：Supabase Edge Functions + Scheduled Functions
- Frontend App：可選 Next.js、React Native/Expo 或 Flutter

## 4. 核心資料模型

### 4.1 權限與家庭核心

#### `profiles`

對應 Supabase `auth.users` 的公開使用者資料。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 對應 `auth.users.id` |
| `display_name` | `text` | 顯示名稱 |
| `avatar_url` | `text` | 使用者頭像 URL |
| `timezone` | `text` | 使用者時區 |
| `locale` | `text` | 介面語系 |
| `created_at` | `timestamptz` | 建立時間 |
| `updated_at` | `timestamptz` | 更新時間 |

#### `families`

家庭空間。大部分資料都以 `family_id` 做隔離。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 家庭 ID |
| `name` | `text` | 家庭名稱 |
| `owner_id` | `uuid` | 建立者，參照 `profiles.id` |
| `created_at` | `timestamptz` | 建立時間 |
| `updated_at` | `timestamptz` | 更新時間 |

#### `family_members`

使用者與家庭的成員關係。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 成員關係 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `user_id` | `uuid` | 參照 `profiles.id` |
| `role` | `text` | `owner`、`admin`、`guardian`、`viewer` |
| `status` | `text` | `active`、`invited`、`removed` |
| `created_at` | `timestamptz` | 建立時間 |

角色建議：

| 角色 | 權限摘要 |
| --- | --- |
| `owner` | 家庭擁有者，可管理所有資料與成員 |
| `admin` | 可管理孩子、記錄、媒體、提醒、成員邀請 |
| `guardian` | 可新增與編輯成長記錄、上傳媒體、管理通知偏好 |
| `viewer` | 只能讀取被授權家庭資料 |

#### `family_invitations`

家庭邀請。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 邀請 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `email` | `text` | 受邀 email |
| `role` | `text` | 預設角色 |
| `token_hash` | `text` | 邀請 token 雜湊 |
| `expires_at` | `timestamptz` | 到期時間 |
| `accepted_at` | `timestamptz` | 接受時間 |
| `created_by` | `uuid` | 邀請者 |
| `created_at` | `timestamptz` | 建立時間 |

### 4.2 孩子與成長資料

#### `children`

孩子主檔。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 孩子 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `display_name` | `text` | 顯示名稱 |
| `birth_date` | `date` | 生日 |
| `gender` | `text` | 選填 |
| `avatar_path` | `text` | Storage 頭像路徑 |
| `notes` | `text` | 備註 |
| `created_by` | `uuid` | 建立者 |
| `created_at` | `timestamptz` | 建立時間 |
| `updated_at` | `timestamptz` | 更新時間 |

#### `growth_categories`

成長記錄分類，支援系統預設與家庭自訂。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 分類 ID |
| `family_id` | `uuid nullable` | `null` 表示系統分類 |
| `name` | `text` | 分類名稱 |
| `icon` | `text` | 圖示識別 |
| `color` | `text` | 色碼 |
| `sort_order` | `integer` | 排序 |
| `is_system` | `boolean` | 是否系統預設 |

建議預設分類：

- 身高體重
- 語言發展
- 動作發展
- 情緒社交
- 學習作品
- 生活習慣
- 健康醫療
- 特別回憶

#### `growth_records`

孩子成長記錄主表。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 記錄 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `child_id` | `uuid` | 參照 `children.id` |
| `category_id` | `uuid` | 參照 `growth_categories.id` |
| `title` | `text` | 標題 |
| `content` | `text` | 文字內容 |
| `recorded_on` | `date` | 發生日期 |
| `mood` | `text` | 心情標籤，選填 |
| `visibility` | `text` | `family`、`guardians_only` |
| `created_by` | `uuid` | 建立者 |
| `created_at` | `timestamptz` | 建立時間 |
| `updated_at` | `timestamptz` | 更新時間 |

#### `growth_measurements`

身高、體重、頭圍等可量化資料。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 測量 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `child_id` | `uuid` | 參照 `children.id` |
| `record_id` | `uuid nullable` | 可連到 `growth_records.id` |
| `measurement_type` | `text` | `height_cm`、`weight_kg`、`head_cm` |
| `value` | `numeric(8,2)` | 數值 |
| `measured_on` | `date` | 測量日期 |
| `created_by` | `uuid` | 建立者 |
| `created_at` | `timestamptz` | 建立時間 |

#### `milestones`

系統或家庭自訂里程碑定義。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 里程碑 ID |
| `family_id` | `uuid nullable` | `null` 表示系統預設 |
| `category_id` | `uuid nullable` | 分類 |
| `title` | `text` | 里程碑名稱 |
| `description` | `text` | 說明 |
| `expected_age_months` | `integer` | 參考月齡 |
| `is_system` | `boolean` | 是否系統預設 |

#### `child_milestones`

孩子完成某個里程碑的記錄。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 完成記錄 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `child_id` | `uuid` | 參照 `children.id` |
| `milestone_id` | `uuid` | 參照 `milestones.id` |
| `achieved_on` | `date` | 完成日期 |
| `note` | `text` | 備註 |
| `created_by` | `uuid` | 建立者 |
| `created_at` | `timestamptz` | 建立時間 |

### 4.3 媒體與作品

#### `media_assets`

Storage 檔案的資料庫索引。實體檔案存在 Supabase Storage。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 媒體 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `child_id` | `uuid nullable` | 參照 `children.id` |
| `record_id` | `uuid nullable` | 參照 `growth_records.id` |
| `bucket` | `text` | Storage bucket |
| `path` | `text` | Storage path |
| `mime_type` | `text` | MIME type |
| `file_size` | `bigint` | 檔案大小 |
| `caption` | `text` | 說明 |
| `uploaded_by` | `uuid` | 上傳者 |
| `created_at` | `timestamptz` | 建立時間 |

#### `artifacts`

孩子作品或文件式紀錄，可連結照片或檔案。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 作品 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `child_id` | `uuid` | 參照 `children.id` |
| `title` | `text` | 作品名稱 |
| `description` | `text` | 作品描述 |
| `artifact_date` | `date` | 作品日期 |
| `primary_media_id` | `uuid nullable` | 封面媒體 |
| `created_by` | `uuid` | 建立者 |
| `created_at` | `timestamptz` | 建立時間 |

### 4.4 提醒與通知

#### `reminders`

家庭提醒事項，例如疫苗、回診、活動、生日、成長紀錄提醒。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 提醒 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `child_id` | `uuid nullable` | 參照 `children.id` |
| `title` | `text` | 提醒標題 |
| `description` | `text` | 說明 |
| `reminder_type` | `text` | `vaccine`、`health`、`activity`、`memory`、`custom` |
| `due_at` | `timestamptz` | 到期時間 |
| `repeat_rule` | `text nullable` | iCalendar RRULE 或簡化規則 |
| `status` | `text` | `active`、`done`、`cancelled` |
| `created_by` | `uuid` | 建立者 |
| `created_at` | `timestamptz` | 建立時間 |
| `updated_at` | `timestamptz` | 更新時間 |

#### `device_tokens`

使用者裝置推播 token。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | Token ID |
| `user_id` | `uuid` | 參照 `profiles.id` |
| `provider` | `text` | `fcm`、`expo`、`apns` |
| `token` | `text` | 推播 token |
| `platform` | `text` | `ios`、`android`、`web` |
| `device_name` | `text` | 裝置名稱 |
| `is_active` | `boolean` | 是否有效 |
| `created_at` | `timestamptz` | 建立時間 |
| `updated_at` | `timestamptz` | 更新時間 |

#### `notification_preferences`

使用者在家庭中的通知偏好。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 偏好 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `user_id` | `uuid` | 參照 `profiles.id` |
| `record_created` | `boolean` | 新成長記錄通知 |
| `media_uploaded` | `boolean` | 新媒體通知 |
| `reminder_due` | `boolean` | 提醒到期通知 |
| `weekly_digest` | `boolean` | 每週回顧 |
| `quiet_hours_start` | `time nullable` | 勿擾開始 |
| `quiet_hours_end` | `time nullable` | 勿擾結束 |
| `created_at` | `timestamptz` | 建立時間 |
| `updated_at` | `timestamptz` | 更新時間 |

#### `notification_events`

通知事件佇列。由 Edge Function 或排程處理後送出。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | 事件 ID |
| `family_id` | `uuid` | 參照 `families.id` |
| `recipient_user_id` | `uuid` | 接收者 |
| `event_type` | `text` | 事件類型 |
| `title` | `text` | 通知標題 |
| `body` | `text` | 通知內容 |
| `payload` | `jsonb` | 深連結與上下文 |
| `status` | `text` | `pending`、`sent`、`failed`、`cancelled` |
| `scheduled_at` | `timestamptz` | 預計送出時間 |
| `sent_at` | `timestamptz` | 實際送出時間 |
| `error_message` | `text` | 錯誤訊息 |
| `created_at` | `timestamptz` | 建立時間 |

### 4.5 稽核與安全

#### `audit_logs`

重要異動稽核。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `uuid primary key` | Log ID |
| `family_id` | `uuid nullable` | 家庭 ID |
| `actor_user_id` | `uuid nullable` | 操作者 |
| `action` | `text` | 操作 |
| `target_table` | `text` | 目標資料表 |
| `target_id` | `uuid nullable` | 目標 ID |
| `metadata` | `jsonb` | 額外資訊 |
| `created_at` | `timestamptz` | 建立時間 |

## 5. Supabase 權限設計

### 5.1 權限原則

所有家庭資料都必須以 `family_id` 隔離。使用者只能讀取或操作自己所屬家庭的資料。

基礎規則：

- 已登入使用者只能讀寫自己的 `profiles`。
- 家庭資料只開放給 `family_members.status = 'active'` 的成員。
- `owner` 與 `admin` 可管理家庭設定、孩子、成員邀請。
- `guardian` 可新增與更新孩子成長資料，但不可管理成員角色。
- `viewer` 只能讀取家庭資料。
- Storage 讀寫權限必須與資料表 RLS 一致。
- Edge Functions 使用 service role 時，必須在 function 內重新檢查使用者與家庭權限。

### 5.2 建議 helper functions

在 Supabase SQL 中建立以下安全函式：

```sql
public.is_family_member(target_family_id uuid)
public.has_family_role(target_family_id uuid, allowed_roles text[])
public.can_write_family(target_family_id uuid)
```

用途：

- RLS policy 只呼叫 helper function，避免每張表重複複雜 SQL。
- 權限變更集中管理。
- 後續新增角色時，調整 helper function 即可。

### 5.3 RLS 矩陣

| 資料表 | Select | Insert | Update | Delete |
| --- | --- | --- | --- | --- |
| `profiles` | 自己，或同家庭成員基本資料 | 自己 | 自己 | 不允許 |
| `families` | active member | authenticated user 建立 | owner/admin | owner only |
| `family_members` | 同家庭 active member | owner/admin | owner/admin | owner/admin |
| `family_invitations` | owner/admin | owner/admin | owner/admin | owner/admin |
| `children` | active member | owner/admin/guardian | owner/admin/guardian | owner/admin |
| `growth_categories` | 系統分類或同家庭 | owner/admin/guardian 自訂 | owner/admin/guardian 自訂 | owner/admin |
| `growth_records` | active member，依 `visibility` 過濾 | owner/admin/guardian | 建立者或 owner/admin/guardian | 建立者或 owner/admin |
| `growth_measurements` | active member | owner/admin/guardian | 建立者或 owner/admin/guardian | 建立者或 owner/admin |
| `milestones` | 系統或同家庭 | owner/admin/guardian 自訂 | owner/admin/guardian 自訂 | owner/admin |
| `child_milestones` | active member | owner/admin/guardian | 建立者或 owner/admin/guardian | 建立者或 owner/admin |
| `media_assets` | active member，依關聯記錄可見性 | owner/admin/guardian | 上傳者或 owner/admin | 上傳者或 owner/admin |
| `artifacts` | active member | owner/admin/guardian | 建立者或 owner/admin/guardian | 建立者或 owner/admin |
| `reminders` | active member | owner/admin/guardian | 建立者或 owner/admin/guardian | 建立者或 owner/admin |
| `device_tokens` | 自己 | 自己 | 自己 | 自己 |
| `notification_preferences` | 自己 | 自己 | 自己 | 自己 |
| `notification_events` | 收件者自己 | 系統或 service role | 系統或 service role | 不允許 |
| `audit_logs` | owner/admin | 系統或 service role | 不允許 | 不允許 |

## 6. Storage 規劃

### 6.1 Buckets

| Bucket | Public | 用途 |
| --- | --- | --- |
| `child-avatars` | false | 孩子頭像 |
| `family-media` | false | 成長照片、影片、作品圖 |
| `family-documents` | false | 健康文件、學校文件、PDF |
| `profile-avatars` | false | 使用者頭像 |

全部 bucket 預設 private。所有檔案讀取都透過 signed URL 或應用層授權後取得。

### 6.2 路徑規則

```text
profile-avatars/{user_id}/{asset_id}.{ext}
child-avatars/{family_id}/{child_id}/{asset_id}.{ext}
family-media/{family_id}/{child_id}/{yyyy}/{mm}/{asset_id}.{ext}
family-documents/{family_id}/{child_id}/{document_type}/{asset_id}.{ext}
```

### 6.3 上傳限制

建議限制：

- 圖片：JPEG、PNG、WebP，單檔 10 MB
- 影片：MP4、MOV，單檔 200 MB
- 文件：PDF、JPEG、PNG，單檔 20 MB
- 所有上傳必須建立 `media_assets` 索引記錄
- 刪除資料時，資料庫記錄與 Storage 檔案需使用 background cleanup 同步

## 7. 推播通知規劃

### 7.1 通知來源

第一階段規劃以下事件：

| 事件 | 觸發時機 | 接收者 |
| --- | --- | --- |
| `growth_record_created` | 新增成長記錄 | 同家庭且偏好開啟的成員 |
| `media_uploaded` | 上傳照片或影片 | 同家庭且偏好開啟的成員 |
| `reminder_due` | 提醒到期前或到期時 | 家庭成員或提醒指定對象 |
| `milestone_achieved` | 完成里程碑 | 同家庭且偏好開啟的成員 |
| `weekly_digest` | 每週摘要 | 開啟週報的成員 |

### 7.2 推播流程

1. App 或後端建立資料，例如 `growth_records`。
2. Database trigger 或 Edge Function 建立 `notification_events`。
3. 排程 Edge Function 撈取 `status = 'pending'` 且已到 `scheduled_at` 的事件。
4. 檢查接收者仍是 active family member。
5. 檢查 `notification_preferences` 與 quiet hours。
6. 取得有效 `device_tokens`。
7. 呼叫 FCM、Expo 或 APNs 發送。
8. 更新 `notification_events.status`、`sent_at` 或 `error_message`。

### 7.3 深連結 payload

建議 payload：

```json
{
  "family_id": "uuid",
  "child_id": "uuid",
  "type": "growth_record",
  "target_id": "uuid",
  "screen": "child_timeline"
}
```

## 8. 專案資料夾結構

第一階段建議結構：

```text
little-dreamers-family/
  README.md
  docs/
    ARCHITECTURE.md
  supabase/
    migrations/
      001_initial_schema.sql
    policies/
      rls_policies.sql
    storage/
      STORAGE_PLAN.md
  notifications/
    PUSH_NOTIFICATION_PLAN.md
```

第二階段若開始開發，可再加入：

```text
apps/
  web/
  mobile/
packages/
  shared/
  ui/
supabase/
  functions/
  seed.sql
```

## 9. 初版索引策略

建議索引：

- 所有 `family_id`
- 所有 `child_id`
- `growth_records(child_id, recorded_on desc)`
- `growth_measurements(child_id, measured_on desc)`
- `media_assets(record_id)`
- `reminders(family_id, due_at, status)`
- `notification_events(status, scheduled_at)`
- `device_tokens(user_id, is_active)`
- `family_members(family_id, user_id)` unique

## 10. 隱私與安全注意事項

兒童資料屬於高敏感家庭資料，必須採用 private-by-default 設計。

最低要求：

- 不使用 public bucket 儲存兒童照片或文件。
- RLS 必須在所有家庭資料表啟用。
- Storage 路徑必須包含 `family_id`，並用 RLS 驗證 family membership。
- 邀請 token 只儲存 hash，不儲存明文。
- 推播 payload 不放敏感長文或完整照片 URL。
- audit logs 不記錄兒童敏感全文，只記錄必要 metadata。
- 刪除家庭、孩子、媒體時需設計資料保留與永久刪除策略。

## 11. 第一階段交付檢查清單

- [x] 全新專案目錄
- [x] 資料表設計
- [x] Supabase RLS 權限模型
- [x] Storage bucket 與 path 規劃
- [x] 推播通知流程規劃
- [x] 專案資料夾結構
- [ ] 實際執行 Supabase migration
- [ ] 前端畫面
- [ ] 後端 Edge Functions

