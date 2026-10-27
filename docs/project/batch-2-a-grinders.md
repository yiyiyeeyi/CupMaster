# 批次 2 A：結構化磨豆機刻度

七台型號登錄於 src/domain/grinders.ts，附品牌來源連結。單一整數、複合 parts 陣列、自由數字三種格式依型號決定；未知型號採 number，不猜 legacy 字串。沒有可信機械上限的 C3／C40／K-Ultra 圈數不虛構 max，選輪可延伸「更多刻度」；有來源的 ESP 1–40、Breville 1–60、Ode 1–11／小格 0–2 有界限，Ode 11 僅接受小格 0。

唯一來源為 Snapshot.grind { grinderId, format, parts 或 value }。equipment.grinderSetting、grindDescription、Plan.grind 與 Plan.grindSetting 都由它推導；舊字串沒有 grind 時原樣保留。不同格式或不合法新範圍會清空並提示重新設定，不換算、不顯示 μm。比較只接受同機同格式。

P1 preflight 已阻擋 Snapshot／Plan.grind 與 equipment.grinderId；REQ-37b Notion 已補 mapper 清單。文字型 AI 研磨建議不能猜改結構化刻度，明確拒絕並提示到 Quick Prepare 調整；其他調整維持原行為。這是 A 取代 P2 研磨雙來源的實作。

來源：Timemore 官方 Download Center；Comandante C40 官方手冊；Baratza ESP 官方手冊；Breville BCG820 官方手冊；1Zpresso 官方 grind-setting 表；Fellow 官方 compare-grinders 與原廠配方記號；Eureka 官方 Specialità 規格。來源 URL 均隨登錄項保存。這些是刻度格式資料，不是粒徑對照。

驗證：lint 無警告、typecheck、65 檔／943 tests、npm run build 全過。Production 390×844 實際操作 Timemore 18、K-Ultra 0.9.2、Eureka 2.5 與格式清空提示，保存 canonical number 2.5 成功。圖在本次 QA screens-batch2-a。
