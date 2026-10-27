# CupMaster 新版 UI（design/new）

2026-10-26 由 yiyi 與 Claude 定稿的新版介面（設計稿版本 v17）。
Claude 負責視覺／UI，Codex 負責邏輯／資料，兩邊都以這個資料夾為準。

## 跟舊圖的關係

- `design/01–19.png` 是舊版。**同一個頁面如果這裡有新圖，以這裡為準**；這裡沒有的頁面，暫時沿用舊圖。
- `docs/design-system.md` 裡「不做五格導覽、不做 Collection／Me、不做鏡頭、不做 AI」等排除條款，
  是舊階段的範圍限制。新版 UI 的版面方向已經定案，但**功能仍分階段做**：還沒有資料或邏輯的區塊，
  照 `ui-ux-spec.md` 的「分階段」說明處理，不要用假資料填滿，也不要捏造量測值。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `ui-ux-spec.md` | 每一頁放什麼、互動邏輯、狀態、文案原則 |
| `visual-spec.md` | 顏色、字體、數字、間距、元件規格 |
| `screens/*.png` | 每頁 390×844 截圖（iPhone 寬度） |
| `source/*.html` | 對應設計稿原始 HTML（inline style，可直接查尺寸和顏色；只當參考，不要整段貼進 React） |

`04b–04f` 是 Live Brew 的不同狀態，原始碼都在 `source/04-live-brew-pour.html`（用 mode 切換）。

## 頁面索引

| 編號 | 頁面（canonical 名稱） | 截圖 |
| --- | --- | --- |
| 01 | Discover | `01-discover.png` |
| 02 | Recipe Detail | `02-recipe-detail.png` |
| 03 | Quick Prepare | `03-quick-prepare.png`、`03b`（展開更多）、`03c`（粉水比已改） |
| 03d–f | Quick Prepare 的小選單 | 磨豆機、格數、器具 |
| 04 | Live Brew | 注水、悶蒸等待、等濾乾、換水溫、右上選單、不開鏡頭 |
| 05 | Brew Summary（這一杯：剛沖完、還沒評分） | `05-brew-summary.png` |
| 06 | Flavor Feedback | `06-flavor-feedback.png` |
| 07 | AI Analysis（免費版／訂閱版） | `07`、`07b` |
| 08 | Journal Detail（這一杯：已評分） | `08-journal-detail.png` |
| 09 | Journal Edit | `09-journal-edit.png` |
| 10 | Collection | `10-collection.png` |
| 11 | Bean Detail | `11`、`11b`（展開更多） |
| 13 | Saved Plan（配方的新版本） | `13-saved-plan.png` |
| 14 | Journal | `14-journal.png` |
| 17 | Profile（Me） | `17-profile.png` |
| 18 | Profile Settings（沖煮習慣） | `18-profile-settings.png` |
| 19 | Ask AI | `19-ask-ai.png` |
| 20 | Onboarding | **草稿，yiyi 還不滿意，先不要實作** |
| 21 | Auth（登入／註冊） | `21-auth.png` |

還沒畫：我的配方（舊 12）、第一次手沖教學頁、分享卡／分享影片（暫緩）。

## 設計稿位置

完整畫布（含歷次版本與 yiyi 的便利貼）：https://claude.ai/artifact/AxgU5yhB6hJRY63TDsTSBT
（私人連結，Codex 不一定打得開；以本資料夾為準。）
