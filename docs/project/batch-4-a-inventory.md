# 批次 4 A：REQ-37b 本機資料與遠端契約盤點

2026-10-28。依 hasUnmappedLocalBrewFields、validateLocalCloudMigrationGraph 與實際 mapper／repository 盤點。此步只有文件，沒有修改 SQL、資料庫或解除 preflight。後續 SQL 僅限本機 Supabase；雲端 ouniwzdxbcrektzynkak 在步驟 E 停下來，須 Claude 審 SQL 與 yiyi 另行明確授權。

## 現有阻擋逐項去向

| 本機欄位／阻擋 | 遠端去向 | SQL／mapper 工作 |
|---|---|---|
| snapshot.bean 的 roaster、origin、process、roastLevel、farm、variety、roastDate、cropYear、altitude、agtron、blend、flavors | brews.recipe_snapshot.bean jsonb | 不需 SQL；保留完整儲存 shape |
| snapshot.grind：grinderId、format、value／parts | brews.recipe_snapshot.grind jsonb | 不需 SQL；只驗形狀，不查型號登錄表 |
| plan.grind | brews.brew_plan.grind jsonb | 同上 |
| snapshot.equipment.grinderId／grinderSetting／accessories | brews.recipe_snapshot.equipment jsonb | 不需 SQL，保持 canonical grind 與舊顯示字串原貌 |
| plan.equipment（包含 grinder、grinderId、grinderSetting、accessories） | brews.brew_plan.equipment jsonb | 不需 SQL |
| snapshot.brewTemperatureMode／iceGrams | brews.recipe_snapshot jsonb | 不需 SQL |
| plan.brewTemperatureMode／iceGrams | brews.brew_plan jsonb | 不需 SQL |
| snapshot.steps[].pourMethod | brews.recipe_snapshot.steps[] jsonb | 不需 SQL；七種值原樣保存 |
| plan.stages[].pourMethod | brews.brew_plan.stages[] jsonb | 同上 |
| 舊 pattern、舊 grindDescription／grinderSetting 字串 | 原 snapshot／plan JSONB 位置 | 不轉換、不猜格式、不因 deprecated 而刪除 |
| flavorFeedback.stars | brews.flavor_feedback.stars jsonb | 不需 SQL；儲存選填 1–5，不能用必填星等的輸入 schema |
| flavorFeedback.aroma | brews.flavor_feedback.aroma jsonb | 不需 SQL |
| flavorFeedback.tasteTags | brews.flavor_feedback.tasteTags jsonb | 不需 SQL，空陣列與缺欄位均保留 |
| 新 feedback 沒有 overallImpression | brews.flavor_feedback jsonb | 不需 SQL，不補偽造印象；舊 balance／flavorNotes 保留 |
| Brew.beanId | brews.bean_id nullable text | 需 SQL；(user_id,bean_id) → beans(user_id,id)，不 cascade 刪 Brew |
| Brew.appliedAdjustment（含 null 與有值） | brews.applied_adjustment nullable jsonb | 需 SQL＋雙向 mapper；不可只存 adjustment 而丟 changes／來源／appliedValue |
| Brew.sourcePreparationId | brews.source_preparation_id nullable text | 需 SQL＋mapper；來源準備完成後可被消耗，不能要求來源仍為 active |
| Brew.legacyPreparationId | brews.legacy_preparation_id nullable text | 需 SQL＋mapper；保留舊 redirect 語意 |
| 非空 Bean 庫（包括 tombstone） | 新 public.beans 表 | 需 SQL＋Bean mapper／repository；欄位詳下 |
| Bean 庫損壞 beanCatalogUnavailable | 無合法雲端目的地 | 繼續 fail closed，不能把損壞原件當空庫 |
| profiles.preferences.displayNameConfirmed／experienceLevelSource | profiles.preferences jsonb | 不需 SQL；merge 保留不相關 key，不把 unset 當使用者選擇 |
| 已存準備 entries | 新 public.brew_preparations 表 | 需 SQL＋mapper／repository，不能誤當 Suggested Plan |
| 準備 deletedIds | brew_preparations 的 tombstone row | 需 SQL，payload 可為 null 以表達只有 id 的舊 tombstone |
| Bean legacyImportReviewed、準備 redirects／lineage 等 envelope 狀態 | 新表的狀態 JSONB row（按 user_id） | 需列入 B 的狀態儲存，避免只搬 entries 導致舊準備復活、重匯入或 lineage 消失 |

目前 record_details 的豆子文字、器具、實際粉／水／溫度與 notes 已有完整 JSONB schema；本批無 TDS 欄位。既有 execution_run／current_stage_paused_seconds 已由上一筆 timing migration 與 mapper 支援，不需再加欄位。

## B 的新增 SQL 契約

