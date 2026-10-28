# 批次 4 C：REQ-37b parity mapper 與 remote gateway

## 實作

- `cloud-row-schemas.ts` 以 Zod 驗證 Brew 新根欄位與 beans／brew_preparations／library_states 儲存列；形狀驗證不依賴研磨登錄表目前的範圍或格式。
- Bean mapper 保留完整欄位與 tombstone payload；preparation mapper保留完整準備或 null-payload tombstone；library state 僅白名單同步 metadata，raw backups／processedRaw／warnings 留在本機。
- Brew mapper 映射 beanId、sourcePreparationId、legacyPreparationId 與 appliedAdjustment。presence bit 區別欄位缺席與明確 null。
- 新增 owner-scoped `SupabaseParityRepository`，提供 migration 讀取（含 tombstones）、revision 條件寫入及 library state 讀寫。
- `CloudParityMigrationGateway` 將依賴順序固定為 beans → brew_preparations → brews → suggested_plans → library_states，任何請求失敗即停止。PostgREST transaction 每請求各自結束，FK 的 deferrable 不跨請求生效，靠先寫 Bean 保護 Brew FK。
- Profile mapper/repository 保留 preferences；更新時合併輸入 key，避免覆寫雲端不相關的 preference markers。

## 驗證

- `local-parity.test.ts`：全欄位 Brew／Bean／準備 round-trip、三種 grind registry formats、presence/null、legacy 欄位、library whitelist、payload identity 等 14 個案例。
- remote repository fake Supabase client 與 gateway fake 測試驗證 owner filter、tombstones、preferences merge、寫入次序與失敗即停。
- lint（無警告）、typecheck、72 test files／998 tests、`npm run build` 全通過。
- 本機 Supabase B 驗證已完成，詳見 `batch-4-b-local-blocker.md`；C 的 mapper/gateway 測試使用 fake clients，沒有連遠端 DB。

## 範圍與限制

- D 的 preflight 在 C 交付時仍 fail-closed；沒有解鎖未驗證欄位。
- 雲端 migration 未執行；不 merge main、不部署。Migration `20261028063521_req37b_local_parity.sql` 只套用本機 Supabase，仍等待 Claude 深度審查與 yiyi 明確授權才能考慮雲端。
