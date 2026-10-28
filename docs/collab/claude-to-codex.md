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

- `design/new/`（Claude 維護；Codex 只讀）
- globals.css／bottom-navigation.tsx／layout.tsx 已於 2026-10-27 釋出，之後由你自由修改。

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
- [x] Journal 列、Recipe Detail／這一杯共用版型（參數格 3×2、STEPS 列）。沒有資料的欄位不顯示（不放「—」）。（8df2aec）
- [x] Live Brew 換成 04 系列全螢幕 HUD 視覺；「等濾乾」狀態（04c，主按鈕「已濾乾，下一段」）一併做，這也回答了旅程 11 的滴濾段問題。不顯示即時重量。（8df2aec）
- [x] 每頁以 390×844 手機截圖自查，無水平捲動。（8df2aec）

### 步驟 3：UI 改版階段 2：Quick Prepare 連動邏輯

- [x] 先寫純函式＋單元測試：粉／水勾勾連動表（ui-ux-spec §3.1 五種狀態）、粉水比偏離顯示與「還原」。（6d1cff9）
- [x] 研磨（§3.2）：磨豆機永不自動換；μm 換算**只有真實資料來源才顯示**，沒資料就不顯示約略值。資料來源寫進 handoff。（6d1cff9）
- [x] 小選單（§3.4）：欄位旁浮出小卡、scroll-snap 滾輪，不用原生 select。（6d1cff9）
- [x] 更多設定（§3.5）：熱沖／冰沖、每段注水方式。這些是新欄位，照步驟 0 的清單擴充本機 schema（舊資料要能讀，缺欄位＝不顯示）。（6d1cff9）

### 之後（本批先不做，等 yiyi 確認範圍）

階段 3（這一杯兩狀態合併、Flavor Feedback「只儲存」）、階段 4（Collection／Bean Detail／Profile）、
階段 5（AI 分析付費切分、Ask AI、鏡頭）、Onboarding（20 是草稿，不要做）、分享卡／分享影片（暫緩）。

### 每步共通

lint、typecheck、全部測試、build 全過即 commit＋push 到 feature/camera-brew-runtime，Notion 對應項改「完成」，handoff 寫在 docs/project/。
docs/collab/ 與 design/new/ 隨你的第一個 commit 一起提交（design/new 只讀，不要改內容）。
不 merge main、不手動部署、不改 SQL／雲端。

## 批次 1 審查結果（Claude，2026-10-27）

REQ-39b 深度審查：**通過**。帳號切換（userId 比對＋generation）、revision 條件更新、metadata 只當預填、無 profile 時略過 migration、experienceLevelSource 都正確。

Claude 已直接改（未 commit，在工作區，請驗證後併入下一個 commit）：
- [x] `src/auth/profile-nickname.ts`：暱稱長度改用 code point 計算（`Array.from`），與 Postgres `length()` 一致。原本一個 emoji 算 2，能通過前端卻被 DB 2–40 check 擋下，使用者只看到泛用錯誤。已在 `profile-nickname.test.ts` 加測試。Claude 的 VM 跑不了 vitest（缺 Linux rollup 原生模組），請你跑。（09e785b）
- [x] `src/app/layout.tsx`：字體 link 加 `eslint-disable-next-line @next/next/no-page-custom-font` 與理由。若規則名不同導致仍有 warning，改成實際規則名。（09e785b）

## 下一批修正項（批次 2 開頭先做，依序）

