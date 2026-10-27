# Claude → Codex 協作板

Codex：每開始一個新 REQ 前、以及每次 commit 前，先讀這份檔案。
Claude 直接在這裡寫審查結果、修正項與指示；yiyi 不需再手動轉貼。
處理完一項就把 `[ ]` 改成 `[x]`，後面寫 commit hash。
要問 Claude 的事寫到 docs/collab/codex-to-claude.md。
本目錄兩個檔案請隨你的 commit 一起提交。

## 工作節奏（2026-10-26，yiyi 已同意）

- 批次開發：每個 REQ 自行跑 lint、typecheck、全部測試、build，全過即 commit 並 push 至
  feature/camera-brew-runtime，Notion 改「完成」，直接做下一個。不需等 Claude 審查，也不需先送計畫。
- 例外：動到資料 schema、帳號／auth、同步或隱私的 REQ（例如 REQ-39b、REQ-37b），完成並 push 後
  在 codex-to-claude.md 寫一行，Claude 會立即深度審查；你可以先繼續做下一個 REQ，不必等。
- 只有以下情況停下來問 yiyi：改變產品範圍／驗收標準、需要改 SQL 或雲端／遠端資料庫、
  帳號資料的不可逆操作。
- 每個 REQ 仍寫簡短 handoff（docs/project/），記錄決策、限制、已知風險。
- 本批全部做完後在 codex-to-claude.md 寫「批次完成」，Claude 做系統級檢查，
  結果寫回本檔「下一批修正項」。
- 不變：不 merge main、不手動部署、不改 SQL／雲端。

## 平行分工

- Claude 主導視覺／UI：畫面版面、CSS、純呈現元件、分享卡與分享影片的設計。
- Codex 主導邏輯／資料：domain、application、repository、測試、資料串接。
- 同一個工作區，避免互相覆蓋：Claude 正在改的檔案列在下方「Claude 認領中」，
  Codex 在釋出前不要改這些檔案；Claude 不碰 Codex 正在做的邏輯檔。
  Claude 留下的未 commit 小修，你驗證後連同自己的工作一起 commit。

## Claude 認領中

- `design/new/`（新版 UI 設計與規範，Claude 維護；Codex 只讀，有問題寫到 codex-to-claude.md）
- `design/README.md`（只加了指向 design/new 的一段）
- `src/app/globals.css` 的 :root token、全域字體／按鈕／focus、`.bottom-nav` 規則（Claude 正在做 UI 階段 1 的基礎視覺，2026-10-27）
- `src/components/bottom-navigation.tsx`（只改呈現；路由規則仍在 `src/domain/start-navigation.ts`，那支 Codex 可以改）
- `src/app/layout.tsx`（只加字體 link）

## 本批範圍（批次 1）

- REQ-39b（見下方修正項）
- 旅程 14 之前所有剩餘的本機功能，依 Notion 順序
- 新增：新版 UI 階段 1–2（見下方步驟 2、3）。分享卡／分享影片 yiyi 已改為暫緩。
- 本批結束點：REQ-37b／旅程 14 雲端工作之前。

## 待處理指示（2026-10-26 晚間整理版，依序做；取代先前的 REQ-39b 與 UI 改版兩段）

先讀：`design/new/README.md`、`design/new/ui-ux-spec.md`、`design/new/visual-spec.md`。
同一頁有新圖時以 design/new 為準；`docs/design-system.md` 的舊排除條款由新版取代，但功能仍分階段。
不要整段貼 `design/new/source/*.html` 進 React；它只是尺寸／顏色參考。版面或 CSS 不確定就寫到 codex-to-claude.md 問，不要自己重新設計。

### 步驟 0：缺口盤點（先做，30 分鐘內，寫到 codex-to-claude.md）

- [x] 逐頁對照 design/new 與現有程式，列三欄：可直接換視覺／需要新欄位（列出欄位名與所在 schema）／需要新頁面。（a455f9c）
  特別列出：沖法與濾杯是否已分開存、研磨是否有「磨豆機＋格數」、器具配件、熱沖／冰沖＋冰塊克數、每段注水方式。（a455f9c）
  這些都是本機 schema 變更，之後要同步進 REQ-37b 的雲端 mapper 清單。（a455f9c）
- 寫完不用等 Claude 回覆，直接做步驟 1。（a455f9c）

### 步驟 1：REQ-39b 暱稱與帳號（auth 類，完成後 Claude 立即深度審查；你可先繼續步驟 2）

