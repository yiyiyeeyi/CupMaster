# Data Model

Cloud 1 maps the existing domain to `profiles`, `brews`, and `suggested_plans` without changing Local runtime behavior. Queryable ownership, status, timestamps, graph references, revision, and soft deletion are relational; immutable and structured Brew payloads remain JSONB behind existing Zod schemas. Brew and Plan text IDs are preserved. See `cloud-data-contract.md` for lifecycle, graph, and provisional type details.

Development Demo fixtures are independent, schema-validated instances of the existing Profile, Brew, Snapshot, Analysis, and Suggested Plan models. They add no product entity or storage format. Cross-record validation checks unique URL-safe `demo-` IDs, source/result one-to-one mappings, lifecycle alignment, handoff confirmation, used/start timestamps, and Stage Result-to-Snapshot-step identity before repositories persist a batch.

Source Brew reverse projection is derived, not persisted. `JournalLoader` reads Brew storage once and Suggested Plan storage once, builds `sourceBrewId -> plans[]` and Brew ID maps, then produces view models. `getSourceBrewSuggestedPlanProjection` deterministically sorts by `updatedAt` descending, `createdAt` descending, and ID, while leaving Brew and Plan objects unchanged.

Execution-aware repair is distinct from storage migration. `repairSuggestedPlanState(planId)` is an explicit user action: it validates the one-to-one Plan/Brew link, then treats Brew execution as authoritative for only `resultingBrewId`, Plan `status`, and `usedAt`. It preserves the adjustment, source identifiers, evidence, snapshot, and Brew contents. An aligned pair returns `no_change` without a write.

UI projections read Plan plus resulting Brew but never merge them: Brew remains the execution fact and its embedded handoff remains the durable source for Accepted/Overridden display. `getSuggestedPlanExecutionProjection`, `getSuggestedPlanHandoffProjection`, and `getSuggestedPlanSyncStateForBrew` centralize these read-only interpretations.

Suggested Plan storage is version 2. A `draft` may have no resulting Brew or may hold `resultingBrewId` while preparation is pending; it must keep `usedAt:null`. `used` is valid only with both a resulting Brew ID and ISO `usedAt`, meaning that Brew actually started. Brew and Plan form a one-to-one mapping through `Brew.sourceSuggestedPlanId` and `Plan.resultingBrewId`.

## Suggested Plan draft

`SuggestedBrewPlan` is an independent, versioned local entity, not a mutation of Brew Analysis, Recipe, or historical Brew. It stores source Brew/Analysis/Recommendation IDs and fingerprint, generated timestamp, a deep-copied base Recipe Snapshot, exactly one typed adjustment, rationale, confidence, evidence, unchanged variables, lifecycle (`draft | used`), and the resulting Brew ID when used. Local persistence uses `{ version: 1, data: { plans } }` at `cupmaster:suggested-plans`; invalid collections fail safely without silently rewriting records.

Supported executable adjustments are grind, water temperature, total target time, and one stage duration. Starting a Plan creates a separate `not_started` Brew with a new Suggested Plan Snapshot; the source Brew, Analysis, and Snapshot remain immutable.

`UserProfile` stores display name, experience, and current needs only; onboarding does not create full Bean, Equipment, flavor, or AI profiles. `Recipe` points to versioned authored instructions. `QuickPrepareInput` overlays optional user input on recipe defaults and creates `BrewPlan` plus `BrewRecipeSnapshot`.

RecipeVersion also carries a description, explicit difficulty (`beginner`, `easy`, `intermediate`, `advanced`), and one or more roast-suitability values. These are validated domain data used by both Discover and Recipe Detail, not anonymous UI fields.

Local onboarding persistence uses a Zod-validated `{ version: 1, data }` envelope containing display name, experience, selected needs, completion state, and the resulting profile. Unknown versions, incomplete records, damaged JSON, and unavailable storage recover to a safe state rather than being cast into domain types.

`Brew` owns its snapshot and four independent status fields. Optional `FlavorFeedback`, `Insight`, and `SuggestedPlan` can arrive later. `Equipment` is owned gear; `GearGuideItem` is educational content. `CollectionItem` remains a My Library concern.