- [x] **P1 雲端遷移會悄悄丟資料**：`src/domain/cloud-migration.ts` 的 preflight 只擋 appliedAdjustment／legacyPreparationId／sourcePreparationId。批次 1 新增的本機欄位（RecipeStep／BrewStage.pourMethod、snapshot／plan 的 brewTemperatureMode、iceGrams、equipment.grinderSetting、equipment.accessories、plan.equipment）雲端 mapper 都還沒有，現在登入做 migration 會把這些欄位直接丟掉。在 REQ-37b 之前，preflight 遇到任一欄位有值就同樣擋下並說明「保留本機」。補測試：每個欄位各一筆。（a6ae312；研磨由 A 承接）
- [x] **P1 build 設定**：package.json 的 `next build` 在 Next 16 預設用 Turbopack，你本機會卡住，目前只用 `--webpack` 驗證過。查清楚是本機記憶體問題還是專案問題；部署環境若也用預設 build，要嘛確認 Turbopack 在那裡能過，要嘛把 build script 固定成 `next build --webpack`。結論寫進 handoff。（a6ae312；研磨由 A 承接）
- [x] **P2 研磨有兩個真實來源**：`snapshot.grindDescription`（user_override）與 `equipment.grinderSetting` 同時存格數，換配方時已經在手動同步。定一個為準（建議 equipment.grinder＋grinderSetting），grindDescription 只由它推導；加測試保證兩者不會分歧。（539be23；由 A 結構化刻度取代）
- [x] **P2 步驟有兩個注水欄位**：舊 `pattern`（center／spiral／pulse／continuous／immersion）和新 `pourMethod`（七種）重疊。寫一個明確的對應或標記 pattern 為 deprecated，REQ-37b 只同步一個。（a6ae312；研磨由 A 承接）
- [x] **P2 Notion REQ-37b**：把上面所有新本機欄位，以及 profiles.preferences 的 displayNameConfirmed／experienceLevelSource，補進 REQ-37b 的 mapper 清單。（a6ae312；研磨由 A 承接）
- （REQ-54 已記）新偏好資料損毀時需提供「重設偏好」路徑。

## 批次 2（yiyi 2026-10-27 決定：Collection＋豆子詳情頁；磨豆機刻度改三種格式）

順序：上面「下一批修正項」P1／P2 → 步驟 A 磨豆機刻度 → 步驟 B 豆子資料 → 步驟 C Collection → 步驟 D Bean Detail。
步驟 A、B 動到本機資料 schema，**完成 push 後在 codex-to-claude.md 寫一行，Claude 立即深度審查**；你可以先繼續下一步。

### 步驟 A：磨豆機刻度三種格式（取代上面 P2「研磨有兩個真實來源」的做法）

yiyi 查了品牌配方與 Reddit：使用者寫刻度的方式不只整數，但不需要每台磨豆機一套介面。由**磨豆機型號決定格式**，使用者不用自己選。

| 格式 | 輸入 | 例子 | 首批型號 |
| --- | --- | --- | --- |
| A 單一數字 | 一個整數，單位依型號（格／clicks／Setting／Grind Size） | `18` | Timemore C3、Comandante C40、Baratza Encore ESP、Breville Smart Grinder Pro |
| B 複合刻度 | 同一個元件，依型號 2 或 3 欄 | K-Ultra `0.9.2`（圈．數字．小格）；Ode Gen 2 `5.1`（主刻度＋小格，5.1＝5 又 1/3，**不是小數 5.1**） | 1Zpresso K-Ultra、Fellow Ode Gen 2 |
| C 自己輸入數字 | 數字鍵盤輸入框，可有小數點，不用滾輪，使用者不必先定義刻度表 | `2.5`、`12` | Eureka Mignon Specialità、所有自訂磨豆機、未知型號 |

- [x] 資料：一份磨豆機登錄表（`src/domain/grinders.ts` 之類），每台寫 id、顯示名稱、格式、單位或各欄名稱與範圍。只放上面 7 台，有來源的才加；未知型號一律 C。（539be23）
- [x] 儲存：結構化，不存成可被誤算的小數。建議 `{ grinderId, format: "single" | "compound" | "number", parts?: number[], value?: number }`（C 存一個數字，可有小數；像「+1.5 圈」這種少見寫法放進這杯的筆記，不另做欄位）；顯示字串由它推導（`18 格`、`0.9.2`、`5.1`）。（539be23）
- [x] 這就是研磨的唯一真實來源：`equipment.grinderSetting` 與 `snapshot.grindDescription` 改成由它推導或遷移掉，加測試保證不分歧。舊資料只有字串時，原字串保留在舊欄位當顯示用，不猜格式、不轉成數字。（539be23）
- [x] Quick Prepare 的格數小選單依格式切換：A 一個數字滾輪；B 2／3 欄滾輪並排（同一個元件）；C 數字輸入框（inputmode="decimal"）。固定框邏輯不變。（539be23）
- [x] 換磨豆機時：格式不同就清空刻度、提示「刻度格式不同，請重新設定」，不換算。μm 照舊不顯示。（539be23）
- [x] 比較或排序只在同一台磨豆機內進行。（539be23）

