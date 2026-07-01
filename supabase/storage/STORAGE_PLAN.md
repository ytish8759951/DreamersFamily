# Storage 規劃

## Buckets

| Bucket | Public | 用途 |
| --- | --- | --- |
| `profile-avatars` | false | 使用者頭像 |
| `child-avatars` | false | 孩子頭像 |
| `family-media` | false | 成長照片、影片、作品圖 |
| `family-documents` | false | 健康、學校、證明文件 |

## Path 規則

```text
profile-avatars/{user_id}/{asset_id}.{ext}
child-avatars/{family_id}/{child_id}/{asset_id}.{ext}
family-media/{family_id}/{child_id}/{yyyy}/{mm}/{asset_id}.{ext}
family-documents/{family_id}/{child_id}/{document_type}/{asset_id}.{ext}
```

## 權限原則

- 所有 bucket 預設 private。
- 兒童照片、影片、文件不可 public。
- 讀取使用 signed URL。
- 寫入前必須確認使用者是該 `family_id` 的 `owner`、`admin` 或 `guardian`。
- 檔案上傳成功後必須建立 `media_assets` 記錄。
- 刪除 `media_assets` 後，由背景工作清除 Storage 實體檔案。

## 建議限制

| 類型 | MIME | 單檔上限 |
| --- | --- | --- |
| 圖片 | JPEG、PNG、WebP | 10 MB |
| 影片 | MP4、MOV | 200 MB |
| 文件 | PDF、JPEG、PNG | 20 MB |

