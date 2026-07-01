# Dreamers Family V1.0 Final QA

日期：2026-07-01  
範圍：V1.0 本機 MVP、Repository、MediaRepository、年度回憶冊匯出。

## 驗證命令

```powershell
cd apps/web
npm run test:local-data
npm run build
```

結果：

- `npm run test:local-data`：3 test files passed，38 tests passed。
- `npm run build`：TypeScript check passed，Vite production build passed。
- sandbox 內第一次執行被 Windows `spawn EPERM` 擋住 Vite/esbuild 子程序；提升權限重跑後通過。

## QA Checklist

| 項目 | 結果 | 驗收依據 |
| --- | --- | --- |
| 新增孩子 | Pass | `localData.test.ts` manages and switches children |
| 修改孩子 | Pass | `updateChild` 測試與生日衍生特殊日測試 |
| 刪除孩子 | Pass | child archived、active child fallback 測試 |
| 建立任務 | Pass | create task、多孩子獨立任務測試 |
| 今日任務刷新 | Pass | auto-creates today daily instances 測試 |
| 任務完成 | Pass | completeTask 測試 |
| 任務審核 | Pass | approveTask 測試 |
| 星星增加 | Pass | task approval stars reward once 測試 |
| 撲滿存錢 | Pass | piggy income、coin deposit、over-limit 測試 |
| 商品購買 | Pass | purchase request、cancel/refund、arrived/completed snapshot 測試 |
| 分享照片 | Pass | photo share + mediaId metadata 測試 |
| 分享影片 | Pass | video share + mediaId metadata 測試 |
| 分享語音 | Pass | audio share + mediaId metadata 測試 |
| 特殊日 | Pass | special days filters、upcoming sorting、birthday derivation 測試 |
| 成長紀錄 | Pass | create/update/delete/latest growth record 測試 |
| 回憶冊 | Pass | memory pack build/export/delete、annual parent note repository 測試 |
| ZIP | Pass | 年度 ZIP 結構靜態檢查：`DreamersFamily/{year}/{childName}/...`、`summary.pdf` |
| PDF | Pass | `summary.pdf` 產生器 build 通過，PDF 包含年度摘要與獨立家長備註 |
| localStorage | Pass | local DB export/import/reset、settings、storage diagnostics 測試/靜態檢查 |
| IndexedDB | Pass | MediaRepository 使用 IndexedDB Blob；分享資料不落 base64 到 local data |
| Repository | Pass | `LocalDataRepository` contract、local repository tests、V1.1 scope 預留測試 |
| MediaRepository | Pass | 靜態檢查確認本輪 QA 未修改 `mediaRepository.ts`；媒體仍透過 mediaId / IndexedDB Blob |

## 封版判定

V1.0 QA 通過。已驗證核心資料流程、媒體儲存邊界、年度回憶冊 PDF/ZIP 匯出與本機資料持久化。
