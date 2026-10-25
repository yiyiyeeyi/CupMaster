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
actually been applied and verified. On 2026-10-25 the user explicitly authorized
verification on cloud project `ouniwzdxbcrektzynkak` instead of local Docker.
Only this migration is authorized; REQ-37b schema is excluded. SQL contract tests
and mapper tests do not satisfy this gate. The user subsequently approved using
the connected Supabase tool instead of CLI authentication/link/native dry-run.
The gate is now satisfied by the cloud verification below.

### Cloud verification attempt (2026-10-25): stopped at CLI authentication

- Read-only baseline confirmed profiles=1, brews=0, suggested_plans=0,
  auth.users=1. No account details or credentials were copied into this document.
- Before application, brews.accumulated_pause_seconds is integer; RLS is enabled
  (not forced), with brews_insert_own / brews_select_own / brews_update_own
  policies scoped to authenticated users and auth.uid() = user_id. Existing
  column and constraint definitions were inspected for subsequent comparison.
- CLI help initially could not write telemetry under the restricted execution
  environment; help succeeded with the normal CLI execution permissions.
- `supabase link --project-ref ouniwzdxbcrektzynkak` then exited 1 with
  `LegacyPlatformAuthRequiredError`: access token not provided; CLI login is
  required. Stopped at this first verification-step failure as instructed.
- No dry-run, migration application, INSERT/ROLLBACK test or type regeneration
  was performed. No SQL was edited or retried, no cloud schema/data was changed,
  and no commit/push/deployment was made. Steps 2 and 3 have not started.
- Resume only after the user authenticates Supabase CLI, then repeat the
  authorized link/dry-run sequence. Do not supply tokens in tracked files or chat.

### Cloud verification completed (2026-10-25)

The user's later instruction supersedes the CLI-only requirement above. The
connected Supabase tool was used; no CLI native dry-run is claimed. Read-only
migration history and the two local SQL files confirmed only the timing SQL was
pending. The exact timing SQL was applied once, unchanged, with no REQ-37b DDL.

- Cloud history: core `20260804061934`; connector-generated timing version
  `20261025142700`, name `brew_execution_timing`. This maps to local file
  `20261024110000_brew_execution_timing.sql`. The connector assigns its own
  version. The subsequent authorized history correction below reconciles this
  mapping; the timing ALTER TABLE must not be applied again.
- `accumulated_pause_seconds`: numeric, NOT NULL, existing default retained.
  `actual_total_time_seconds`: integer, nullable. `execution_run`: integer,
  nullable. `current_stage_paused_seconds`: numeric, nullable.
- All 18 existing constraints remain, with the pause check's implicit zero cast
  changed to numeric as expected; two new checks require positive execution_run
  or null and nonnegative stage pauses or null. Existing foreign keys remain.
- RLS remains enabled, not forced. The three INSERT/SELECT/UPDATE ownership
  policies retain the same authenticated roles and auth.uid() ownership checks.
- A single BEGIN/ROLLBACK transaction selected the existing user's UUID without
  exposing it, set local authenticated role and auth.uid(), inserted a synthetic
  SQL fixture, then read back and asserted pause=7.125, total=9, run=2,
  stage-pause=1.25. Deferred constraints were checked before rollback. The final
  query confirmed brews=0. This checks SQL persistence/RLS, not JSON mapper shape;
  existing mapper regression tests separately cover application payloads.
- Regenerated `src/types/database.types.ts` directly from cloud. The timing
  types match the reviewed contract; PostgREST reports 14.17 and generator output
  normalizes ordering/conditional-type parentheses.

The user-authorized cloud migration gate is cleared. Local Docker remains
unverified historically; this does not block the explicitly authorized feature
branch push. No main merge, manual deployment, REQ-37b schema or user data retained.

Post-generation checks passed: lint, typecheck, production build and all 56 test
files / 864 tests (`--maxWorkers=1 --testTimeout=30000`); diff --check passed.
Final cloud counts remain profiles=1, brews=0, suggested_plans=0, auth.users=1.

### Migration history reconciled (2026-10-25)

Following the user's explicit authorization, SELECT first confirmed the timing
row had version 20261025142700. A transaction updated only that version/name
match to 20261024110000, asserting exactly one changed row and no target-version
collision. No statements, names, other history rows, schema or Brew data changed.
Both the final SELECT and connector list_migrations confirm exactly two rows:

- 20260804061934 / create_cupmaster_core
- 20261024110000 / brew_execution_timing

These now match the two repository migration filenames, avoiding a duplicate
timing migration on future CLI db push. No migration repair or repeated DDL ran.

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
