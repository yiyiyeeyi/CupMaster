# 批次 2 C：Collection

新增真實 Collection、手動新增／編輯 Bean 頁面，底部導覽為 Discover／Collection／Brew／Journal／Me。豆子與方案兩個分頁；方案只列已儲存的下次沖煮準備。豆袋牆採文字與 tile 底，不使用假照片、星等或庫存。

首次進入只讀舊紀錄的豆名＋烘焙商候選，明確確認才建立；可全選或略過。既有 Brew 不改寫。讀取失敗提供重試，不把缺失資料當成零次。刪除中斷的 unlink 可在 Collection 重試。

驗證：lint 無警告、typecheck、67 檔／959 tests 與 npm run build 通過。涵蓋讀取零寫入、明示匯入後歷史原件不變、略過不建實體、方案來源與導覽安全返回。390×844 驗證 Collection／方案／手動表單。首次截圖發現 CSS 產出仍有舊四格；清除本機 .next/cache 後乾淨重建確認為五格。過多舊測試伺服器曾導致本機記憶體不足，關閉後乾淨重建通過；不宣稱部署環境已驗證。
