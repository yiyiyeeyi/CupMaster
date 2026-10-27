# 批次 1：UI 階段 2／Quick Prepare

2026-10-27；feature/camera-brew-runtime。

## 行為

- 粉／水固定框預設不勾。直接改任一數字，只有未固定的另一項會依目前比例連動；兩個固定時只改直接輸入項目。比例偏離配方以刪除線、箭頭、「已改」及數字底線提示；還原使用配方粉量／水量並保留固定框。水量變動同步縮放累積階段目標，保存的 Plan 與 Snapshot 保持一致。
- 磨豆機與格數獨立儲存；不因粉水、配方、溫度等變動自動換磨豆機。換配方保留使用者的磨豆機與格數，其他配方參數仍沿用 REQ-39 規則。
- 欄位旁小卡、CSS scroll-snap 選輪、鍵盤方向鍵與 Home／End、Escape 關閉、點外面關閉。器具小卡有濾杯與配件兩區，各自新增；配件可複選且預設空白。固定框觸控區 44×44，視覺維持小框。沒有原生 select。
- 更多設定含熱沖／冰沖、冰塊克數與每段七種注水方式。冰量獨立保存，未新增冰水扣抵或配方換算公式；既有水量及階段目標仍按使用者選定值運作。沒有加入新的冰沖建議或假量測。
- 保存準備後重新載入、建立 Brew、完成保存、再沖一杯，都保留新欄位。新操作只改準備副本，新 Brew 各有 Snapshot；原 Brew 不被改寫。

## 研磨來源

目前 repo 沒有經驗證的 μm 對照表。src/domain/prepare-grind.ts 的 production registry 為空，因此不顯示任何 μm 或約略粗細、不自動猜格數。可擴充的校準契約要求 HTTPS sourceUrl 與明確格數／μm 對照點；只有精確且有來源的匹配可換算，格數固定則不換。測試中的 example.test 合成點只驗證演算法，沒有打包成產品資料。旅程 08b 對照表內容仍待有真實來源後處理。

## 本機 schema／REQ-37b mapper 清單

欄位均為選填，沿用本機 envelope version 1；舊紀錄沒有欄位時保持缺省，不補寫假預設，不改 SQL 或遠端 schema。

| 位置 | 新欄位 |
| --- | --- |
| BrewRecipeSnapshot | brewTemperatureMode: hot／iced；iceGrams: 正數，僅冰沖使用 |
| BrewRecipeSnapshot.equipment | grinderSetting: string；accessories: string[]；沿用已有 grinder、dripper、notes |
| BrewPlan | equipment: { grinder?, grinderSetting?, accessories? }；brewTemperatureMode?；iceGrams? |
| RecipeStep／BrewStage | pourMethod?: circle／center／outward／inward／coin／excavate／drain（Snapshot 步驟在上一個 commit 已開始支援） |

synchronizePreparation 同步以上欄位，儲存與建立前驗證；冰沖缺冰量拒絕儲存，保留輸入可修正。雲端 mapper 尚未包含新欄位，由 REQ-37b 承接；不把本機完成誤稱為已同步。

## 驗證

純函式先寫先測；涵蓋五種固定狀態、直接改固定項、目前比例延續、偏離與還原、非法數字、格數固定與來源缺失。整合測試涵蓋新欄位保存／讀取／建 Brew／舊資料、原 Snapshot 不變，以及換配方保留磨豆機。

390×844 隔離 QA 瀏覽器實際操作：改粉量連動水量 → 固定水改粉 → 還原 → 自訂磨豆機／24 格 → 自訂濾杯／複選配件 → 冰沖／150g 冰塊 → 每段方式 → 先存起來 → 重讀 → 開始 → 拒絕相機 → 計時語音 → 滴濾手動確認 → 保存 → 再沖一杯。均無水平捲動；截圖在本次 visualizations/batch1-qa/screens-stage3。QA 名稱只存在隔離瀏覽器，不入產品 fixture 或 git。

提交前執行 lint、typecheck、全部測試、webpack production build。已知既有 lint warning 僅 Claude 認領的 layout Google Fonts link。

最終結果：63 檔、922 測試全過；lint／typecheck／webpack build 通過。Production 手機流程通過；方向鍵將粉量 15 改為 15.5，Escape 關閉後焦點回到粉量欄位。實作 commit：6d1cff9。
