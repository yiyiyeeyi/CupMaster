# CupMaster 視覺規範（v17，2026-10-26）

方向：**Standart 式的精品咖啡刊物感**，同時要好用、好讀。
設計稿的畫布是 390×844（iPhone）。數值以 px 標示，實作時可轉成 rem 或 token。
要查精確數值，打開 `source/` 裡對應的 HTML。

---

## 1. 顏色

| Token | 值 | 用途 |
| --- | --- | --- |
| `--bg` | `#faf8f4` | 頁面底色（米白） |
| `--ink` | `#211a16` | 主文字、深色按鈕、區塊上緣的粗線 |
| `--ink-2` | `#6f6259` | 次要文字（子列標籤、說明） |
| `--mute` | `#8f8177` | 灰色小字、標籤、未選中的分頁 |
| `--rule` | `#e3ddd3` | 細分隔線 |
| `--tile` | `#f1ede6` | 豆袋、器物的素色底 |
| `--accent` | `#8a3f24` | 磚紅：AI ✦、改過的值、「還沒評分」、晚／快幾秒、hover |
| `--green` | `#3f5a4a` | 只用在 ↑（比上一杯好） |
| `--line-off` | `#cfc6b8` | 勾勾框未選中的邊框 |
| `--star-off` | `#d6cec2` | 空星 |
| `--popover` | `#fffdf9` | 小選單卡片底色 |

Live Brew（深色畫面）：

| Token | 值 | 用途 |
| --- | --- | --- |
| `--live-bg` | `#3a302a`（有鏡頭）／`#211a16`（無鏡頭） | 底色 |
| `--live-text` | `#f6f2ea` | 文字、已完成的進度、主按鈕底色 |
| `--live-warm` | `#e8c7a2` | 目前階段的進度、換水溫的數字 |
| 未到階段 | `rgba(246,242,234,.22)` | 進度條 |

規則：
- accent 只用在「需要注意或被改過」的地方，不拿來裝飾。
- 不用大面積色塊、卡片陰影、漸層。唯一的漸層是 Live Brew 底部，用來讓字看得清楚。
- 豆袋顏色來自豆子本身，是使用者內容，不是 UI 色。

## 2. 字體

| 角色 | 字體 | 用在 |
| --- | --- | --- |
| 英文標題與數字 | **Cormorant Garamond** 400 | 頁名（Discover、Journal）、配方名、所有大數字 |
| 中文標題 | **Noto Serif TC** 400 | 豆名、沖法名（4:6 法）、AI 結論句、引言 |
| 內文與操作 | **Inter** + **Noto Sans TC**，300（一般）／400（列標題）／500（選中） | 標籤、說明、按鈕、導覽 |

- **數字一律用 lining figures**：`font-variant-numeric: lining-nums tabular-nums`。
  Cormorant 預設是舊式數字（1 看起來像 I、0 像 o），每個數字元素都要加，input 和 button 也是。
  這次發現 Journal 和 Live Brew 的大數字漏加，已補上。
- 等寬字體不要用。

### 字級

| 用途 | 大小 | 字體 |
| --- | --- | --- |
| Live Brew 目標克數 | 104 | Cormorant |
| 分頁大標（Discover / Journal / Profile） | 40，line-height 1 | Cormorant |
| 配方名（Recipe Detail） | 36–40 | Cormorant |
| 次頁置中標題（Prepare、Analysis） | 24 | Cormorant |
| 豆名（Bean Detail 主視覺） | 24 | Noto Serif TC |
| 沖法名（Discover 貼文） | 24 | Noto Serif TC |
| 參數格數字 | 22（單位 12 sans 灰色） | Cormorant |
| 列中的數值（Prepare、Journal 粉水比） | 20 | Cormorant |
| 步驟水量 | 17 | Cormorant |
| 列標題 | 13，400 | Sans |
| 內文、子列 | 12 | Sans |
| 灰色說明 | 11 | Sans |
| 分區標籤（大寫英文或短中文） | 10，letter-spacing .2em，灰色 | Sans |
| 頁首 kicker（BEFORE YOU BREW） | 10，letter-spacing .24em | Sans |

## 3. 版面

