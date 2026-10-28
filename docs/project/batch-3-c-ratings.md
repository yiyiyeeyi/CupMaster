# 批次 3 C：真實星等、最佳一杯與比較

Collection 顯示完成杯數與有 stars 的最佳 N/5；沒有星等不顯示最佳。Bean Detail 使用同一聚合，展示最好一杯星數及全部紀錄。Journal、Bean Detail 最近紀錄與這一杯共用 BrewRating，星等優先，舊印象以原文字顯示。

比較以同 beanId 為準；匯入的舊紀錄沿用既有唯一豆名＋烘焙商／legacyKeys 關聯，歧義不猜。依完成時間、建立時間及 id 排序，只比較緊接上一杯，上一杯沒星等不跨越它比較更早杯。相等不顯示箭頭；↑ 使用 green、↓ 使用 accent，另含明確 aria-label。讀取有 rejected 警告時不顯示不完整資料的最佳值或比較。

沒有新增持久化欄位、SQL 或雲端功能。測試涵蓋純舊印象不換算、未完成不計最佳、跨豆子隔離、未評分中斷、升降／相等、不改輸入，以及舊豆名唯一關聯與歧義。

手機流程：手動新增 Bean，完成第一杯；無星提交顯示錯誤，填三星、標籤與 aroma 後只儲存，分析仍為 not_requested、沒有偽造 impression，未碰的滑桿不寫值。再沖同包第二杯五星，儲存＋AI 先保存再完成 local_mock 分析；六頁呈現真實星等、最佳5/5與上升箭頭。舊回饋仍顯示「喜歡」，進入編輯時星等未選，新增星等後原 balance／flavorNotes／overallImpression 仍保留。下調第二杯星等檢查下降箭頭。

截圖後把滑桿改細線、參數格縮緊；歷史沒有實際段落開始時間時不再用配方時間冒充，Recipe 畫面仍顯示配方時序。截圖位置為本次 QA screens-batch3；只宣稱瀏覽器390×844，不宣稱實機。

最終驗證：lint 無警告、typecheck、70 檔／978 tests、npm run build 全過；更新後再跑完整兩杯流程與六頁截圖，均為390×844且scrollWidth=390。儲存＋AI 的 provider 為 local_mock、狀態 completed；下降箭頭 aria-label「比同豆子上一杯低 3 顆星」，computed color 為 rgb(138,63,36)，即 accent。