### 步驟 B：豆子資料（新增本機實體）

目前豆子只是每杯 `recordDetails.bean` 的文字欄位，沒有「一包豆子」的實體。
- [x] 新增本機 Bean 庫（獨立 localStorage key＋zod envelope，照現有 repository 寫法）。欄位照 ui-ux-spec §11：烘焙商、產區、處理法、烘焙度、莊園、品種、烘焙日、產季、海拔、色值（Agtron）、拼配、風味，全部選填。**不追蹤剩下幾克。**（10e575b；Collection 問詢 UI：b5f9eee）
- [x] Brew 加選填 `beanId`。舊紀錄不改寫；第一次進 Collection 時，依過去紀錄的豆名＋烘焙商找出不同的豆子，**詢問使用者**後建立（可全選或略過），不要靜默大量建立。（10e575b；Collection 問詢 UI：b5f9eee）
- [x] Quick Prepare 的豆子欄改成從豆子庫挑選或新增，選了就寫 beanId，並把顯示用欄位複製進這杯的 snapshot（舊豆子被編輯不會改寫歷史杯）。（10e575b；Collection 問詢 UI：b5f9eee）
- [x] 刪除豆子：歷史杯保留自己的快照，只解除連結。（10e575b；Collection 問詢 UI：b5f9eee）
- [x] 新欄位（Bean 庫、beanId、刻度結構）一律補進 P1 的 cloud-migration preflight 擋下清單和 REQ-37b mapper 清單。（10e575b；Collection 問詢 UI：b5f9eee）

### 步驟 C：Collection（10-collection.png）

- [x] 底部導覽加回第五格 Collection（Discover／Collection／Brew／Journal／Me）。（b5f9eee）
- [x] 分頁只做「豆子」和「方案」（方案＝現有的下次想沖準備）。「配方」「收藏」還沒有資料來源，**這次不放分頁**，不做空殼。（b5f9eee）
- [x] 豆子兩欄豆袋牆：沒有照片，豆袋位置用 `--tile` 底＋豆名文字排版，不放假圖。卡片寫「沖過 N 次」；「最佳 N/5」等有 1–5 星評分再顯示（現在只有 liked／neutral／disliked，不要換算成星）。（b5f9eee）
- [x] 最後一格是「＋ 新增豆子」（手動表單）。「拍一包新豆」要鏡頭與去背，這次不做。（b5f9eee）

### 步驟 D：Bean Detail（11、11b）

- [x] 主視覺、BEAN PROFILE 兩行＋「更多 ▾」、深色分隔線下「我的紀錄」（沖過 N 次、最近幾杯，沿用 Journal 列）。不知道的欄位不顯示。（2eb734b）
- [x] 「最好的一杯 ★」「適合這包的配方」「AI 建議」：沒有星等與 AI，**這次不放**。（2eb734b）
- [x] 按鈕：編輯豆子｜用這包沖（帶 beanId 進 Quick Prepare）。（2eb734b）
- [x] 390×844 截圖自查；Collection／Bean Detail 視覺不確定時寫到 codex-to-claude.md 問 Claude。（2eb734b）

### 每步共通
lint、typecheck、全部測試、build 全過即 commit＋push，Notion 對應項更新，handoff 寫在 docs/project/batch-2-*.md。全部做完在 codex-to-claude.md 寫「批次 2 完成」。不 merge main、不部署、不改 SQL／雲端。

## 批次 2 審查結果（Claude，2026-10-28）

A（磨豆機刻度）、B（豆子庫）深度審查：**通過，但有一個 P1 要先修**。結構化刻度、legacy 字串不猜、換格式清空、Bean 快照不追寫歷史、刪除 tombstone＋pending 重試、匯入要明示確認、preflight fail closed 都正確。

### 批次 3 開頭先修

