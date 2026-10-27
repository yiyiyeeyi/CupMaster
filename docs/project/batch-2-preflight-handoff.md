# 批次 2 前置 P1／P2

2026-10-27。遷移 graph preflight 對九類新本機欄位逐一 fail closed，訊息明示保留本機；測試每欄各一筆且不改輸入。A／B 新 schema 也必須延伸此阻擋清單。

build script 固定 next build --webpack：Windows 現有紀錄顯示預設 Turbopack 卡在編譯，而 webpack 可重複完成；沒有證據能把根因定為記憶體或遠端環境問題，也沒有部署驗證。採用已驗證的 bundler，使本機與後續使用 npm run build 的 CI 一致；未改部署設定。

pourMethod 為新注水 canonical，pattern deprecated，只供舊資料顯示。精確 fallback 僅 center→center、spiral→circle；pulse／continuous／immersion 沒有精確對應，保留舊字串，不捏造新語意。REQ-37b 只同步 canonical，舊資料無法無損轉換時須保留 legacy 資訊，不能靜默丟棄。

P2 研磨雙來源依使用者指定由步驟 A 的結構化刻度取代，於 A 一併完成。REQ-37b Notion mapper 清單已補批次 1 全部選填欄位、profiles.preferences 標記與 A／B 待接欄位；未開工雲端／SQL。
