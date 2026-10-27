# CupMaster Design Source of Truth

> **2026-10-26 新版：** 最新定稿的 UI 在 `design/new/`（含畫面、互動邏輯、視覺規範）。
> 同一頁面以 `design/new/` 為準；那裡沒有的頁面才看下方 01–19 舊圖。

This folder contains the official UI designs for CupMaster.

All future frontend development MUST follow these designs.

If there is any conflict between:

- docs
- PRD
- existing components
- implementation

The UI designs are the source of truth.

---

## Rules

Do NOT redesign screens.

Do NOT change:

- Information architecture
- Navigation
- Component positions
- Typography hierarchy
- Button placement
- Page layout

unless explicitly requested.

---

## When implementing

1. Read related design first.

2. Reuse existing components whenever possible.

3. Keep spacing and visual hierarchy consistent.

4. Match interaction flow shown by the design.

5. If a design requires additional data structures,
extend domain models instead of changing the UI.

---

## Naming

Discover

Recipe Detail

Quick Prepare

Live Brew

Brew Summary

Flavor Feedback

AI Analysis

Journal

Collection

Profile

Ask AI

are the canonical page names.

Do not rename them during development.