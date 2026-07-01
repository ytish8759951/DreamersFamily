# 推播通知規劃

## 推播 Provider

第一版建議使用下列其中一種：

- Expo Push Notifications：若第二階段採用 Expo mobile app。
- Firebase Cloud Messaging：若需要 iOS、Android、Web 共用推播基礎。

## 資料表

推播相關資料表：

- `device_tokens`
- `notification_preferences`
- `notification_events`
- `reminders`

## 事件類型

| Event | 說明 |
| --- | --- |
| `growth_record_created` | 新增成長記錄 |
| `media_uploaded` | 新增照片或影片 |
| `reminder_due` | 提醒到期 |
| `milestone_achieved` | 完成里程碑 |
| `weekly_digest` | 每週摘要 |

## 發送流程

1. 使用者建立資料，例如成長記錄或提醒。
2. Edge Function 或 database trigger 建立 `notification_events`。
3. Scheduled Function 撈取待發送事件。
4. 檢查接收者仍為 active family member。
5. 檢查通知偏好與 quiet hours。
6. 取得 active device tokens。
7. 呼叫推播 provider。
8. 更新事件狀態為 `sent` 或 `failed`。

## Payload 範例

```json
{
  "family_id": "uuid",
  "child_id": "uuid",
  "type": "growth_record",
  "target_id": "uuid",
  "screen": "child_timeline"
}
```

## 安全原則

- 推播內容避免放入完整敏感資料。
- Payload 不包含 signed URL。
- 發送前再次檢查 family membership。
- device token 只允許使用者管理自己的 token。

