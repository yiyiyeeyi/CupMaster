# Vertical Slices

Deliver one slice at a time. Slice 1 is completion of the first cup; the former Discover → Recipe Detail → Save → Collection flow is retired as a first slice.

## Vertical Slice 1 — 完成第一杯
**Flow:** Welcome → Experience → Discover → Recipe Detail → Quick Prepare → Manual Live Brew → Brew Complete → Journal → Brew Detail

- **使用者價值：** Without Bean, full gear, AI, or prior knowledge, a first-time user follows defaults, finishes one cup, and saves a useful record.
- **頁面：** Welcome/display name, experience, Discover, Recipe Detail, Quick Prepare, Live Brew, Complete, Journal, detail.
- **資料：** minimal profile, Recipe/Version/Steps, QuickPrepareInput, BrewPlan, immutable Recipe Snapshot, stage results, Brew statuses.
- **元件：** recipe card/detail, compact parameter confirmation, stage/timer/weight controls, completion summary, journal row.
- **狀態：** onboarding progress; execution not_started/in_progress/paused/completed/abandoned; record draft/saved; feedback and analysis initially not_requested.
- **驗收條件：** recipe defaults are sufficient; Bean/grind/My Gear may be empty; Quick Prepare creates plan and snapshot; pause preserves draft; completed Brew saves and appears in Journal/detail without feedback or AI.
- **不包含功能：** Collection/My Library, AI Analysis/Ask AI, camera/OCR/AR, full Bean or Equipment CRUD, full flavor feedback, Fork Recipe, recommendation engine.
- **mock 範圍：** recipes and onboarding state may be fixtures/in-memory; live stages use local state; no fake AI response.
- **後端需求：** later repositories for profile, recipe read, Brew create/update/save; none connected in the current skeleton.

## Vertical Slice 2 — 稍後補充與改善
**Flow:** Journal → Brew Detail → 補充 Bean／Equipment／Flavor → AI Analysis → Save Next Plan → Brew Again

- **使用者價值：** Return at a convenient time, enrich a saved cup, understand likely impacts, and try one focused change.
- **頁面：** Journal, Brew Detail/edit, feedback, analysis, next-plan review, Quick Prepare/Brew Again.
- **資料：** optional Bean/equipment metadata, FlavorFeedback, analysis result, Insight/evidence, SuggestedPlan and primary change.
- **元件：** progressive edit sections, flavor input, analysis trigger/result, evidence view, next-plan diff.
- **狀態：** awaiting/completed/skipped feedback; analysis not_requested/ready/processing/completed/failed; saved plan.
- **驗收條件：** original Brew remains saved; missing data is explicit; analysis is opt-in and evidence-backed; deterministic differences are code-computed; one primary change; Brew Again creates a new snapshot.
- **不包含功能：** automatic diagnosis, medical/scientific certainty, multi-variable optimization, camera/OCR/AR, full recommendation engine.
- **mock 範圍：** AI contract fixture may validate UI states; label it mock and never imply a real result.
- **後端需求：** authenticated updates, analysis job/API with server-only key, validated output storage, SuggestedPlan persistence.

## Vertical Slice 3 — 新手器材引導
**Flow:** Experience → Gear Guide → My Gear → Recipe Compatibility → Quick Prepare Auto-fill

- **使用者價值：** Understand what to buy/use and reduce setup uncertainty without making ownership mandatory.
- **頁面：** experience entry, guide/list/detail, optional My Gear, compatibility, Quick Prepare.
- **資料：** GearGuideItem, Equipment, calibration/grinder settings, compatibility rules, sourced auto-fill values.
- **元件：** beginner setup card, criteria comparison, owned toggle/form, compatibility explanation, auto-fill disclosure.
- **狀態：** browsing guidance, optional saved gear, compatible/conditional/unknown, accepted/overridden auto-fill.
- **驗收條件：** Gear Guide and My Gear stay distinct; users with no gear profile can brew; auto-fill reveals source and is editable; defaults remain fallback.
- **不包含功能：** commerce checkout, affiliate optimization, exhaustive catalog, mandatory calibration, automated hardware detection.
- **mock 範圍：** curated guide fixtures and deterministic compatibility rules for a small supported set.
- **後端需求：** guide content read, optional equipment CRUD, versioned compatibility rules and calibration persistence.

## Vertical Slice 4 — 探索與保存
**Flow:** Discover → Save Recipe → My Library → Want to Try → Start Brew

- **使用者價值：** Save promising recipes, organize intent, and launch them later without replacing the direct brew path.
- **頁面：** Discover, Recipe Detail, save action, My Library, Want to Try, Quick Prepare.
- **資料：** CollectionItem linked to Recipe, list membership, saved timestamp; Brew still creates its own snapshot.
- **元件：** save control, library list/filter, Want to Try action, Start Brew action.
- **狀態：** unsaved/saved, saved/want_to_try list, loading/error/empty, removed.
- **驗收條件：** Collection lives under My Library and outside bottom nav; save is reversible; Start Brew works without saving; history does not depend on mutable recipes.
- **不包含功能：** first-cup onboarding, social collections, collaborative lists, Fork Recipe, recommendation engine.
- **mock 範圍：** fixture recipes and local collection repository may demonstrate states.
- **後端需求：** authenticated collection CRUD, uniqueness/idempotency, recipe availability handling.
