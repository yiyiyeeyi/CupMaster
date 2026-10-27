# 批次 1：UI 階段 1

2026-10-27；feature/camera-brew-runtime。

Journal 完成紀錄改緊湊列（真實豆名／配方名、濾杯、粉水比）；保留原篩選與下次想沖的編輯、刪除、開始動作。不新增假豆袋、星等、社群資料或統計。Recipe Detail 與這一杯使用 BrewParameterGrid／BrewSteps 共用 3×2 與 STEPS 版型，未知欄位省略；數值標示「實際」或「配方目標」，不將目標寫入實際值。這一杯兩狀態仍維持既有流程。

Live Brew 共用全螢幕 HUD，保留 setup、相機資源、計時、語音、離頁恢復與保存錯誤重試。無鏡頭深底、目標水量、當前與下一段、分段進度條、暫停與下一段；段長按已知秒數比例，目前填滿比例在暫停時固定，換段動畫尊重 reduced motion。沒有即時重量或剩餘重量。既有完成段不可倒退重寫，未加入會改歷史結果的「上一段」操作。

明確滴濾段用 RecipeStep.pourMethod="drain"；等待使用者按「已濾乾，下一段」，不以固定秒數自動完成，也不由 foreground recovery 推進。這個選填欄位先提供 runtime 支援；階段 2 再接選單。七種 enum 為 circle／center／outward／inward／coin／excavate／drain，需納入 REQ-37b mapper 清單。舊步驟缺欄位沿用原行為，不改 Snapshot、A/B 座標或遠端 schema。

驗證：lint／typecheck／完整測試／webpack build；新增滴濾等待、暫停不前進、手動換段、foreground catchup、手動 pause 冪等與排除暫停時間測試。手機 QA 使用隔離瀏覽器走「Quick Prepare → 拒絕相機 → 計時語音 → 換段 → 自動保存 → 這一杯 → Journal」，並另驗滴濾。Recipe／setup／HUD／complete／Journal／drain 均以 390×844 截圖，寬度 390；圖在本次 visualizations/batch1-qa/screens-stage2。

仍未實作：Collection、Profile 新頁、AI／付費切分、拍攝／錄影、分享、Onboarding。Google Fonts 的既有 Next lint warning 留待 Claude 認領區釋出；其餘 lint 無警告。