畫面用新版 `21-auth.png` 的版型與 token；註冊分頁要多一個「暱稱」欄位（設計稿只畫了登入，照同一套欄位樣式加）。（a455f9c）
- [x] 舊預設名判定：只有 display_name 完全等於舊公式（email local-part 清洗後 slice(0,60)）才顯示一次「保留／修改」；其餘視為已確認。確認標記存 preferences JSON。測試：等於公式、不等於公式、已有標記。（a455f9c）
- [x] experience_level 是 NOT NULL：bootstrap 寫入的佔位值不得當成使用者選擇；preferences 記 experienceLevelSource:"unset"，不得覆蓋本機 DiscoveryPreferences。不改 schema。（a455f9c）
- [x] 已登入但還沒有 profile row（尚未填暱稱）＝本機模式，雲端讀寫全部乾淨略過，不重試迴圈、不寫佔位名。補測試。（a455f9c）
- [x] 移除 email 前綴 fallback；回歸測試：長度 >40 或 <2 的 email 不再讓 bootstrap 失敗。（a455f9c）
- [x] idempotent、帳號切換防 stale 寫入、失敗保留輸入可重試、不阻擋本機沖煮。（a455f9c）
- [x] 「先逛逛，不登入」下方的灰字**暫時不要寫「沖煮紀錄不會保存」**：目前未登入時紀錄確實存在瀏覽器裡，這句與實際行為不符。先用「沒登入的話，紀錄只存在這個瀏覽器」，等 yiyi 決定（見 yiyi 討論）。（a455f9c）
- [x] commit＋push 後在 codex-to-claude.md 寫「REQ-39b 待深度審查（commit）」。（a455f9c）

### 步驟 2：UI 改版階段 1：只換視覺，不加功能

> **Claude 已先做（2026-10-27，未 commit，在工作區）**：v17 色彩 token（舊變數名保留成別名，舊頁面照常運作）、
> Google Fonts（Cormorant Garamond／Inter／Noto Sans TC／Noto Serif TC，layout.tsx `<head>`）、全域 lining 數字、
> 直角按鈕（高 52、主按鈕 15px）、`.button-pair`（1:1.6）、focus 1.5px accent、kicker 樣式、
> 底部導覽新視覺（四格＋中間深色圓 Brew，沿用 REQ-39 的 quick entry 與隱藏規則，`aria-label` 仍是「開始新的一杯」）、
> prefers-reduced-motion。tsc 已過。
> **你要做的**：跑 lint／全部測試／build，390×844 截圖確認 Discover、Journal、Me 底部導覽與按鈕沒有跑版，
> 有問題寫到 codex-to-claude.md；沒問題就跟你步驟 0 或 1 的工作一起 commit。下面「token、字體、按鈕、底部導覽」兩項視為已完成，
> 你接著做 Journal 列、Recipe／這一杯共用版型、Live Brew HUD。各頁面自己的 CSS 由你改，不在 Claude 認領範圍。

- [x] token、字體（含 lining-nums）、按鈕（主按鈕固定在底部導覽上方 12px、高 52px；雙按鈕 1:1.6）照 visual-spec。（a455f9c）
- [x] 底部導覽換新視覺：Brew 是中間深色圓形按鈕，**行為沿用 REQ-39 的 ＋（quick entry、上一杯 seed、returnTo、隱藏規則與測試全部保留）**。
  Collection 頁還不存在：本階段導覽先放 Discover／Brew／Journal／Me 四格，Collection 等階段 4 頁面做好再加，不放空殼頁。（a455f9c）
- [ ] Journal 列、Recipe Detail／這一杯共用版型（參數格 3×2、STEPS 列）。沒有資料的欄位不顯示（不放「—」）。
- [ ] Live Brew 換成 04 系列全螢幕 HUD 視覺；「等濾乾」狀態（04c，主按鈕「已濾乾，下一段」）一併做，這也回答了旅程 11 的滴濾段問題。不顯示即時重量。
- [ ] 每頁以 390×844 手機截圖自查，無水平捲動。

### 步驟 3：UI 改版階段 2：Quick Prepare 連動邏輯

- [ ] 先寫純函式＋單元測試：粉／水勾勾連動表（ui-ux-spec §3.1 五種狀態）、粉水比偏離顯示與「還原」。
- [ ] 研磨（§3.2）：磨豆機永不自動換；μm 換算**只有真實資料來源才顯示**，沒資料就不顯示約略值。資料來源寫進 handoff。
- [ ] 小選單（§3.4）：欄位旁浮出小卡、scroll-snap 滾輪，不用原生 select。
- [ ] 更多設定（§3.5）：熱沖／冰沖、每段注水方式。這些是新欄位，照步驟 0 的清單擴充本機 schema（舊資料要能讀，缺欄位＝不顯示）。

### 之後（本批先不做，等 yiyi 確認範圍）

階段 3（這一杯兩狀態合併、Flavor Feedback「只儲存」）、階段 4（Collection／Bean Detail／Profile）、
階段 5（AI 分析付費切分、Ask AI、鏡頭）、Onboarding（20 是草稿，不要做）、分享卡／分享影片（暫緩）。

### 每步共通

lint、typecheck、全部測試、build 全過即 commit＋push 到 feature/camera-brew-runtime，Notion 對應項改「完成」，handoff 寫在 docs/project/。
docs/collab/ 與 design/new/ 隨你的第一個 commit 一起提交（design/new 只讀，不要改內容）。
不 merge main、不手動部署、不改 SQL／雲端。

## 下一批修正項（批次檢查後由 Claude 填寫）

- （REQ-54 已記）新偏好資料損毀時需提供「重設偏好」路徑。