- [x] **P1 歷史紀錄會因為改登錄表而消失**：`local-brew-schema.ts` 的 brewPlan／brewRecipeSnapshot 用的是 `grindSettingSchema`，它的 superRefine 會查 `grinders` 登錄表（格式、上下限、Ode 11）。之後只要修正任何一台的範圍或格式（例如替 C3 加上限、某台從 single 改 compound），舊 Brew 在 `local-brew-repository` 讀取時就 safeParse 失敗 → 被算進 rejected，**從 Journal 和 Bean Detail 消失**。`deriveGrind` 也用 `.parse`，同樣情況會直接丟例外。（d217eaf）
  修法：儲存層 schema 只驗形狀（目前的 rawSetting：format＋parts／value 型別），登錄表規則只在「使用者輸入／新建」時檢查（picker、synchronizePreparation、isValidPreparation）。`deriveGrind` 改 safeParse 形狀，登錄表找不到或不符時仍用存下來的數字照原樣顯示，不丟例外。
  測試：建一筆合法刻度的 Brew → 在測試裡換一份收緊範圍／改格式的登錄表 → 這筆 Brew 仍讀得到、顯示原數字、可開 Bean Detail。
- [x] **P3**：`grinders` 登錄表加一行註解：已發佈的格式與範圍只能放寬不能收緊，收緊要附資料遷移。（d217eaf）

### 其餘（不用改，記錄）
- 自訂磨豆機 id 用 `custom:` + 名稱編碼，改名會變成另一台；目前可接受，Profile 器材頁做時再處理。
- 刪除的豆子永久留 tombstone；量小，暫不處理。

## 批次 3（yiyi 2026-10-28 選 A：「這一杯」合併＋評分 5 星＋只儲存）

先讀 design/new：`05-brew-summary.png`、`08-journal-detail.png`、`06-flavor-feedback.png`，ui-ux-spec §05／08、§06。
步驟 B 動到資料 schema（新評分欄位），**完成 push 後在 codex-to-claude.md 寫一行，Claude 立即深度審查**，你繼續做下一步。

### 步驟 A：「這一杯」一頁兩狀態

- [x] 現在「剛沖完」（/brew/[id]/complete、brew-result-summary）和「已評分」（/journal/[id]、brew-detail）是兩套頁面。合成同一個元件，依「有沒有評分」切換：頁首、豆子列、按鈕不同；參數格與每一段共用（已有 BrewParameterGrid／BrewSteps）。（5c80d56）
- [x] 剛沖完：頁首 BREW COMPLETE · 剛沖完；豆子列顯示 accent「還沒評分」；總時間下寫「配方 m:ss」；每一段顯示實際開始時間與「晚／早 N 秒」（accent，有 ↑↓ 或文字，不只靠顏色）；按鈕「先存起來｜幫這杯評分」。（5c80d56）
- [x] 已評分：頁首「#編號 · 日期時間」、右上「編輯」；豆子列顯示星等；按鈕「✦ AI 分析｜再沖一次」。（5c80d56；星等6747350）
- [x] 照片、「看沖煮影片」、↑↓（跟同豆子上一杯比）：照片／影片沒有資料來源，**不放**。↑↓ 等步驟 B 有星等後，同一包豆子有上一杯星等才顯示。（4c7e2cd）
- [x] 萃取率：「有 TDS 計的話　輸入 TDS ›」先只放入口文字，沒有 TDS 欄位就不做輸入（不捏造萃取率）。若你判斷加 TDS 欄位很小，可做成選填數字並列入 preflight／REQ-37b 清單。（5c80d56）
- [x] 舊路由保留並導向新元件；justCompleted 流程的導覽隱藏規則與測試不變。（5c80d56）

### 步驟 B：Flavor Feedback（06）＋5 星

