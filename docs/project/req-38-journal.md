# REQ-38 — Journal completed Brews and saved preparations

Baseline: `2099e98`; branch `feature/camera-brew-runtime`. Local-only scope.
This work is pending Claude review and user authorization to commit; do not push.

## Implementation and acceptance mapping

- Journal uses existing Brew and SavedBrewPreparation repositories, with a thin
  JournalService and pure grouping projection. No parallel preparation format.
- All / completed / preparations filters use the existing control/card styles;
  query state survives reload and unknown filters fall back to all. Preparation
  date groups precede completed groups in all, regardless of their relative age.
  Groups use local calendar dates (not UTC slicing); entries sort by timestamps
  and stable ID. Preparations use updatedAt as storage date; completed Brews use
  completedAt with the existing updatedAt fallback. Date labels refresh on
  foreground/pageshow and periodically across midnight.
- Empty states distinguish no data from failed reads. Valid records from one
  source remain visible when the other cannot be read; failures expose retry.
  No Bean, feedback or analysis prerequisite was added.
- Quick Prepare saves edits to the same preparation ID, preserving createdAt
  and legacy metadata. Cards open the existing preparation route for both edit
  and start. Starting alone does not consume or rewrite the preparation.
- The user's final consumption decision supersedes the original retained-preset
  proposal: new Brew.sourcePreparationId links to its preparation. Only a
  successful completed/saved Brew write triggers removal. Manual completion,
  guided persistence and interruption completion share one application helper.
  Secondary removal failure never undoes the Brew write. Journal reload uses the
  durable saved Brew as its receipt and retries removal idempotently. Parallel
  cups from the same preparation may complete after the first consumes it.
  Reset, expiry and abandonment do not consume it.
- Deletion requires the existing modal confirmation style, supports cancel and
  Escape, and preserves cards on write failure. Entries are removed from the
  same envelope, preserving backups/redirects/lineage/checkpoints/warnings.
  Backward-compatible deletedIds prevents deleted or consumed legacy entries
  from reappearing when raw Plan data changes; stale save/start is rejected.
  It is not a Suggested Plan draft/used lifecycle or a new outbox.
- One browser-local notice appears at Journal top; no per-card temporary label.
  Successful global migration is silent. Conversion warnings have one Journal
  entry point; global errors are suppressed on Journal where its service already
  exposes the failure/retry, and remain visible elsewhere.
- sourcePreparationId is retained by local schema. Cloud preflight rejects this
  metadata rather than silently dropping it; REQ-37b must handle it, deletedIds
  and references to already-consumed preparations before journey 14. No SQL,
  cloud mapper, navigation redesign, picker or new design-system styles added.

## Separate authorized migration-history correction

Before REQ-38 changes, the cloud timing migration's single version/name match was
updated from 20261025142700 to 20261024110000 after SELECT verification. Exactly
one row changed; list_migrations confirms two versions matching repo filenames.
No DDL was repeated, no other history/data changed. Evidence is in
req-4-execution-timing.md and Notion REQ-4. This document-only correction remains
uncommitted alongside this review delivery, but is separate from REQ-38 scope.

## Verification and review notes

Seven new tests cover filters, timezone boundaries, stable sorting, inactive and
legacy exclusions, sourcePreparationId persistence, completion/save-only
consumption, concurrent cups, failed primary write, secondary failure/retry,
manual stage completion/reset, metadata-preserving edits, deleted conversion
non-resurrection and partial read failure. The existing 13 preparation tests
also passed. Initial full tests/typecheck exposed a missing required expectedRun
argument in the new reset test; the test call was corrected, no guard weakened.

The first production-browser run verified editing, two cups and cleanup recovery,
then found a cancel/reopen race: a delayed dialog close event cleared a newly
opened confirmation. The redundant onClose handler was removed; cancel/Escape
retain controlled state. Final checks and browser evidence are recorded below.

Please review: write-before-consume ordering; all completion paths; failed
cleanup recovery and repeated completion; tombstones vs immutable backups;
legacy URLs after deletion; partial errors vs empty states; date grouping;
single warning presentation and modal focus/cancel behavior. The durable general
save retry/outbox requirements REQ-27/5 and cloud REQ-37b remain out of scope.

## Final validation / Claude handoff

Lint, typecheck, production build and all 57 files / 871 tests passed on the
final code. Seven new Journal tests plus the existing preparation/runtime tests
cover the behavior above. diff --check passed. All 23 changed files use LF and
the Git index is empty; 22 files are REQ-38 and one is the separate REQ-4 history
record. No commit, push or deployment was performed in this work round.

Production Chrome at 390 x 844 passed: three filters and empty states; one local
notice; same-ID editing; two new cups from one preparation; first completion
with a synthetic preparation quota failure still saving its Brew; Journal retry
removing the preparation; second completion succeeding idempotently; deletion
cancel/Escape, quota failure and retry; preparation groups pinned first; one
Journal conversion warning and no successful-conversion warning on Discover.
No unhandled browser errors. Tests use an isolated profile and synthetic data,
not real-device Safari/Android QA.

Visual inspection additionally caught that the reused Quick Prepare action
container was sticky inside Journal cards. It was replaced with the existing
ordinary action-grid class, without adding CSS. Final 390px geometry confirms
the actions are static, below all metrics, and do not overflow horizontally.
The final screenshot was inspected after rebuilding, and all four checks reran.
Evidence: req38-browser-results.json, req38-final-layout.mjs and req38-journal.png
in the external Codex artifact directory (no private vision or user records).

Acceptance: all three filters, date grouping, saved preparation start/edit/delete,
completion-only consumption/retry and the approved single notices are verified.
Snapshot immutability and the same-Brew reset behavior remain covered. Please
focus review on secondary cleanup safety, deletedIds non-resurrection, old URL
behavior and partial-read recovery; do not interpret this local delivery as cloud
schema/mapper synchronization support.