- 左右邊距 24。頁首區：狀態列下方 46–50 開始；返回鍵是 44×44 的觸控區。
- 次頁頁首：左邊返回、中間 kicker＋標題、右邊動作，三欄 `44px 1fr 44px`。
- 內容區之下是固定的底部按鈕：bottom 96（導覽 84＋間距 12），高 52。
- 底部導覽：高 84（含 safe-area 16），上緣一條 `.5px` 細線，五等分。Brew 是 40px 深色圓。
- 實作時要考慮 `env(safe-area-inset-bottom)`，不能讓頁面左右捲動。

## 4. 線

- 區塊開始：`.5px solid --ink`（深色細線，雜誌的欄線感）。
- 列與列之間：`.5px solid --rule`。
- 「我的紀錄」等大段落之間：深色線＋上方 22 的間距。
- 圓角：除了 Brew 圓鈕、Live Brew 控制鈕、拖拉把手之外，**一律直角**。

## 5. 元件

### 按鈕
- 主按鈕：高 52、`--ink` 底、`--bg` 字、15px、letter-spacing .04em；文字後面可加 → 圖示。
- 線框按鈕：高 52、`.8px solid --ink`、透明底、14px。
- 兩顆並排：`grid-template-columns: 1fr 1.6fr; gap: 10px`，左線框、右主按鈕。
- 文字連結：12–13px，必要時加 `.5px` 底線。

### 勾勾框（固定值）
- 視覺 10×10，`.6px` 邊框，**不填色**。
- 未選：邊框 `--line-off`。選中：邊框 `--ink-2`，裡面一個細勾（stroke 1.5、9px、`--ink`）。
- 觸控區要另外撐到 28×28 以上（實作請做到 44×44），但看起來要小，不能比旁邊的字搶眼。
- `role="checkbox"`、`aria-label="固定粉"` 這類標籤要寫。

### 參數格（3×2）
- 上緣深色線、下緣 rule，三欄等寬，欄與欄之間用 rule 線分隔。
- 每格：14px 灰色圖示 → 22px 數字＋12px 單位 → 10px 灰色標籤。
- 改過的格子：舊值 12px 灰色加刪除線，新值用 accent，右上角 5px accent 圓點。

### 列
- Prepare 群組標題：`22px 1fr auto`，18px 灰色圖示、13px 標題、右側 11px 灰字。
- 子列：高 40，`22px 1fr auto 28px`，最後一欄放勾勾框。
- 單列（水溫、器具）：高 50。
- Journal 列：`34px 1fr auto`，左邊豆袋 34×44、中間兩行、右邊粉水比。

### 分頁、標籤選擇
- 文字分頁：選中的變深色、500 字重，加 1px 深色底線；未選中的是灰色、300 字重。
- 不用膠囊（chip）或圓框標籤。

### 星等
- 文字星 ★，選中是 `--ink`，空星是 `--star-off`，10–11px，letter-spacing 1px。
- 評分頁用 5 顆大星（約 28px）。

### 上升／下降
- ↑ 用 `--green`，↓ 用 `--accent`，大小 12px，放在沖法後面。要有 aria-label，例「比上杯好」。

### 小選單（popover）
- 底色 `--popover`，`.5px` rule 邊框，`box-shadow: 0 10px 28px rgba(33,26,22,.14)`，padding 10 14 6。
- 一個 9px 旋轉方塊當小三角，指向觸發的那一列。
- 背景遮罩 `rgba(33,26,22,.06)`，非常淡。
- 滾輪：每項高 32，選中項上下各一條 `.5px --ink` 線。與選中項距離 1 的透明度 .45，距離 2 的透明度 .2。數字滾輪用 Cormorant 20／16。

### 豆袋
- 豆子的代表圖一律是去背豆袋，放在 `--tile` 素色底上。設計稿用 SVG 示意，實作時換成使用者拍照後去背的圖。

### 圖示
- 線條圖示，stroke 1.2–1.5、round join，大小 14–22。
- AI 一律用 ✦（spark）圖示。

## 6. 動態
- 克制：只做小選單出現、滾輪吸附、頁面切換的淡入。
- 要尊重 `prefers-reduced-motion`。

## 7. 無障礙
- 觸控區至少 44×44（視覺可以更小）。
- focus-visible：`1.5px solid --accent`，outline-offset 2。
- 狀態不能只靠顏色（見 ui-ux-spec §0.8）。
- 圖片和豆袋要有 aria-label，例「哥倫比亞 水洗 豆袋」。