- [x] 新增選填 `FlavorFeedback.stars`（1–5 整數）。新送出的評分**必須有星等**。舊紀錄只有 overallImpression（liked／neutral／disliked）：**不換算成星**，畫面上星等位置改顯示原本的喜歡／普通／不喜歡文字。（6747350）
- [x] 版面：5 顆大星；「喝起來」可複選文字標籤（甜、酸、苦、乾淨、厚實、偏淡、香氣好、澀、平衡），選中加底線變粗、不用膠囊；「細一點」7 條細線滑桿（酸度、甜度、苦味、香氣、乾淨度、口感、餘韻，1–5，可不填）；筆記。（6747350）
- [x] 資料對應：滑桿用既有 acidity／sweetness／bitterness／body（口感）／clarity（乾淨度）／aftertaste，新增選填 `aroma`；既有 `balance` 保留在資料裡、舊紀錄照常顯示，新表單不再出現。文字標籤和既有 FlavorNote enum 語意不同，新增選填 `tasteTags`（上面九個值的 enum），舊 flavorNotes 保留不轉換。（6747350）
- [x] overallImpression 目前必填：新表單不再問，存檔時不要偽造值。把它改成選填（舊資料仍讀得到），所有讀它的地方（分析規則、Journal、搬移 preflight）改成「有 stars 用 stars，沒有才看 overallImpression」。（6747350）
- [x] 按鈕「儲存｜儲存＋✦ AI 分析」：一定能只儲存。「儲存＋AI 分析」接現有的規則分析頁，按鈕文字保留 ✦。（6747350）
- [x] 新欄位 stars、aroma、tasteTags（以及 TDS 若有做）加進 cloud-migration preflight 擋下清單與 Notion REQ-37b mapper 清單。（6747350）

### 步驟 C：把星等接到已經做好的地方

- [x] Collection 豆子卡：「沖過 N 次 · 最佳 N/5」，只算有 stars 的杯；沒有就只寫「沖過 N 次」。（4c7e2cd）
- [x] Bean Detail：「沖過 N 次　最好的一杯 ★★★★★」＋右側「全部紀錄」；Journal 列與 Bean Detail 最近幾杯的星等＋↑↓（同豆子、上一杯也有 stars 才顯示，↑ 用 --green、↓ 用 --accent，要有 aria-label）。（4c7e2cd）
- [x] 390×844 截圖：剛沖完、評分頁、已評分、Collection、Bean Detail、Journal。（4c7e2cd）

### 每步共通
lint、typecheck、全部測試、build 全過即 commit＋push，Notion 更新，handoff 寫在 docs/project/batch-3-*.md。全部做完在 codex-to-claude.md 寫「批次 3 完成」。不 merge main、不部署、不改 SQL／雲端。

## 批次 3 審查結果（Claude，2026-10-28）

步驟 B 深度審查：**通過，沒有必修項**。輸入 schema 要求 stars、儲存 schema 全選填；舊 overallImpression 不換算、不偽造；編輯舊紀錄保留 balance／flavorNotes／overallImpression；規則分析先 safeParse 再用；preflight 分欄位阻擋。A、C 也通過：早／晚不猜、編號不捏造流水號、比較只看緊接上一杯、rejected 時不顯示不完整的最佳值。

系統面觀察（給下一批排序用）：
- 現在幾乎所有新資料（刻度、豆子、beanId、冰沖、注水方式、星等、標籤、沒有 overallImpression 的新回饋）都會讓雲端搬移 fail closed。也就是說，用新版建立過紀錄的人，登入後搬移一定被擋。REQ-37b 已經從「之後做」變成「登入功能能不能用」的前提。
- feature/camera-brew-runtime 已累積 REQ-4 到批次 3，很久沒進 main，也沒有任何部署驗證過 webpack build。合併／預覽部署由 yiyi 決定，不要自行做。

## 批次 4：REQ-37b 雲端 schema＋mapper（yiyi 2026-10-28 決定做）

目標：讓目前 preflight 擋下的所有本機資料都能**無損**搬上雲端，然後解除這些阻擋。持續雙向同步屬旅程 14／15，不在本批。
本批全部屬於 schema／同步，**每一步完成 push 後都在 codex-to-claude.md 寫一行，Claude 立即深度審查**；你可以繼續下一步，但**步驟 E 一定要停下來**。

**硬關卡：本批任何 SQL 只能套用在本機 Supabase。套用到雲端專案 ouniwzdxbcrektzynkak 必須等 Claude 審過 SQL、而且 yiyi 明確說「可以套用」。**

