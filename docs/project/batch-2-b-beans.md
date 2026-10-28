# 批次 2 B：本機豆子資料

獨立 cupmaster:beans v1 zod envelope，欄位全選填，不記庫存或剩餘克數。新 Bean 有獨立 id／建立更新時間與刪除 tombstone。損壞原件不覆寫；儲存失敗保留輸入可重試。

Brew 與準備新增 beanId，Snapshot.bean 複製完整顯示資料；編輯 Bean 不追寫歷史。Quick Prepare 從庫中選取或新增，也可不選；直接從 beanId query 選入時仍走安全入口。已刪除的過期選取會解除 id、保留顯示快照，不阻擋沖煮。

刪除先記 tombstone／unlinkPending，再逐筆解除 Brew 與準備連結，Snapshot 原樣保留；失敗保留 pending 可重試。庫中刪除原件保留，避免舊資料再次匯入復活。匯入候選以豆名＋烘焙商整理，不在讀取時建立；只有明確 selected IDs 確認才整批寫入，也可略過。Collection 的首次詢問在 C 接 UI。

雲端搬移 fail closed：Bean 庫（含 tombstone）、損壞 Bean 庫、beanId、豐富 Bean Snapshot 額外欄位與 A 刻度均阻擋。已補 REQ-37b Notion mapper 待辦；未動 SQL／遠端 schema。

驗證：lint 無警告、typecheck、66 檔／953 tests 與正式 npm run build 通過。測試包含全欄位 round-trip、舊記錄不改、明示匯入／略過、編輯不改歷史、刪除 pending 重試、過期選取不再關聯，以及新庫／損壞庫在遠端讀取前阻擋。
