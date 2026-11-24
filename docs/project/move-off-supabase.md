# CupMaster 遷移至 Neon 與 Better Auth

分支為 `chore/move-off-supabase`，基準提交是 `aaa2038`。第 1 週工作單前三項已完成，Quick Prepare v18 為 `855eadf`，濾杯相機對位為 `aaa2038`。

- `db/migrations/0001_init.sql` 合併 Better Auth CLI 產生的 UUID schema 與原本六張產品資料表。保留外鍵、索引、revision 與更新時間 trigger。已在新 Neon 套用並重跑一次。
- `/api/auth/[...all]` 提供 email 與密碼登入。暱稱沿用 REQ-39b 確認流程，搬移期間保留已確認的暱稱。第一階段延後 email 驗證。
- `/api/cloud/[resource]` 驗證 Better Auth session 後，以 session 帳號限定查詢及更新範圍。HTTP repository 的帳號標頭只用來阻擋帳號切換後的過期請求。
- `RUNTIME_REPOSITORY_MODE` 維持 `local`。原 Supabase 遠端專案由使用者驗收後處理。

## 驗證

- 完整測試含新 Neon 雙帳號 API 驗證，共 1,001 個測試通過。六張表的匿名請求回 401，帳號 B 無法讀取、更新或刪除 A 的資料，請求中的偽造 `user_id` 不影響 SQL 所有權。
- lint、typecheck 與 production build 通過。
- 以 390×844 的 Edge 驗證註冊、暱稱確認、登出、再次登入與 `/migration`。帳號 A 搬移一杯合成資料後，帳號 B 的雲端 Brew 查詢回傳 0 筆。截圖在 [move-off-supabase](../collab/qa-2026-11/move-off-supabase/)。
- 本機驗證先配置 `.env.local`，再依序執行 `npm run db:migrate` 和 `npm run dev`。整合測試使用 `CUPMASTER_AUTH_TEST_URL=http://localhost:3000`。

請審查 session 所有權與 revision 條件、Profile 合併時的暱稱保留，以及 Recipe Snapshot 更新限制。