All observed values declare a source: `recipe_default`, `user_override`, `measured`, `calculated`, `user_reported`, or `inferred`. IDs are opaque strings and timestamps are ISO-8601 strings at domain boundaries.

## Quick Prepare and execution records

Quick Prepare validates dose, total water, temperature, dripper, and optional grind/Bean/equipment notes/user goal with Zod. Empty optional strings normalize to `undefined`. Ratio is calculated as `waterTotal / coffeeDose`; invalid inputs produce no ratio rather than `NaN` or infinity.

Each editable core parameter is a `ResolvedParameter` containing resolved `value`, `recipeDefault`, and `source`. This round produces only `recipe_default` or `user_override`. Reset restores dose, water, temperature, dripper, and grind while retaining Bean, equipment notes, and user goal.

`Recipe` is authored source data; `QuickPrepareInput` is validated input; `BrewPlan` is the execution plan; `BrewRecipeSnapshot` is the independent historical copy; `Brew` is the lifecycle record. Local Brew persistence uses the separate `cupmaster:brews` key and `{ version: 1, data: { brews: [] } }`. Each Draft validates independently, preserving valid entries when one is damaged.

All local and future API dates use ISO 8601 strings, including nullable lifecycle values such as `startedAt`. Formatting occurs only for display; domain objects do not mix `Date` instances and strings.

## Active Brew lifecycle

Starting a session writes one ISO timestamp to both `startedAt` and `currentStageStartedAt`, changes execution to `in_progress`, and updates `updatedAt`. Returning to an already in-progress Brew preserves those timestamps. `currentStageOrder` is a zero-based index into the immutable Snapshot steps.

A completed stage appends a `BrewStageResult` with stage order/id, actual start/completion ISO timestamps, calculated duration, `actualWeight: null`, `weightDifference: null`, and `wasSkipped: false`. Target water is never copied into an actual field. Completing the final stage may move `currentStageOrder` to `steps.length`, but does not mark the Brew completed in this slice.

Explicit confirmation after all stages changes execution to `completed`, writes `completedAt`, clears `currentStageStartedAt`, and freezes `actualTotalTimeSeconds`. Actual total water remains `null` without measurement. The Brew remains a record `draft` until Save Brew changes record status to `saved`; Feedback, AI, Bean, equipment, and quick rating are not save prerequisites.

Journal is a sorted projection of completed Brew records in the same repository, not a copied entity or second localStorage key. Both saved Brews and completed drafts are visible. Brew Detail reads only `BrewRecipeSnapshot` and `stageResults`, preserving history when the source Recipe changes.

`FlavorFeedback` is an optional object embedded under `Brew.flavorFeedback`, linked by stable `id` and `brewId`. It stores required `overallImpression` (`liked | neutral | disliked`), optional integer 1–5 ratings for acidity, sweetness, bitterness, body, clarity, aftertaste, and balance, optional stable flavor-note unions, optional 500-character notes, and created/updated ISO timestamps. Missing legacy fields hydrate as `null`; Feedback never changes the immutable Recipe Snapshot.

`BrewRecordDetails` is a separate optional object under `Brew.recordDetails`. It groups optional Bean text, Equipment text, actual dose/water/temperature, notes, and created/updated timestamps. Snapshot values remain the planned history; recorded values are user-reported facts added later. Setup Bean, dripper, and grind may appear as form suggestions, but only Save writes them to record details. Target numbers are never prefilled as actuals. Empty input normalizes to `null`; legacy v1 records missing the field hydrate safely as `null`.

`BrewAnalysis` stores the latest successful structured preview result, provider/model labels, schema version, generated time, deterministic source fingerprint, data-quality summary, confidence, and displayable evidence. `BrewAnalysisAttempt` independently stores the latest pending/completed/failed request and safe error metadata. A failed re-run therefore retains the last successful analysis. The provider input is derived only from the Brew Snapshot, Stage Results, Record Details, Feedback, and completion facts; analysis cannot mutate any of them.

## Snapshot invariant
The snapshot copies source identity/version when present, title, method, author, dose, water, temperature, grind, dripper, expected time, steps, overrides, and optional Bean/equipment metadata. A Brew never resolves historical instructions from the mutable current Recipe.
Factories construct new ordered step and parameter objects. Later Recipe changes cannot mutate an existing Snapshot.
