# CLAUDE.md — CupMaster 協作說明

> 本檔供 Claude 在後續對話延續上下文。專案規則的權威來源仍是 `AGENTS.md`（前一位 AI / Codex 留下）；
> 最完整的現況盤點是 `docs/project/current-project-state-audit.md`（2026-10-14）。兩者衝突時以 `AGENTS.md` + 使用者最新指示為準。
> 最後更新：2026-10-23。
>
> **產品決策依據**：`docs/product/product-decisions.md`（V1 範圍、版本歸屬、已定案決策）；完整 PRD 與需求在 Notion（連結見該檔）。
> **協作流程**：Codex 與 Claude 角色可互換（一方開發、一方審查），依 `docs/product/collaboration.md`。

## 1. 專案是什麼

CupMaster：行動優先（mobile-first）的 AI 手沖咖啡教練 PWA。核心循環：
**快速開始 → 跟著引導沖 → 保存這杯 → 事後回顧 → 用聚焦的「下一杯（Next Try）」改善**。
能力分五塊：Start / Guide / Reflect / Remember / Equip（Gear Guide 教選器材，My Gear 記錄擁有的器材）。

並行兩條研究線（都在 `feature/camera-brew-runtime` 分支）：
- **A 線（視覺）**：俯拍固定相機 + 手動標定濾杯橢圓 → 偵測手沖壺出水口（spout tip）存在與位置。目前 **未通過跨 session 泛化驗收**，追蹤與瀏覽器模型整合被刻意擋住。
- **B 線（軌跡教練）**：純 TypeScript 的軌跡正規化 / 行為判讀引擎（9D-1/2），已實作並以合成資料測試，尚未接上真實 A 線輸出。

## 2. 技術棧與指令