- beans：user_id → auth.users、id、完整 BeanRecord payload JSONB（所有選填欄位、legacyKeys、unlinkPending、createdAt／updatedAt／deletedAt）、revision、created_at／updated_at／deleted_at。主鍵／唯一鍵 (user_id,id)，支援跨帳號相同本機 id，保留 tombstone 內容。
- brew_preparations：同樣 owner／revision／timestamps／soft-delete，完整 SavedBrewPreparation payload JSONB（snapshot、plan、beanId、sourceBrewId、appliedAdjustment、legacyPlanId、legacyBrewId、id 與原始時間）；payload 可 null，但只限刪除 tombstone。
- 本機庫狀態：每個 owner 一筆 state JSONB，保留 Bean 的 legacyImportReviewed 與準備 envelope metadata／deletedIds；不把 metadata 混進 profiles.preferences。若保留備份／processedRaw，視為不透明資料，不重跑其中的舊轉換。
- brews 新增 bean_id、source_preparation_id、legacy_preparation_id、applied_adjustment，以及 applied_adjustment_present boolean（預設 false）；最後一欄保存 appliedAdjustment 缺欄位與 explicit null 的差異，避免 round-trip 產生新欄位。
- 所有新表 RLS select／insert／update 都使用 authenticated＋auth.uid() owner；UPDATE 同時 USING／WITH CHECK。明確 revoke anon／authenticated 既有權限後只 grant select／insert／update，不開 hard delete。timestamps 使用既有 set_updated_at。加 user_id／關聯索引，約束不重複建立。
- Bean 刪除走 tombstone，不 cascade 刪 Brew；sourcePreparationId／legacyPreparationId 是歷史識別，不因消耗或缺少 active 準備就刪除／改寫 Brew。參照先以 graph 驗證可解析的來源，不能把舊紀錄全部判損壞。

## 讀取 schema／mapper 目前狀態

- cloud-row-schemas.ts 的 brewRowSchema 是 z.object，未知根層 key 預設 strip，故未宣告新 SQL 欄位必定遺失；toBrewInsert／fromBrewRow 也未映射四個根層欄位。
- recipe_snapshot／brew_plan 已用 local-brew-schema.ts 儲存 shape，grind 已是 storedGrindSettingSchema，不會依型號格式／上下限拒絕歷史資料。C 必須補登錄表變更後的遠端 round-trip 回歸。
- flavor_feedback 已用 flavorFeedbackSchema（stars 與 impression 選填），不是新輸入必填星等 schema；舊印象可讀且不換算。
- 目前尚無 Bean／準備的遠端 row schema／repository。新增者不能使用 beanInputSchema 或 isValidPreparation 等輸入規則重驗舊紀錄，也不能用只接受 active 的 parseActiveRow 來讀 tombstone。
- profile mapper 回傳 preferences，但 StoredUserProfile／profile migration 與 update 路徑還需逐處確認 merge，不能只驗 mapper 單一函式便宣稱無損。display_name 的讀取也應避免 JS UTF-16 長度規則拒絕 Postgres 已接受的 emoji 名稱。
- 遠端日期要接受資料庫實際輸出的時區格式，再規範化為 ISO；純 mapper 測試不能取代本機 Postgres 實際讀回驗證。

## D 必須一起補的搬移邊界

目前 graph 只有 profile／brews／suggestedPlans，Bean 為 unknown[]，沒有準備；composition 也只有 Bean 本機 repository，沒有準備與新遠端 repository。review 的 counts／fingerprint、遠端 preflight、gateway、checkpoint、progress、resume 與最終驗證都必須加入新實體及狀態。

寫入順序為 profile（帳號前置）→ beans → preparations／庫狀態 → brews → suggested_plans → 原有 cyclic reference patches → 全圖讀回驗證。checkpoint 加入 Bean／準備完成 id 與 state 標記，舊 completed checkpoint 不能直接代表新增資料已搬完；中斷續跑按 owner＋id 冪等，不覆寫他人／衝突版本，不讓 tombstone 復活。

只有完整 round-trip 與本機實際搬移已覆蓋的阻擋才能解除。損壞庫、無法解析的關聯、跨帳號 owner、未知／未覆蓋 payload 持續 fail closed。本批不切換 runtime mode、不做持續雙向同步；本機資料原件不刪除。

## 驗證依據與環境

Docker Desktop engine 可連線，Supabase CLI 2.111.0 可由 npm exec --offline 使用；尚未啟動／套用本批 SQL。B 必須驗證 db reset --local、security／performance advisors、RLS 跨帳號與複合外鍵、SQL 重跑及本機產型別。若本機堆疊起不來，依協作板在 B 停下來，不改用雲端。

參考：[本機工作流程](https://supabase.com/docs/guides/local-development/cli-workflows)、[本機 db reset](https://supabase.com/docs/reference/cli/supabase-db-reset)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。CLI 目標預設不一致，所有資料庫命令明確選本機，禁止 --linked／雲端 db-url／雲端 MCP 寫入。
A 驗證：lint 無警告、typecheck、70 檔／978 tests、npm run build 全過；尚未改程式、套 SQL 或解除任何阻擋。
