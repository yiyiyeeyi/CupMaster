# REQ-37b D：解除本機遷移阻擋

## 已完成

- 只移除已由 C mapper/repository round-trip 覆蓋的 Bean、preparation、library metadata、Brew 與 Plan 阻擋；資料目錄不可用或重複仍 fail closed。
- 搬移依 Bean → preparation → Brew → Suggested Plan → library metadata；已有 checkpoint 可續跑，重試不重複建立已寫入資料。
- 多裝置 library metadata 先讀遠端再合併：`deletedIds` 聯集、`redirects`／`lineage` 依 key 合併、`legacyImportReviewed` OR。相同 key 值衝突時保留遠端值，警告寫入本機 migration checkpoint 並顯示；revision conflict 時重讀並重合併一次。
- 遠端 Bean／preparation tombstone 不會被本機 active entity 復活。
- 更新了 `brewParityColumnsSchema` 註解，說明 runtime validation 與本機生成 `Database` 型別的分工。
- 新增明確 opt-in 的本機 Supabase Auth/API E2E：建立暫時測試帳號，遷移 Bean、已存 preparation 與三種研磨格式的冰沖／星等 Brew，透過 remote repositories 讀回 Journal、Collection／Bean Detail 投影及 library metadata，再刪除本機測試帳號。測試只接受 localhost URL，預設在一般 Vitest 執行中 skip。

## 驗證

- lint 無警告、typecheck 通過。
- 72 個測試檔通過，1006 passed；1 個 opt-in 本機 Supabase E2E skipped。
- `npm run build`（webpack）通過。
- E2E 仍待 Docker Desktop daemon 可用後實跑；在此之前 D 的 E2E 清單保持未完成。

## 範圍與限制

只將 SQL migration 套用在本機的先前驗證已完成。本步沒有連雲端或部署；REQ-37b 的 E 停止關卡尚未執行。
