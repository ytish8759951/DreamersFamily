# 本機 MVP 資料模式

狀態：啟用本機資料層，不登入 Supabase、不連線雲端。

## 資料位置

瀏覽器 localStorage：

```text
little-dreamers-family:mvp-db:v1
```

資料庫預設為空，不預載假資料。第一次呼叫資料層時會建立空白結構。

照片、語音與影片在本階段只保存：

- 媒體類型
- MIME type
- 檔名與本機 storage path
- 尺寸及長度 metadata
- 選填 `data_url`

`data_url` 適合小型 MVP 測試檔案，不適合大型影片。正式環境切換 Supabase Storage 後，欄位會改存 private object path。

## 使用方式

```ts
import { localData } from './lib/localData';

const child = localData.createChild({ display_name: '樂樂' });
localData.switchChild(child.id);

const task = localData.createTask({
  child_id: child.id,
  title: '整理玩具',
  reward_stars: 5
});

localData.completeTask(task.id);
localData.approveTask(task.id);
```

各頁面應從 `src/lib/dataRepository.ts` 取得 `dataRepository`，並只依賴
`LocalDataRepository` 的方法，不直接操作 localStorage。

## 清空資料

程式內：

```ts
localData.resetLocalData();
```

瀏覽器 Console：

```js
localStorage.removeItem('little-dreamers-family:mvp-db:v1');
location.reload();
```

也可以在瀏覽器 DevTools：

1. Application
2. Local Storage
3. 選擇目前網站
4. 刪除 `little-dreamers-family:mvp-db:v1`

## 事件更新

資料異動後會：

- 通知 `localData.subscribe(listener)` 訂閱者。
- 在 browser dispatch `little-dreamers-family:local-db-change` 事件。

React 頁面後續可用 Context 或 `useSyncExternalStore` 監聽，不需輪詢 localStorage。

## 切換 Supabase

1. 保留 `LocalDataRepository` 介面。
2. 新增 `SupabaseDataService implements LocalDataRepository`。
3. 將方法內部改為 Supabase table、RPC 與 Storage 操作。
4. 修改 `src/lib/dataRepository.ts`，在應用程式啟動處依環境變數選擇 repository：

```ts
const repository =
  import.meta.env.VITE_DATA_MODE === 'supabase'
    ? supabaseData
    : localData;
```

建議環境變數：

```text
VITE_DATA_MODE=local
```

正式切換後：

```text
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

不要讓頁面直接 import Supabase client，否則無法平順切換資料來源。

## 測試

```powershell
npm run test:local-data
npm run build
```

測試涵蓋：

- 孩子新增、編輯、封存、切換
- 任務建立、完成、審核、星星及時間獎勵
- 夢想存款、進度、達標及完成
- 照片、語音、影片分享與家長審核
- 鼓勵訊息、孩子信箱及已讀狀態
- 平板時間增加、扣除、餘額及流水紀錄
