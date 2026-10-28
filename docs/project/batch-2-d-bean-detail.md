# 批次 2 D：Bean Detail

真實 /beans/[beanId]，Collection 卡片直接開啟。主視覺為文字 tile＋靠上豆名資料；BEAN PROFILE 兩欄兩行，只顯示已知產區、莊園、品種、烘焙日。更多展開處理法、產季、海拔、Agtron、拼配，沒有資料不放佔位符。

我的紀錄沿用與 Journal 相同的 BrewJournalRow，初始最近三杯，可展開全部。次數只計 completed，優先 beanId；舊未連結的豆名＋烘焙商只在唯一匹配時顯示。編輯名稱後保留舊 identity，歷史 snapshot 不改。沒有虛構星等、配方推薦或 AI。

編輯豆子／用這包沖固定於導覽上方，後者傳 beanId 與安全 returnTo 給 Quick Prepare。選豆仍選填；找不到豆子可回 Collection，讀取錯誤可重試。順帶修正 BeanEditor 的 Enter 僅從輸入框觸發儲存，取消按鈕的鍵盤操作不會誤儲存。

驗證：lint 無警告、typecheck、67 檔／959 tests 與 npm run build。Production 390×844 實際新增全欄位 Bean、Collection 卡片進詳情、更多展開、用這包沖、儲存方案、完成手動沖煮、查看共享 Journal 列、改名後歷史保留原名稱、第二杯帶新名稱、刪除解除連結且 snapshot 原件相同。另複製實際完成的 QA Brew 作舊紀錄案例，先出現詢問、全選後明確加入，驗證 Brew 原始 JSON 完全不變。截圖 screens-batch2-d，無水平捲動；這是瀏覽器手機視窗驗證，未宣稱實機驗證。

Notion 已補 B／C／D 對應追蹤項；決策頁 407e841a-44e3-8134-93cc-d93d0cf5d02a。REQ-37b 維持未實作，新增本機欄位搬移仍阻擋。未變更 SQL、雲端或部署。
