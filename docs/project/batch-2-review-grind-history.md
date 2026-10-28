# 批次 2 審查修正：P1／P3

儲存層的 Brew Plan、Recipe Snapshot（含儲存準備）改用 storedGrindSettingSchema，只驗證原本的 discriminated union 形狀，不查目前磨豆機登錄表。grindSettingSchema 保留登錄表的格式、範圍與 Ode 終點規則，供 picker、換機及 isValidPreparation／新建驗證使用。

deriveGrind 改用形狀 safeParse；形狀不合法原樣返回，不丟例外。型號未知或目前格式與歷史不同時，仍顯示存下的 value／parts，不猜格式、不換算，不套不相容格式的單位。原始歷史資料不改寫。

登錄表已註記：已發佈格式與範圍只能放寬；收緊或改格式必須附資料遷移。未變更 SQL、雲端或產品流程。

回歸測試先建立合法有豆子與刻度的 Brew／準備，再替換收緊範圍、改格式、移除型號的測試登錄表：確認新輸入仍拒絕，歷史讀取、Journal、Bean Detail 使用的 CollectionService＋beanBrews 仍保留紀錄與原數字，儲存原件不變；另測 malformed deriveGrind 不丟例外。

驗證：lint 無警告、typecheck、68 檔／963 tests、npm run build 全過。無 UI 版型變更；Bean Detail 驗證涵蓋其資料讀取路徑，未額外宣稱此次做了瀏覽器或實機測試。