- Next.js 16.2.10（App Router）、React 19.2.4、TypeScript strict、Tailwind CSS 4（PostCSS）、ESLint 9 flat config、Zod 4、Vitest 4.1.10。
- 選配雲端：Supabase（`@supabase/ssr`、`@supabase/supabase-js`、CLI 釘版於 package.json）。
- **只用 npm**（有 package-lock.json）。未釘 Node 版本；上次稽核主機為 Node 22 / npm 10。
- 視覺研究工具：`scripts/vision/*.py`（Python 3.11 + PyTorch CPU、torchvision、numpy、Pillow、ONNX/ORT、OpenCV）、`*.mjs` 資料集工具；需要 ffmpeg。私有環境在 `.vision-work/`（已 gitignore）。

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck    # tsc --noEmit
npm test             # vitest run（src/**/*.test.ts, scripts/**/*.test.mjs；Node 環境，非瀏覽器 E2E）
npm run build
# 不在 vitest 內的測試：
node --test scripts/vision/*.node-test.mjs
# Python 純函式測試需 ML 環境：scripts/vision/*.test.py
# vision:* npm scripts 用於資料集抽幀/凍結/標註正規化/驗證（會動到私有資料，需使用者授權）
```

- 本機 MVP **不需要任何環境變數**。選配 Auth：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`；CLI 專用 `SUPABASE_PROJECT_REF`。`.env.local` 存在，**不要讀取或印出其值**。
- 相機需 HTTPS 或 localhost 安全環境；語音辨識/合成依瀏覽器與 OS 而異。
- Windows 重灌後 Git 會報 "dubious ownership"：唯讀指令用 `git -c safe.directory=D:/Projects/CupMaster ...`，**不要改全域 git config**。

## 3. 架構與資料流

```
src/app (路由殼)  →  src/components (UI, "use client" 盡量小)
      → src/application (use-case 服務 / session 編排)
      → src/domain (型別、Zod schema、純 reducer、vision 合約、軌跡引擎)
      → src/repositories (LocalStorage repo + mock recipe repo，版本化 envelope v1)
src/infrastructure/camera   相機擷取、10 FPS 取樣、ROI 動態/光線診斷（啟發式，非出水口辨識）
src/infrastructure/voice    Web Speech：zh-TW 語音引導、語音「開始」
src/infrastructure/repositories/repository-composition.ts  唯一組合根；runtime 永遠是 compile-time 的 `local`
src/infrastructure/supabase + src/auth + src/lib/supabase   選配帳號、遠端 repo、一次性 Local→Cloud 複製（含 checkpoint/驗證）
supabase/   migration SQL、RLS 測試 SQL、seed；src/types/database.types.ts 為暫定型別
scripts/vision/  離線研究腳本（產物一律寫到 gitignore 的私有目錄）
docs/       設計與決策文件；docs/vision/ 為各研究任務報告（task-9c*/9d*）
design/     19 張 UI 參考圖（01–19）
```

關鍵檔案：
- 沖煮：`application/brew-factory.ts`（Recipe+輸入→Plan/不可變 Snapshot/Draft）、`application/brew-service.ts`（生命週期指令）、`brew-session-coordinator.ts`
- 下一杯：`application/suggested-plan-service.ts`、`suggested-plan-projection.ts`、`domain/suggested-plan.ts`
- 分析：`application/rule-based-brew-analysis-provider.ts`（確定性的本地「預覽」分析，**沒有接真 AI**）
- Runtime：`domain/brew-runtime/brew-stage-engine.ts`（純 reducer）、`pour-detection-service.ts`、`recipe-runtime-adapter.ts`、`application/brew-runtime/brew-runtime-controller.ts`
- 引導沖煮 V1（9D-4，未提交）：`components/live-brew-draft.tsx` → `components/guided-brew-v1.tsx` → `application/brew-runtime/guided-brew-v1-session.ts` + `dripper-positioning.ts`
- 視覺合約：`domain/vision/manual-dripper-contract.ts`（9C-5.4 凍結）、`hybrid-runtime-contract.ts`、`vision-metrics.ts`
- 軌跡引擎：`domain/vision/trajectory-{types,normalization,behavior,engine}.ts`
- 主要路由：/onboarding /discover /recipes/[id](/prepare) /brew/[id](/prepare,/complete) /journal/[id](/feedback,/edit,/analysis,/plans,/analysis/recommendations/[rid]/plan) /plans/[id] /me /auth /migration；開發用 /dev/brew-vision /dev/demo /dev/migration-qa

## 4. 必須遵守的開發約定（摘自 AGENTS.md 與 docs，仍有效）

產品不變式：
1. **不可**讓 Bean 或器材成為開始沖煮的前提；**不可**讓 Feedback 或 AI 成為保存 Brew 的前提。
2. 每筆 Brew 擁有不可變的 Recipe Snapshot；之後編輯 Recipe 不得改寫歷史。
3. **不可捏造量測值**：實際重量/TDS/萃取率缺值就是 null / 「—」，不要用目標值頂替。
4. 未經明確同意不得改動產品流程；一次只做一個 vertical slice。
5. 秘密金鑰不可放 `NEXT_PUBLIC_*`（唯一例外是 Supabase publishable key）；service-role 與 AI key 只在伺服器端。
6. 登入 ≠ 同步：runtime 永遠 Local；Cloud 5（持續同步）尚未開始。

程式風格：
- 路由只在 `src/app`；共用 UI 在 `src/components`；領域型別/合約在 `src/domain`；文件在 `docs`。路徑別名 `@/*` → `src/*`。
- 禁止 `any` 與雙重斷言（`as unknown as`）。
- 優先 Server Components；`"use client"` 只用於瀏覽器 API / 互動 / client hook，邊界盡量小。
- Components 透過 repository/service 取用資料，**不直接碰 Supabase**；repository 隔離儲存，service 負責 use-case 編排。（已知債：部分元件仍直接 new Local repository。）
- 每輪工作都要跑 lint、typecheck、test、build。
- **不得自動 commit 或 push**；staging/commit 需使用者明確指示。

UI：
- `design/` 圖為視覺參考，**不得自行重新設計**（資訊架構、導覽、元件位置、字級階層、按鈕位置）。但 `docs/design-system.md` 已記錄：當前產品規則（AGENTS.md）凌駕過時的設計元素（五分頁導覽、必填 Bean、AR/相機、Collection 優先、未實作 AI/chat）。目前導覽為 Discover / Brew / Journal（+ Me）。
- 標準頁名不可改：Discover、Recipe Detail、Quick Prepare、Live Brew、Brew Summary、Flavor Feedback、AI Analysis、Journal、Collection、Profile、Ask AI。
- Token 在 `src/app/globals.css`；390px 基準、48px 點擊目標、safe-area、狀態不只靠顏色、Live Brew 重視大字與單手操作。

視覺研究與隱私：
- 私有資料（`data/vision/raw|frames|annotations|exports`、`manifest.json`、`.vision-work/`）**不得開啟、提交或上傳**；只有 3 個 example/schema 檔被追蹤。
- **session-014 為密封外部 holdout、005–010 為外部 benchmark：不可開啟。** 不可在 held-out fold 上調閾值。
- 011–013 為「僅研究用」外部素材，不可用於正式產品訓練；015–019 的使用者授權包含修正後標籤（以 14B 為準）。
- A 線座標合約（9C-5.4）是等向 effective-R：`u=(x-cx)/R, v=(y-cy)/R, R=sqrt(rx*ry)`；B 線 `trajectory-normalization.ts` 用的是去旋轉後各軸各自除半徑。**兩者不一致，整合前需先版本化決議，不可悄悄改其中一邊。**
- 視覺輔助失敗時，計時器/手動沖煮與保存必須仍可用。

## 5. 目前狀態（2026-10-22）

- 分支 `feature/camera-brew-runtime`；HEAD `f37303b`「feat: freeze manual dripper calibration contract」（2026-09-28）。`main` / 本地記錄的 `origin/main` = `2d66342`（pre-camera baseline）。遠端：github.com/yiyiyeeyi/CupMaster。
- **約 84 個檔案未提交**（15 個修改 + 69 個新檔）：9C-5.5→5.16 研究報告與腳本、9D-1/2 軌跡引擎、9D-3 食譜引導事件、9D-4 Guided Brew V1。這些是刻意保留的成果，**不是可丟棄的垃圾**；不要 reset/clean/stash。
- 2026-09-30 之後原始碼沒有新變動；10-14 只新增稽核文件。
- 稽核時（10-14）記錄：51 個測試檔 / 809 個測試、lint、typecheck、build 全數通過（需處理 TEMP 權限問題）。Claude 接手時未能重跑（裝置 shell 不可用、雲端 npm registry 被擋）。
- 原始碼中沒有 TODO/FIXME 標記；未完成事項記錄在文件中。

已知問題（已讀程式碼確認者標 ✔）：
- ✔ P1 新流程無相機替代路徑：`LiveBrewDraft` 將所有 `not_started` 的 Brew 導到 `GuidedBrewV1`，相機被拒/不支援時只有「Retry Camera」，無法手動開始。
- P1 暫停/重啟只作用於記憶體 runtime，持久化的 pause 累計與 startedAt 不同步 → 顯示時間與保存時間不一致。
- P1 stage 完成回呼保存失敗時不會重試，可能導致後續 completion 失敗。
- ✔ P1 A/B 座標系不一致（見上）。
- ✔ P2（疑似）`GuidedBrewV1` 的 session 由 `useState` 建立一次，effect cleanup 會 `session.dispose()`；React Strict Mode 重播 effect 後 guidance 訂閱可能失效（需瀏覽器驗證）。
- P2 預覽用 object-fit: cover，但分析 ROI 為固定正規化矩形、未做 cover 轉換；橢圓是固定顯示，不是 9C-5.4 的可拖拉標定 UI。
- P2 尚未做任何手機實機 QA；號稱 PWA 但沒有 manifest / service worker。
- P2 部分文件落後（README、routes.md、vertical-slices.md 未反映 9D-4）。
- 風格不一致：UI 文案中英混雜；`live-brew-draft.tsx` 等檔案為極度壓縮的單行寫法，可讀性差；沒有 Prettier。

## 6. 協作注意事項（給 Claude）

- 使用者以中文溝通，回報用繁體中文。
- 專案在使用者 Windows 電腦 `D:\Projects\CupMaster`；優先用裝置 shell 操作。若裝置 shell 不可用，只能 stage 檔案到雲端閱讀（路徑深度上限 7 層，`src/app/journal/[brewId]/analysis/recommendations/[recommendationId]/plan/page.tsx` 無法 stage），寫回需 device_commit。
- 雲端工作區連不到 npm registry，無法在雲端跑 npm 指令。
- 做任何改動前先確認屬於哪個 vertical slice、是否改變產品流程（需使用者同意）。
