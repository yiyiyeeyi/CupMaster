# REQ-36 — Automatic completion and merged Brew Detail

Baseline: `3a44823` (REQ-35). This requirement is uncommitted for Claude review.

## Scope

The timed Guided runtime writes completed execution and `recordStatus: saved` in
one repository write, then replaces Live Brew with
`/journal/[brewId]?justCompleted=1`. The manual continuation view likewise saves
on its final Complete Stage action without a separate completion/save step.
Bean, equipment, impression, detailed feedback and AI remain optional. Actual
weights and temperatures are never copied from targets.

The existing Summary table and quick-feeling controls are reused at the top of
Brew Detail, within the existing page hierarchy and CSS. `justCompleted=1` shows
the fresh completion section; ordinary Journal links show historical Detail.
The old `/brew/[brewId]/complete` URL redirects to Detail for compatibility;
its separate component and Save Brew UI are removed. Journal removes its
Completed, Not Saved section. The future To Brew screen remains journey 04;
existing Next Try links are retained until REQ-37 replaces them.

## One impression field

`flavorFeedback.overallImpression` is the canonical field. Quick feeling writes
it through BrewService, preserving any existing ratings, notes and feedback ID.
A quick feeling alone does not claim detailed feedback is completed. Feedback
preloads that impression and shows it as text, without asking again. If there
is no impression yet, Feedback can collect it once. Deferring details preserves
the impression and any already recorded details.

## Existing records and cloud compatibility

The shared schema normalizes completed drafts to saved, preserving IDs,
timestamps, execution, Recipe Snapshot, parameters and analysis. Legacy
`quickRating` liked/neutral/disliked creates minimal feedback only when no
feedback exists; detailed feedback wins on conflict. Skipped stays skipped and
does not invent a neutral impression. The legacy property is removed from
normalized output, while its input type/schema remains for old clients/data.

Local repository hydration durably rewrites only records requiring these
conversions, under the existing version-1 envelope. Invalid/duplicate original
entries are retained in the rewrite. A failed conversion write reports failure
and preserves the original raw storage for retry. No rewrite occurs on the next
read once converted. Mutations stop when hydration fails.

Cloud reads use the same conversion. New writes use the existing
`flavor_feedback` JSONB column and send `quick_rating: null`. No SQL column,
constraint, RLS policy or cloud schema changes are needed; old cloud rows are
converted at the mapper boundary and canonicalized on their next ordinary write.
No remote data was modified in this round. Reference: Supabase
[JSONB documentation](https://supabase.com/docs/guides/database/json).

## Failure and deployment limits

A failed final Guided write retains the measured completed snapshot in the
mounted session and offers explicit Retry Save. Retry does not restart timing,
create another Brew or change the measured finish time. A successful duplicate
completion snapshot is idempotent for the matching run/start/finish. Manual final
write failure leaves the last persisted execution available for explicit retry.
This is not the deferred REQ-27/REQ-5 durable outbox or automatic retry mechanism.
Reload before a failed write succeeds cannot recover an unpersisted in-memory
snapshot; REQ-35 governs the last persisted execution after reload.

REQ-4 deployment gate remains: no push or deployment before
`20261024110000_brew_execution_timing.sql` has actually been applied and verified
in local Supabase. This round neither applies nor bypasses it.

## Verification

Final lint, typecheck, test, build and production-browser results are recorded in
the review handoff. Initial full test run passed 848/851; the only three failures
asserted the obsolete completed-draft behavior in completion, feedback and Demo
tests. Those expectations were updated to automatic saving; legacy conversion has
separate regression coverage. An earlier typecheck raced removal of the Summary
component and reported its missing file; the subsequent stable-source typecheck
passed without configuration changes.

Final stable-source verification: lint, typecheck and production build passed;
all 55 test files / 851 tests passed, including failed migration write protection.
Production browser at 390 × 844 passed five grouped flows: automatic Guided save
and fresh Detail, shared impression/Feedback plus legacy URL redirect, durable
legacy Journal conversion, final manual-stage automatic saving, and failed final
write retry with the same ID and measured completion time. No unhandled browser
errors; the Detail screenshot was visually inspected. All 26 existing changed
files use LF, with one old component deleted; diff --check passed and index stayed
empty. No private images, push, deployment or REQ-36 commit.
