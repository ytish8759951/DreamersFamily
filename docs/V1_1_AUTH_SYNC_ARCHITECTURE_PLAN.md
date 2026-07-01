# Dreamers Family V1.1 登入與同步架構預留

狀態：規劃與架構預留，不立即開發。  
原則：不加入登入 UI，不影響 V1.0 封版；V1.0 只確認 Repository 能承載 `familyId`、`parentId`、`childId`、`deviceId`。

## 1. 登入

V1.1 只有家長需要登入。

支援登入方式：

- Google
- Apple
- Email

登入成功後建立或取得：

- `userId`
- `familyId`

所有雲端資料都歸屬 `familyId`。本機 MVP 階段先使用 local family，登入後再把本機 family 綁定到登入後的 family。

## 2. 小孩端

小孩不用登入。

第一次由家長建立 Family 與孩子資料，例如：

- 沉沉
- 安安
- 奇奇

每台裝置可指定：

- `deviceId`
- `childId`

之後裝置可直接進入指定孩子的首頁。

共用平板模式首頁顯示「今天是誰？」並列出孩子選項：

- 沉沉
- 安安
- 奇奇

點選孩子後進入該孩子首頁。

## 3. 家長 PIN

V1.1 新增四位數 PIN。

需要 PIN 的操作：

- 退出孩子模式
- 切換孩子
- 進入家長管理
- 修改設定
- 回憶錄下載
- 匯出資料
- 重設裝置

V1.0 不實作 PIN UI；只保留未來可以在家長操作前掛上驗證的流程位置。

## 4. Repository 預留欄位

所有 Repository 需要能取得或保存下列 scope：

- `familyId`
- `parentId`
- `childId`
- `deviceId`

目前程式層以 `getRepositoryScope()` 預留這個契約。local mode 回傳：

- `family_id`: local family id
- `parent_id`: local parent id
- `child_id`: 目前選取的孩子，未選取時為 `null`
- `device_id`: local device id

資料表或本機資料仍可維持既有 snake_case 欄位，例如 `family_id`、`child_id`、`created_by`、`created_by_device_id`。未來 API 邊界再轉成 camelCase。

## 5. 未登入與登入後資料歸屬

未登入：

- 自動建立 local `familyId`
- 資料保留本機
- `parentId` 使用 local parent
- `deviceId` 使用 local device

登入後：

- 建立或取得雲端 `familyId`
- 將本機 family 綁定到雲端 family
- 將本機資料依 `familyId`、`childId`、`deviceId` 對應後同步

綁定流程需避免覆蓋既有雲端資料；衝突處理應以新增紀錄、保留歷史、必要時提示家長選擇為原則。

## 6. 跨裝置同步範圍

登入後自動同步：

- 任務
- 分享
- 撲滿
- 信箱
- 特殊日
- 成長紀錄
- 回憶錄

同步策略預留：

- 以 `familyId` 作為最高資料邊界。
- 以 `childId` 隔離每個孩子資料。
- 以 `deviceId` 追蹤孩子裝置來源與解除綁定。
- 以 `parentId` 追蹤家長建立、審核、設定修改等操作。

## 7. 邀請家庭成員

家長可邀請家庭成員加入同一個 family：

- 爸爸
- 媽媽
- 阿公
- 阿嬤

角色與權限 V1.1 再定義；V1.0 不新增 UI 或資料表操作。

## 8. 裝置管理

家長端未來新增「已登入裝置」管理。

裝置顯示範例：

- 沉沉 iPad
- 安安 Android
- 爸爸 iPhone

家長可遠端解除綁定。解除綁定後，該裝置需回到孩子選擇或初始設定流程。

## 9. V1.0 不實作範圍

V1.0 不實作：

- 登入 UI
- Google / Apple / Email Auth
- 家長 PIN UI
- 家庭成員邀請 UI
- 裝置管理 UI
- 雲端同步流程

V1.0 只確認：

- Repository 可支援 `familyId`、`parentId`、`childId`、`deviceId`。
- local mode 仍可獨立運作。
- 目前 V1.0 封版功能不因 V1.1 預留而改變。
