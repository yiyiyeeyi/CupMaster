# Vertical Slices

Cloud 3-2 is infrastructure adjacent to every slice. It centralizes repository construction and defines migration readiness, but runtime remains Local and no slice uploads, syncs, or changes behavior. Cloud 4—not this increment—will begin explicit Local-to-cloud migration; Cloud 5 is reserved for sync.

Cloud 4-2 is account infrastructure outside the product slices. It copies one explicitly reviewed snapshot. Discover, Brew, Journal, Analysis, Plans, and Demo continue using Local repositories afterward.

Cloud 2 is infrastructure adjacent to the slices: optional Auth and recovery coexist with Local Mode. It does not gate a slice, migrate LocalStorage, enable remote repositories, or claim data is synchronized.

Auth completion polish adds an independent signup confirmation state and resend controls without changing Local Mode, repositories, or any product slice.

Cloud 1 does not change either implemented product slice. It adds an unpushed schema/RLS/mapper contract beneath the repository boundary while every current UI flow continues through LocalStorage.

Local MVP acceptance uses development-only fixture modes to make the implemented states repeatable without changing either slice. Full Demo covers the first-cup flow and the later Feedback, details, local preview Analysis, one-change Next Try, handoff, second Brew, and result loop. The fixtures are QA support only: they do not imply Supabase, real AI, global Plan management, or completed future slices.

The current integration closes the Source Brew -> Suggested Plan -> resulting Brew loop. Source Brew Detail shows the latest Plan and links to a source-scoped list when more exist; resulting Brew retains its embedded handoff context even if Plan storage is unavailable. Journal uses batch projections rather than N+1 reads.

The current increment completes two prior handoff gaps: user-triggered, execution-aware Suggested Plan repair and Journal Home projection for Next Try. Journal displays the embedded Brew handoff decision (`Review required`, `Accepted`, or `Overridden`) and deterministic continuation route. It does not introduce an automatic repair, recommendation engine, or new Brew workflow.

The handoff UI increment adds stateful Plan Detail actions, Brew Hub preparation/ready/in-progress projection, Live Brew coordinator start and retryable sync notice, and compact Next Try projections. Reads refresh local repositories before actions; repair and sync are explicit, never automatic.

The Suggested Plan handoff core now uses deterministic `suggested:{planId}` Brew IDs, `createOrGetResultingBrew`, source-based mapping repair, and retryable usage sync. This increment covers data/application behavior only; full Plan Detail, Brew Hub, Journal, and Brew Detail projections remain a later UI increment.

## Current implementation note — Analysis recommendation to Next Try

Slice 2 now continues from a completed local preview Analysis through selecting a convertible recommendation, explicit confirmation, a persisted one-change Suggested Plan, Plan Detail, and `Start This Brew` creating a new `not_started` Brew draft. Brew Detail and Analysis expose existing Plans. The flow is deterministic and idempotent; it never mutates the historical Brew, Recipe, Analysis, or Snapshot. It does not include real AI, automatic application, Plan CRUD/collection management, comparison history, or auto-started brewing.

## Current implementation note — Quick Prepare to local Draft

The implemented portion of Slice 1 now continues from Recipe Detail through Quick Prepare to a locally persisted Brew Draft and a static Manual Live Brew foundation. Quick Prepare follows design/03 with a centered header, recipe summary, editable parameter rows, optional details, ratio summary, and one dark CTA. Current product rules supersede the design's required Bean and interactive AI areas: Bean remains optional and AI is replaced by non-interactive explanatory copy.

Submission validates input, creates a BrewPlan plus independent deep-copied Snapshot, stores a versioned Draft, and routes to `/brew/[brewId]`. The destination follows design/04 proportions with compact metrics, a large stage/target focal area, full stages, and Current/Target/Remaining. It does not activate execution or expose fake timer, pause, finish, auto-next, AR, or camera controls.

The next implemented increment activates Start Brew Session and manual stage progression. Timestamp-derived total/stage timers recover after reload or tab switching. Each completion saves one Stage Result with no fabricated weight and moves to the next Snapshot step. Finishing all steps does not yet complete the Brew; Brew Complete remains an upcoming disabled transition. `/brew` offers a deterministic Continue current brew link to the most recently updated in-progress Draft.

The completion increment now requires an explicit action after all stages, then separates `executionStatus: completed` from `recordStatus: saved`. Brew Complete follows design/05 using only real target/time data, an optional quick feeling, and no fabricated TDS, extraction, actual weight, dose, or temperature. Journal follows design/14 as a focused Brew projection with saved and awaiting-save sections. Brew Detail combines the useful hierarchy of design/08 and design/15 but reads only the immutable Snapshot/results and omits AI, Collection, editing, and Brew Again.

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

The first Reflect portion is Journal → Brew Detail → Add/Edit/Skip Flavor Feedback → Brew Detail. Feedback may be added to completed drafts or saved Brews, reloads from the same embedded Brew record, and never requires Bean, Equipment, measurements, or AI. Brew Again and full Bean/Equipment editing remain outside the current implementation; Analysis and one-change Suggested Plans are covered by the later increments below.

The next implemented portion adds Brew Detail → Add/Edit Brew Details → Brew Detail. It records optional free-text Bean and Equipment fields plus optional actual values without modifying the planned Snapshot. Completed drafts and saved Brews share the same route and repository record. Bean/Equipment Libraries, CRUD, recommendations, AI, and external lookup remain out of scope.

The analysis preview increment adds Brew Detail → Request Preview Analysis → pending/completed/failed → structured result. A deterministic local rule provider implements the replaceable provider contract without network access. Results include data quality, confidence, evidence, limited recommendations, fingerprint-based outdated detection, and explicit disclaimers. This is not a real AI integration; an explicit later confirmation step may now copy one supported recommendation into an independent Suggested Plan without modifying historical data.

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

Cloud 4-3 is QA infrastructure, not a new product slice: deterministic Local smoke graph, read-only remote preflight, checkpoint inspection, fake-gateway recovery tests, and a manual real-Supabase protocol. Cloud 5 has not started.
