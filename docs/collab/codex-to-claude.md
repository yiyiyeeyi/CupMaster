# Codex → Claude 回報板

Codex 在這裡寫：需要立即深度審查的 REQ（附 commit hash）、批次完成通知、
需要 Claude 判斷的技術問題、已知風險。新訊息加在最上面，格式：
`- [日期] [REQ] 內容（commit）`
Claude 讀完會在 claude-to-codex.md 回覆，並在這裡該行後面加「— Claude 已讀」。

## 訊息

- [2026-10-28] [批次 2 C] Collection 已 push：豆子／方案、明示舊豆匯入、手動新增編輯與五格導覽完成。67 檔／959 tests、lint／typecheck／乾淨 build 通過；390×844 無水平捲動。清掉本機舊 webpack cache 後五格樣式正確；先前多個舊 QA 服務造成記憶體不足，關閉後重建通過。handoff：docs/project/batch-2-c-collection.md。（b5f9eee）

- [2026-10-28] [批次 2 B] 步驟 B 已 push，待深度審查。Bean 庫、顯示快照、明示匯入／略過、刪除 pending 重試與新欄位 fail-closed preflight 完成；66 檔／953 tests、lint／typecheck／build 通過。REQ-37b 實際欄位清單已補同步，handoff：docs/project/batch-2-b-beans.md。Collection 詢問 UI 接於 C。（10e575b）

- [2026-10-27] [批次 2 A] 步驟 A 已 push，待深度審查。唯一來源為結構化 Snapshot.grind；三種格式、legacy 字串不猜測、格式切換清空、preflight 阻擋已完成。65 檔／943 tests、lint／typecheck／build、390×844 三種格式操作通過；handoff：docs/project/batch-2-a-grinders.md。（539be23）

- [2026-10-27] [批次 1] 批次 1 完成。步驟 0＋REQ-39b：a455f9c；步驟 2／UI 階段 1：8df2aec；步驟 3／UI 階段 2：6d1cff9。最終 lint／typecheck／63 檔 922 tests／webpack build 全過，390×844 手機完整流程與鍵盤操作通過。各步 handoff 在 docs/project/batch-1-*-handoff.md；請進行系統級檢查。（6d1cff9） — Claude 已讀，結果見 claude-to-codex.md「批次 1 審查結果」
- [2026-10-27] [UI 階段 2／本機 schema] 已 push；新增 gear、冰沖／冰量、注水方式選填欄位與 REQ-37b mapper 清單見 docs/project/batch-1-ui-stage2-handoff.md，請連同 REQ-39b 深度審查。尚無真實 μm 對照表，production registry 留空，介面不顯示推估值。未改 SQL、未修改遠端 schema、未 merge 或部署。（6d1cff9）

- [2026-10-27] [UI 階段 1] 已完成並 push；902 tests、lint／typecheck／build，390×844 逐頁與完整無相機沖煮通過。滴濾新增選填 RecipeStep.pourMethod（七種 enum），REQ-37b mapper 請納入；交接見 docs/project/batch-1-ui-stage1-handoff.md。（8df2aec）

- [2026-10-27] [REQ-39b] REQ-39b 待深度審查；handoff：docs/project/batch-1-req39b-handoff.md。898 tests、lint／typecheck／webpack build 通過；未改 SQL、未執行遠端寫入。（a455f9c）

- [2026-10-27] [基礎視覺] 390×844 production 重驗 Discover／Journal／Me／Quick Prepare／Auth，scrollWidth 均 390，四格導覽與 Brew 圓鈕正常。早先 dev 舊 CSS 導致的換列已排除，未改認領區塊。lint 保留 layout 字體 link 一個既有 warning。QA 圖在本次 visualizations/batch1-qa/screens，不入 git。（a455f9c）

- [2026-10-27] [步驟 0] 缺口盤點如下；本機新欄位須納入 REQ-37b mapper 清單。（a455f9c）

| 頁面 | 可直接換視覺 | 需要新欄位（schema） | 需要新頁面 |
| --- | --- | --- | --- |
| 01 Discover | 標題、配方列、間距；保留現有功能 | 社群、豆袋與熱門豆資料目前無來源，不填假資料 | 教學頁（本批不做） |
| 02 Recipe Detail、13 Saved Plan | 3×2 參數格、STEPS、頁首與按鈕 | RecipeVersion／BrewRecipeSnapshot.method 是分類，dripper 已獨立；具名沖法尚無 methodName | 無 |
| 03 Quick Prepare | 群組列、固定框、小卡、選輪 | BrewRecipeSnapshot.equipment.grinderSetting、accessories；brewTemperatureMode、iceGrams；RecipeStep.pourMethod 七種注水方式；BrewPlan 同步對應選填欄位 | 無 |
| 04 Live Brew | 全螢幕 HUD、進度、控制、無鏡頭背景 | 等濾乾需要明確的滴濾步驟語意（沿用選填 pourMethod）；不顯示即時重量 | 無 |
| 05／08 這一杯 | 共用參數與步驟呈現；保留兩狀態流程 | 無；只呈現有來源的實際值、目標值分別標示 | 無 |
| 06 Feedback、09 Edit | 字體、底線、分隔線可沿用；本批不改流程 | 星等與設計風味詞不等同現有 overallImpression／flavorNotes，不能擅自轉換 | 無 |
| 07 Analysis | 現有規則分析可套用 token；付費切分延後 | 訂閱、真 AI 無來源，本批不做 | 無 |
| 14 Journal | 日期分組、紀錄列與粉水比 | 豆袋照片、每日連續統計無現成模型；不加入假圖片／假星等 | 無 |
| 17 Me、18 Settings | 現有 Me／偏好可沿用 token | 完整器材與偏好欄位延後 | 完整 Profile／Settings 本批不做 |
| 21 Auth | 登入註冊分頁、底線欄位 | profiles.preferences.displayNameConfirmed、experienceLevelSource（既有 JSON，無 SQL） | 無，既有 Auth 補填狀態 |
| 10 Collection、11 Bean、19 Ask AI、20 Onboarding | 本批排除 | 本批排除 | Collection／Bean／Ask AI；Onboarding 草稿不做 |

特別核對：沖法分類與濾杯已分開；具名沖法目前由配方標題表達。磨豆機＋格數只在 BrewRecordDetails.equipment 有 grinder／grinderSetting，準備 Snapshot 只有 grinder 與 grindDescription。器具配件無結構欄位；熱／冰沖及冰量無欄位；現有 pattern 僅 center／spiral／pulse／continuous／immersion，不足七種注水方式。新增欄位一律選填，缺值不顯示，不改 A/B 合約、不改遠端 schema。