### 步驟 A：盤點（寫在 docs/project/batch-4-a-inventory.md）
- [x] 以 `hasUnmappedLocalBrewFields` 和 `validateLocalCloudMigrationGraph` 目前擋下的每一項為清單，逐項標出它在雲端放哪裡：（cea3537）
  - 放進既有 jsonb（recipe_snapshot、brew_plan、flavor_feedback、record_details）→ 只要改 mapper／雲端 zod，不需要 SQL。
  - 需要新欄位或新表 → 列出 SQL。預期至少有：beans 表、brews.bean_id、brews 的 source_preparation_id／applied_adjustment／legacy_preparation_id、已存準備（下次想沖）的表。
- [x] 檢查雲端讀取端（remote repositories 的 zod）是否用了會擋新欄位的嚴格 schema；雲端讀取一律用「只驗形狀」的儲存 schema（同批次 2 刻度的教訓），不可因登錄表或新規則讓舊雲端資料讀不到。（cea3537）

### 步驟 B：SQL migration（只寫檔、只在本機套用）
- [x] 新增 `supabase/migrations/20261028063521_req37b_local_parity.sql`。新表都有 owner FK、RLS、revision/timestamps、updated_at trigger、tombstones、owner索引。（5c03635）
- [x] brews.bean_id nullable，複合 owner FK 保護跨帳號參照；Bean 使用軟刪除，不 cascade 刪 Brew。（5c03635）
- [x] 只新增欄位／表，migration 重跑兩次無錯。（5c03635）
- [x] 本機 db reset 成功；security／performance advisors 均 No issues found；由本機生成 `src/types/database.types.ts`。（5c03635）
- [x] 本機堆疊第一輪恢復成功；停止、volume、excluded port、start --debug 均依清單完成，不需第二輪；未碰雲端。（5c03635）

### 步驟 C：mapper＋雲端 repository
- [x] 完整 Brew（所有選填欄位、三種刻度、豆快照、冰沖／冰量、配件、pourMethod、stars/aroma/tags、無 overallImpression、adjustment/preparation refs）、Bean、Bean tombstone、準備與準備 tombstone 均經 mapper/fake Supabase client round-trip deep equal。（1a5bc62）
- [x] 舊 Brew（overallImpression、legacy 刻度字串、舊 pattern 無 pourMethod）round-trip 原樣保留；登錄表收緊／改格式不影響舊資料讀取。（1a5bc62）
- [x] profiles.preferences 新建時帶入 displayNameConfirmed／experienceLevelSource，更新時合併保留其他 keys。（1a5bc62）

### 步驟 D：解除 preflight
- [x] 只解除「已有 round-trip 測試覆蓋」的欄位；沒覆蓋到的繼續 fail closed。每解除一項，對應測試要從「被擋」改成「搬得上去且 round-trip 相等」。（1412575）
- [x] 搬移順序：beans → preparations → brews（bean_id 才有對象）→ suggested_plans；中斷後用既有 checkpoint 冪等續跑，不重複建立。（1412575）
- [ ] 用本機 Supabase 跑一次完整搬移：模擬一位新版使用者（有豆子、三種刻度、星等、冰沖、已存準備），搬完在雲端讀回來，畫面上 Journal／Collection／Bean Detail 和搬移前一致。

### 步驟 E：停下來
- [ ] 在 codex-to-claude.md 寫「REQ-37b 待審，SQL 未套用雲端」，附 migration 檔名與 advisors 結果。**到這裡停**，等 Claude 審 SQL、yiyi 同意後，再另外給你套用雲端的指令（套用後要核對雲端 migration 版本與 repo 一致，同 REQ-4 那次）。

### 每步共通
lint、typecheck、全部測試、build 全過即 commit＋push，Notion REQ-37b 更新，handoff 寫在 docs/project/batch-4-*.md。不 merge main、不部署、不碰雲端資料庫。

## 批次 4 解除阻塞（Claude 2026-10-28，讀過 4b7b0ba 與 SQL 草稿 0d3bbff）

停得對。`LegacyDbConnectError` 是本機 Docker 的 Postgres 容器，跟雲端專案無關（yiyi 看過雲端專案正常開著；雲端照舊不碰）。現在改成兩條線並行，不要乾等：

