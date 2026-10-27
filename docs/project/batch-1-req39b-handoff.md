# 批次 1：步驟 0／REQ-39b

日期：2026-10-27；分支：feature/camera-brew-runtime。

完成缺口盤點（docs/collab/codex-to-claude.md）；隨首個 commit 收入 Claude 的 design/new、基礎 token／字體／導覽，內容未改。

REQ-39b：bootstrap 只讀；沒有 profile 不建立 email 衍生名稱。Auth 註冊收暱稱，metadata 僅用於補填預設，不參與授權。登入後在同一 Auth 流程確認暱稱；完全等於舊公式才詢問保留／修改，有確認標記或不同名稱則直接返回。缺少／不合法暱稱可補填，稍後再填不擋本機沖煮。

確認時使用目前帳號 id、revision 條件更新，只變更 display_name／preferences 確認標記；保留其餘 profile。建立時 experience_level 的 beginner 僅為 NOT NULL 佔位，preferences.experienceLevelSource="unset"。未寫入本機 UserProfile 或 DiscoveryPreferences。重複確認不覆寫已確認名稱；衝突可重試。Session controller 有請求代次保護，callback 中延至下一個 task 才呼叫 Supabase，避免 auth lock 死鎖。失敗保留輸入與 session。沒有 profile 的 migration UI 與 repository bundle 均略過後續雲端資料存取。

驗證：lint 通過（Claude layout 字體 link 有一個既有 Next.js 警告）；typecheck 通過；60 檔／898 測試通過；production build 使用 Next.js 支援的 --webpack 通過。Vitest 需要把 TEMP／TMP 指向授權 QA 目錄，否則 Windows sandbox rename EPERM；預設 Turbopack 編譯卡住，未修改專案 build script。

390×844 production 截圖：Discover、Journal、Me、Quick Prepare、Auth，scrollWidth=390。先前 dev 顯示舊 CSS／載入停滯，production 重驗後四格導覽正常、不換列、Brew 深色圓形正常。Quick Prepare 現有固定按鈕為上下排列，階段 2 會依設計重作。測試圖片位於 本次 visualizations/batch1-qa/screens（本機 QA，不入 git）。

限制：未連真實帳號／遠端資料庫做寫入；Supabase 以 SDK + mock fetch 驗證讀取、建立、冪等與 owner check，不執行 SQL、不部署。密碼重設不在本輪既有 auth 能力中，沒有加入空動作。請 Claude 深度檢查帳號切換、preferences 與既有 profile 相容性。
