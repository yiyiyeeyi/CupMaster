# REQ-4 — Consistent execution and persisted time

Baseline: `2d09502` (reviewed REQ-3); docs-only decision commit `d665cab`.
Scope: V1 / Guide. Review revision follows the finalized V1 user journey.

## Implementation

- A fixed wall/monotonic clock anchor maps observed runtime timestamps to stored
  start/end times. The application persistence service consumes execution
  checkpoints, not rendering ticks or camera samples.
- Pauses persist execution status, pause start, cumulative closed pauses and
  per-stage pause totals. Total and stage durations exclude pauses, preserving
  fractional precision for stages and pauses. Completed total seconds are floored
  after subtraction for the SQL integer contract; legacy fractional totals are
  normalized at the persistence boundary without mutating source objects.
- Completion uses the observed runtime end and freezes both timers. Delayed
  persistence or a later tick cannot increase execution time.
- App Back confirms 是／否 during execution. No/Escape leaves it running; Yes
  first writes a cleared execution to the same Brew, then stops the
  runtime and returns to its draft preparation route. Restart setup is removed.
  It preserves Snapshot, BrewPlan, Brew ID, source/handoff
  metadata and creation time. It works after completed stages and while paused.
  Setup time before the next Start is excluded. Old execution generations are
  rejected. Existing Suggested Plan repair is invoked by this explicit action.
- Optional `executionRun` / `currentStagePausedSeconds` fields keep the local
  envelope backward-compatible. Stage results retain the original `wasSkipped:false`
  contract. No skip command or runtime skipped-stage event is included.
- Reloading a paused record uses the existing manual view, with frozen timers
  and Resume. It preserves total/per-stage pause accounting; it does not claim
  to recreate a guided camera/voice runtime after reload.

## Tests and review boundaries

Integration tests exercise fractional multi-pause timing, measured stage durations,
completion followed by delayed ticks/persistence, restart after completed stages,
the same immutable Snapshot and Brew ID, old-run rejection, reset-write failure,
and manual continuation after a persisted pause. Existing tests cover timer and
guidance behavior. Quality-gate and browser results are recorded in the Notion
REQ-4 handoff after verification.

Prior delivery validation (before review revisions): lint, typecheck and production build passed; the complete test suite
passed (52 files, 823 tests). Production-browser checks passed for multiple
pauses across stages, restart after a persisted stage and pause, and reload of
a paused Brew followed by manual continuation and saving. Each scenario checked
stored timestamps against active duration and preserved Snapshot/Plan identity.
The first two also checked stage-duration sums and frozen completion timers.
Browser checks used an isolated profile and accelerated test recipe; physical
phone behavior remains REQ-31 QA.

## Deployment gate (mandatory)

Do not push or deploy until `20261024110000_brew_execution_timing.sql` has
actually been applied and verified in local Supabase. SQL contract tests and
mapper tests do not satisfy this gate. Local application remains unverified
because the Docker API returned 500. This restriction remains in effect after
the REQ-4 local commit; no remote database changes are authorized by this work.

Final scope correction: remove `skipCurrentStage`, `STAGE_SKIPPED`, the runtime
skip marker and the widened boolean stage-result contract. Persisted/domain
stage results use literal false; the timing regression uses normal completion.
After this scope correction, lint, typecheck, production build and the complete
52-file / 827-test suite passed again (`--maxWorkers=1 --testTimeout=30000`).

REQ-35 follow-up: browser Back/system gestures that bypass the App dialog are
handled by the 30-minute interruption rules. On visibilitychange to foreground,
reconcile runtime against wall clock; performance.now() alone is insufficient
on devices whose monotonic clock stops during sleep.

## Review revision validation and boundaries

Final review gates: lint, typecheck and production build passed. Full suite:
52 files / 827 tests passed with `--maxWorkers=1 --testTimeout=30000`.
The initial run hit an existing large-dataset timeout under slow file loading;
no test logic was changed to avoid it. Production mobile-browser checks passed
for No preserving execution, reset write failure preserving storage/runtime,
Yes returning the same Brew/Snapshot/Plan/parameters to preparation, removal of
Restart setup, integer total matching displayed time, and frozen completion.
The final dialog was visually inspected at 390 × 844 with its scoped CSS panel
and backdrop; no unhandled browser exceptions occurred.

- REQ-4 pending files use LF. Review removes Restart setup and adds the same
  Yes/No App Back dialog to guided and reloaded manual views. Reset write failure
  keeps execution intact. Confirmation stops guided resources before navigation.
- Persistence normalizes completed total seconds to integers, including legacy
  fractional local totals. Stage durations and pause totals remain precise.
- Cloud mappers carry optional execution run/stage pause fields. A new SQL
  migration upgrades cumulative pause seconds to numeric and adds nullable
  run/stage-pause columns; old rows retain null metadata and their prior values.
- The new migration-service test passes timing payloads through real cloud
  mappers, using canonical mapper-shaped fixtures. Mapper round-trip tests also
  cover legacy fractional total normalization. SQL contract tests cover types and
  additive migration structure.
- Docker API returned 500 on a read-only container query, so actual PostgreSQL
  migration execution is unverified; no remote database changes were made.
- An existing Next Try migration defect was exposed when testing Plan-linked
  payloads through the actual mapper: the base projection sets recipe source
  but retains Plan handoff, which the row validator rejects. It is recorded on
  REQ-37; its legacy conversion must cover this. This revision does not change
  that old migration logic. Canonical fixtures also avoid pre-existing optional
  undefined-key differences in migration equality checks.
- REQ-35 owns wall-time catch-up, 30-minute expiry, overrun choices and Wake Lock;
  this revision does not implement those subsequent requirements. The updated
  journey/decision documents are isolated in docs commit `d665cab`.

The execution subscription is attached and cleaned up in the React effect,
alongside the existing guidance subscription. It does not write on every frame
or timer repaint. Camera coordinate contracts and layout styles are unchanged.

Pause/resume or stage checkpoint write failures remain visible and the runtime
stays in memory; scheduled retry, durable pending writes and close/reopen recovery
for failed writes remain REQ-27/5. Restart write failure preserves the existing
runtime and record. The two REQ-3 follow-ups (raw status/English copy and the
black preview on phones) are deferred to REQ-33 and REQ-31 as requested.
