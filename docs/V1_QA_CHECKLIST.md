# Dreamers Family V1.0 QA

## 孩子管理

- [ ] 新增孩子
- [ ] 修改孩子
- [ ] 刪除孩子
- [ ] 切換孩子
- [ ] 孩子頭像正常顯示
- [ ] childId 正常保存

## 任務

- [ ] 建立每日任務
- [ ] 建立習慣任務
- [ ] 建立家事任務
- [ ] 建立挑戰任務
- [ ] 今日任務刷新
- [ ] 每日任務隔天重新產生
- [ ] 昨日未完成任務不帶到今日
- [ ] 待審核任務跨日不消失
- [ ] 孩子完成任務
- [ ] 家長審核任務
- [ ] 任務完成後進入完成任務
- [ ] 星星正確增加

## 撲滿

- [ ] 硬幣可投入
- [ ] 金額正確增加
- [ ] 商品可購買
- [ ] 金額不足不可購買
- [ ] 商品購買後進入購買紀錄
- [ ] 家長端收到購買需求
- [ ] 撲滿總金額正確顯示

## 分享

- [ ] 分享照片
- [ ] 分享影片
- [ ] 分享語音
- [ ] 照片不裁切
- [ ] 影片可播放
- [ ] 語音可播放
- [ ] 分享分類：全部 / 照片 / 語音 / 影片
- [ ] 家長端可看到分享
- [ ] 刪除分享後同步消失

## 信箱

- [ ] 家長發送文字
- [ ] 家長發送圖片
- [ ] 家長發送語音
- [ ] 孩子端可讀取
- [ ] 已讀狀態正常
- [ ] 媒體可正常播放 / 顯示

## 特殊日

- [ ] 新增特殊日
- [ ] 修改特殊日
- [ ] 刪除特殊日
- [ ] 依孩子篩選
- [ ] 倒數天數正確
- [ ] 孩子端顯示生日與特殊日

## 成長紀錄

- [ ] 新增身高
- [ ] 新增體重
- [ ] 修改成長紀錄
- [ ] 刪除成長紀錄
- [ ] 孩子端顯示最新身高體重
- [ ] 回憶冊同步收錄

## 年度回憶冊

- [ ] 家長端可進入回憶冊
- [ ] 依孩子切換
- [ ] 依年份切換
- [ ] 收錄分享照片
- [ ] 收錄分享影片
- [ ] 收錄分享語音
- [ ] 收錄任務完成紀錄
- [ ] 收錄撲滿紀錄
- [ ] 收錄商品購買紀錄
- [ ] 收錄願望完成紀錄
- [ ] 收錄成長紀錄
- [ ] 收錄生日
- [ ] 收錄特殊日
- [ ] 收錄家長年度備註
- [ ] 不收錄徽章

## 匯出

- [ ] 單一孩子年度 ZIP
- [ ] 全部孩子年度 ZIP
- [ ] ZIP 依孩子分資料夾
- [ ] ZIP 內含分享照片
- [ ] ZIP 內含分享影片
- [ ] ZIP 內含分享語音
- [ ] ZIP 內含任務完成紀錄
- [ ] ZIP 內含撲滿紀錄
- [ ] ZIP 內含成長紀錄
- [ ] ZIP 內含 Summary.pdf
- [ ] PDF 含年度摘要
- [ ] PDF 含家長備註

## Storage

- [ ] localStorage 沒有 base64
- [ ] localStorage 沒有 data:image
- [ ] localStorage 沒有 data:video
- [ ] localStorage 沒有 data:audio
- [ ] localStorage 只存 metadata / mediaId
- [ ] IndexedDB 正常保存 Blob
- [ ] 重新整理後資料仍存在
- [ ] 關閉瀏覽器後資料仍存在

## Repository

- [ ] TaskRepository 正常
- [ ] ShareRepository 正常
- [ ] MailboxRepository 正常
- [ ] PiggyRepository 正常
- [ ] MemoryRepository 正常
- [ ] GrowthRepository 正常
- [ ] SettingsRepository 正常
- [ ] ChildrenRepository 正常
- [ ] SpecialDayRepository 正常
- [ ] MediaRepository 正常

## MediaRepository

- [ ] saveMedia 正常
- [ ] getMedia 正常
- [ ] deleteMedia 正常
- [ ] thumbnail 正常
- [ ] objectURL 正常釋放
- [ ] GC dry-run 正常
- [ ] orphan media = 0 或可安全回報

## RWD

- [ ] Desktop 正常
- [ ] Tablet 1024px 正常
- [ ] Mobile 390px 正常
- [ ] Bottom Navigation 不變形
- [ ] Header 不跑版
- [ ] 卡片不裁切

## 上線前

- [ ] npm run test:local-data 通過
- [ ] npm run build 通過
- [ ] http://127.0.0.1:5173 可開啟
- [ ] 不執行 screenshot script
- [ ] 不執行 Playwright
- [ ] 不執行 headless browser
