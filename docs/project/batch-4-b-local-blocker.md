# 批次 4 B：本機 Supabase 啟動阻塞

狀態：**B 未完成，C／D 未開始，尚未到 E**。依 Claude 協作板 2026-10-28 的明確指示「本機 Supabase 起不來就停下來」，啟動失敗後停止後續實作；沒有改用雲端。

## 已做與可審查的草稿

- A 盤點已 push：cea3537；深度審查通知 c5bd361。
- CLI 2.111.0 經 npm exec --offline 可執行，Docker Desktop 4.95.0／Engine 29.8.2 回應正常，開始前沒有 Supabase containers。
- 由 CLI migration new 建立 `supabase/migrations/20261028063521_req37b_local_parity.sql`。這是**未驗證草稿**，不得套用雲端；新增 beans、brew_preparations、library_states、Brew 根層欄位、owner 複合 FK、RLS／grant／trigger／index。
- `supabase/tests/req37b_local_parity.sql` 是未執行的本機驗證草稿，預計以 rollback transaction 驗證跨帳號讀寫、owner 轉移、複合外鍵、tombstone 不刪 Brew、anon／hard-delete 權限。

## 唯一本機啟動嘗試

在 D:/Projects/CupMaster 執行：

```powershell
npm exec --offline -- supabase start --exclude realtime,storage-api,imgproxy,mailpit,studio,edge-runtime,logflare,vector,supavisor
```

排除的服務均非本批 Auth／REST／Postgres 所需；沒有使用 ignore-health-check，沒有 linked／雲端 db-url／project-id。已拉取本機 postgres／gotrue／kong／postgres-meta 等映像，但啟動命令 exit 1：

```text
LegacyDbConnectError
failed to connect to postgres: failed to connect to
host=127.0.0.1 user=postgres database=postgres:
Connection terminated unexpectedly
```

失敗後唯讀查 `docker ps -a --filter name=supabase` 無容器；`docker logs --tail 60 supabase_db_CupMaster` 回覆 No such container，沒有可讀的 DB log。不能據此認定是 SQL 錯誤，也不能宣稱新 migration 已成功套用。

啟動 log 保留在本次工作區外 QA 目錄 `batch1-qa/batch4-local-start.log`，沒有提交任何憑證或 log 中的本機密鑰。

## 未能執行的驗證

| 驗證 | 結果 |
|---|---|
| db reset --local，全部 migration 重播 | 未執行：本機堆疊未啟動 |
| 新 SQL 重複執行 | 未執行 |
| RLS／FK SQL 測試 | 未執行 |
| security advisors --local | 未執行 |
| performance advisors --local | 未執行 |
| gen types --local | 未執行；database.types.ts 未手改／偽造 |
| C 的 mapper／remote repository round-trip | 未開始 |
| D 的 checkpoint／解除 preflight／本機實際搬移 | 未開始；現有 fail-closed 阻擋全部保留 |

前一輪 A 的 lint／typecheck／70 檔978 tests／build 全過。SQL 草稿的 npm 檢查不代表資料庫驗證通過；B 不能打勾或標完成。

草稿交接前另跑一輪應用程式檢查：lint 無警告、typecheck、70 檔／978 tests、npm run build 全過。這些檢查未執行 SQL，資料庫驗證結果仍全部為上表的「未執行」。

恢復本機堆疊後才可接續 B 的 reset、advisors、RLS 與型別生成，再依序 C、D；E 仍是獨立停止關卡。**SQL 未套用雲端 ouniwzdxbcrektzynkak；未 merge main、未部署。**