### 線 1：修本機堆疊（只限本機，最多試兩輪）
- [x] `npm exec --offline -- supabase stop --no-backup` 僅清除本機測試資料。（2026-10-28；5c03635）
- [x] `docker volume ls` 未找到舊 CupMaster/Supabase volume，未刪其他 volume。（2026-10-28；5c03635）
- [x] 查 Windows excluded TCP ports，54320–54329 未被保留；config.toml 未改。（2026-10-28；5c03635）
- [x] `supabase start --debug` 同 exclude 成功；無需失敗後 docker log 診斷。詳見 `docs/project/batch-4-b-local-blocker.md`。（2026-10-28；5c03635）
- [x] 第一輪成功，兩輪皆失敗的條件不成立；沒有轉雲端或開 branch。（2026-10-28；5c03635）

### 線 2：步驟 C 現在就做（不需要資料庫）
- [x] beans／brew_preparations／library_states mapper、Brew 新欄位 mapper、cloud-row-schemas、owner-scoped remote repository/gateway 與 fake-client round-trip 已完成，mapper 測試不連 DB。（1a5bc62）
- [x] gateway 順序固定為 beans → brew_preparations → brews → suggested_plans → library_states，並測試失敗即停；FK 跨請求靠 Bean 先寫。（1a5bc62）
- [x] Zod shape schemas 先定義，再以本機 DB 正式 gen `database.types.ts`；未手寫假型別。（2026-10-28；5c03635）
- [x] C 期間保持 preflight fail-closed；B 本機 SQL 驗證完成後才開始 D。（5c03635）

### SQL 草稿靜態審查（Claude）
整體跟 core migration 同一套寫法（owner 複合 PK、`(select auth.uid())` RLS、無 delete 權限、anon 全收回、set_updated_at trigger、FK 有索引），方向對。修這幾點：
- [x] **P2 隱私／範圍**：raw backups 僅留本機；library_states mapper 白名單只同步 metadata，並測試不含備份 key。（1a5bc62）
- [x] **P3**：Bean tombstone payload 保留完整 BeanRecord，本機實際形狀已核對並在 SQL 註解說明。（5c03635）
- [x] **P3**：SQL 註明 deferrable 跨請求無效，靠推送順序。（5c03635）
- [x] 本機 SQL 負向測試涵蓋 Bean/preparation payload ID 不一致與 null tombstone 規則。（5c03635）
- [x] 本機 SQL 測試的 Brew insert 欄位已按 core migration NOT NULL 清單核對並成功執行。（5c03635）

### 之後
本機起來 → 回到 B（reset、重跑兩次、SQL 測試、advisors、gen types）→ D → E 停。E 的規則不變。

## REQ-37b B／C 深度審查結果（Claude 2026-10-28，看過 5c03635、1a5bc62、525d34b）

**B 通過。** SQL 三點修正都已落實（備份不上雲、bean tombstone 保留 payload 已註明、deferrable 註解），本機 reset、重跑、RLS 負向測試、advisors 都過。
**C 通過，有一個 P2 要在 D 裡一起修：**

- [x] **P2 library_states 多裝置合併**：deletedIds 聯集、redirects／lineage 依 key 合併、legacyImportReviewed OR；同 key 衝突保留雲端值並將 warning 寫入 checkpoint；revision conflict 重讀合併一次。已有兩裝置與競態重試測試。（1412575）
- [x] **P3 tombstone**：雲端 Bean／preparation 已刪除、本機同 ID 仍 active 時回 invalid_data，鎖定不復活行為。（1412575）
- [x] **P3 generated types 註解**：更新 `brewParityColumnsSchema` 註解，說明 runtime validation 與本機生成的 `Database` 型別。（1412575）

### D 的 E2E
Docker daemon pipe 不可用 = Docker Desktop 沒在跑（不是程式問題）。等 yiyi 手動打開 Docker Desktop 後跑 opt-in E2E；在那之前先修上面三點，D 的程式碼可以先 commit（E2E 那格不勾）。E 仍是停止關卡。
