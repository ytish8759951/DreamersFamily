# Supabase 建立步驟

## 1. 前置需求

- 已建立 Supabase project。
- 可使用 Supabase CLI；本專案命令範例採 `npx supabase`。
- 已登入 CLI：`npx supabase login`。
- 專案根目錄為 `little-dreamers-family`。

## 2. 連結遠端專案

```powershell
npx supabase link --project-ref $env:SUPABASE_PROJECT_REF
```

CLI 會要求資料庫密碼。不要將密碼寫入 repository。

## 3. 檢視將執行的 migration

```powershell
npx supabase migration list
npx supabase db diff --linked
```

確認會依序套用：

1. `001_initial_schema.sql`
2. `002_core_product_schema.sql`
3. `003_core_rls_and_storage.sql`

## 4. 套用 migration

```powershell
npx supabase db push
```

此操作會建立：

- 所有基礎表與 11 張核心資料表
- Foreign keys、check constraints、unique constraints
- Indexes 與 balance views
- RLS helper functions 與 policies
- 4 個 private Storage buckets
- Storage object policies

不會建立 seed 或假資料。

## 5. 本機 Supabase 驗證

若 Docker 與 Supabase CLI 已安裝：

```powershell
npx supabase start
npx supabase db reset
npx supabase status
```

`db reset` 只應用於本機開發資料庫，不可對正式環境執行。

## 6. 使用 schema.sql

`supabase/schema.sql` 是 psql 整合入口，會依序 include 三個 migration：

```powershell
psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -f supabase/schema.sql
```

正式 Supabase 專案仍建議使用 `supabase db push`，以保留 migration history。

## 7. 驗證 SQL

### 資料表

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'children',
    'tasks',
    'stars',
    'dreams',
    'dream_funds',
    'shares',
    'share_media',
    'encouragement_cards',
    'screen_time_logs',
    'special_days',
    'notifications'
  )
order by table_name;
```

### RLS

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'children',
    'tasks',
    'stars',
    'dreams',
    'dream_funds',
    'shares',
    'share_media',
    'encouragement_cards',
    'screen_time_logs',
    'special_days',
    'notifications'
  )
order by tablename;
```

### Storage buckets

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in (
  'profile-avatars',
  'child-avatars',
  'family-media',
  'family-documents'
)
order by id;
```

## 8. 正式環境注意事項

- `SUPABASE_SERVICE_ROLE_KEY` 只能存在後端或 Supabase Edge Function。
- 前端只能使用 anon/publishable key。
- 孩子平板 JWT 必須由可信任後端簽發，並包含 `child_id` 與 `child_device_id`。
- 推播 token、通知寄送與流水帳寫入後續應由 service-role backend 處理。
- 不要直接修改已執行的 migration；後續變更新增 `004_...sql`。
