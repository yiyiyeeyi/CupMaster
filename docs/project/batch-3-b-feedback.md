# 批次 3 B：五星回饋與只儲存

FlavorFeedback 儲存 schema 的 stars／aroma／tasteTags 與 overallImpression 均選填；新輸入 schema 要求 stars 為 1–5 整數。舊印象不換算星等，新回饋不偽造 overallImpression；顯示／規則分析優先 stars，沒有才顯示舊印象。

新版表單五顆星、九個底線文字標籤、七條可不填的滑桿與筆記。未填滑桿為淡色並標「選填」，只有明確操作才記值，右側可填／清除；不把視覺中央位置當使用者選擇。原有 balance 不在新表單出現，服務保留舊值；舊 flavorNotes 不轉為 tasteTags 並於編輯時原樣保留。

只儲存不呼叫分析；儲存＋AI 先完成保存，再執行現有本機規則分析並前往分析頁。儲存失敗保留輸入可重試。沒有強迫 Bean、器材或回饋才能保存 Brew。

preflight 分別阻擋 stars／aroma／tasteTags 與無舊 overallImpression 的新回饋；Notion REQ-37b 已補 mapper 清單。TDS 沒新增欄位；未改 SQL／雲端。
驗證：lint 無警告、typecheck、69 檔／973 tests、build 全過；包含新評分必填整數星等、舊資料仍讀、aroma／tags round-trip、舊欄位保留、只儲存不分析、分析優先星等，以及各新欄位個別搬移阻擋。手機完整流程於 C 檢查。
