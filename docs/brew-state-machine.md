# Brew State Machine

## Current implementation — REQ-4 execution timing

Guided Brew uses one monotonic execution clock anchored to the persisted
start timestamp. Pause/resume and stage/completion checkpoints project that
runtime into the same Brew; recipe targets are never substituted for actual
durations. Stage and pause seconds retain fractional precision; completed total
seconds are floored after subtracting pauses, matching the integer SQL column.
Total and final-stage timers freeze at completion.

The Restart setup button is removed. App Back asks
「沖煮中，返回將會遺失數據，確認返回？」 with 是／否. No/Escape leaves
execution untouched. Yes resets an in-progress or paused draft by first persisting
`not_started`, clears start/pause/completion time, accumulated/current-stage
pause, results and actual total time, and increments the optional
`executionRun`. It preserves Brew ID, Recipe Snapshot, BrewPlan and source
metadata. Only after that write succeeds is the in-memory runtime reset to
idle, then returns to `/brew/[brewId]/prepare` with the same parameters.
Setup/positioning is untimed; a subsequent Start establishes a new clock
anchor. Old-run checkpoints cannot overwrite the new run. A Suggested Plan
source uses its existing explicit repair service to realign usage on restart.

`currentStagePausedSeconds` and `executionRun` are backward-compatible optional
local fields; old records use zero stage pause and run one. Stage results keep
`wasSkipped:false`; no skip command, event or UI is part of REQ-4.

Reloading a persisted paused Brew uses the existing manual continuation view:
timers remain frozen at `pausedAt`, and Resume accounts for the entire pause
before manual stage completion. It does not reconstruct a camera/voice session.
The legacy manual flow retains its explicit Brew Complete action; its total
stops at that action, while Guided Brew completes automatically with its final
stage. Both use actual elapsed time minus pauses. Write-failure retry/outbox
behavior remains REQ-27/5, outside this increment.

Explicit Suggested Plan repair maps a `not_started` resulting Brew to Plan `draft` with `usedAt:null`; a started `in_progress`, `paused`, `completed`, or `abandoned` Brew maps to `used` with `usedAt === Brew.startedAt`. A started execution state without `startedAt`, duplicate Brew mapping, or conflicting Plan mapping is rejected rather than guessed. Page reads never trigger repair.

Live Brew starts through `BrewSessionCoordinator`. A Brew start failure leaves it `not_started`; a later Plan sync failure leaves it `in_progress`, returns a non-blocking warning, and enables explicit Retry Sync. Reload derives sync-needed state from persisted Plan/Brew mapping rather than transient UI state.

Plan lifecycle is deliberately smaller than Brew lifecycle: `draft` covers both unlinked and linked-but-not-started Plans; `used` begins only when the resulting Brew has `startedAt`. Creating a Draft never means used. Usage sync is idempotent and aligns `usedAt` to `Brew.startedAt`; a sync write failure never rolls an in-progress Brew back.

## Suggested Plan handoff

Analysis completion does not change Brew lifecycle state. An explicit confirmation creates a `SuggestedBrewPlan(draft)`. `Start This Brew` idempotently creates one new `Brew(not_started, draft)` and then marks the Plan `used` with `resultingBrewId`. Repeating the action returns the same resulting Brew instead of duplicating it. This round does not auto-start execution.

Status is four orthogonal axes, never one overloaded field.

- Execution: `not_started → in_progress ↔ paused → completed | abandoned`.
- Record: `draft → saved → archived`; pausing may remain a draft.
- Feedback: `not_requested → awaiting_feedback → completed | skipped`.
- Analysis: `not_requested → ready → processing → completed | failed`; retry may return failed to ready.

Completing execution does not complete feedback. Saving does not request analysis. A completed Brew can be saved with awaiting feedback and analysis not requested. Journal supports returning to drafts and filling optional information later.

Quick Prepare creates a local Draft with execution `not_started`, record `draft`, feedback and analysis `not_requested`, stage order `0`, empty results, null start/pause/completion times, and zero accumulated pause seconds. Draft creation never starts execution.

`/brew/[brewId]` now supports `not_started → in_progress` and manual stage advancement while remaining `in_progress`. Start writes `startedAt` and `currentStageStartedAt` once. Complete Stage reads the latest repository state, appends one result, increments `currentStageOrder`, and starts the next stage timestamp. Duplicate or stale completion is rejected.

Timers are derived from timestamps on every render tick: total elapsed is `now - startedAt - accumulatedPauseSeconds`; stage elapsed is `now - currentStageStartedAt`. The interval only triggers a one-second redraw, so reloads and background-tab returns recover without accumulated interval drift.

After the final stage, execution remains `in_progress` until the user explicitly chooses Continue to Brew Complete. The service then verifies every Snapshot stage result and transitions execution to `completed` while record status remains `draft`. Save Brew separately transitions record `draft → saved`. A completed draft remains recoverable and visible in Journal.

Completed timers use the frozen `actualTotalTimeSeconds`; no interval continues after completion. Feedback becomes `awaiting_feedback` on save unless the user explicitly chooses the skipped quick option. Analysis stays `not_requested`. Pause, resume, auto-next, measured weight, camera, AR, full Feedback, and AI remain outside this round.

Flavor Feedback is now independently editable after execution reaches `completed`, for either a record draft or saved record. A valid upsert moves `awaiting_feedback`, `not_requested`, or `skipped` to `completed`; editing remains `completed`. “Skip for now” sets `skipped` without creating a Feedback object, and a later upsert can still move it to `completed`. None of these transitions request AI Analysis or alter record status.

Record Details may be added, edited, or cleared only after execution is `completed`, for either draft or saved records. This metadata update does not transition execution, record, feedback, or analysis status and cannot mutate the BrewPlan, Snapshot, stages, or Feedback.

Analysis transitions `not_requested → pending → completed | failed`; `failed` and `completed` may re-enter `pending`. Pending has a persisted attempt. A re-run keeps the old successful result until a new validated result succeeds; failure retains the old result. Editing Feedback or Record Details does not auto-run or delete analysis, but fingerprint comparison marks it outdated. Legacy completed status without a result normalizes to failed with `legacy_missing_result`.
