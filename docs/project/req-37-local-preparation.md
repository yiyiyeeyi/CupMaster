# REQ-37 — Local preparation and one applied recommendation

Baseline: `5755bb9` (REQ-36). Uncommitted work for Claude review.

## Approved scope

REQ-37 is local only. REQ-37b (Notion page
`404e841a-44e3-8164-9811-c0006bbf05d2`) owns new cloud tables/columns,
cloud mapper/migration v2 and the real-mapper residual-handoff regression. It
starts after local Supabase can be verified, or with journey 15 continuous sync.
No SQL migration, new cloud table or remote data write is part of this round.

Each cup has at most one applied recommendation. Applying records the affected
fields' before/after values, including linked total and stage duration changes.
Cancellation independently restores a field only if its current value still equals
its applied value. User edits are retained. No per-field source flags were added
for cancellation; existing Snapshot parameter source metadata remains compatible.

## Active product flow

Recipe preparation, Brew Detail's 再沖一杯, and Analysis's 套用這個建議 use the
same BrewPreparationForm. Historical seeds do not require a current Recipe lookup;
the source Snapshot/Plan is deep-cloned. Form rendering does not persist a Brew.
Submission creates a new ID and immutable Snapshot, with no copied execution,
feedback or Analysis. A synchronous submit lock prevents duplicate clicks; visiting
the same source again can create another cup. REQ-4/35 same-cup reset preparation
still uses its existing route and does not create a new Brew.

Quick Prepare retains parameter/optional sections and existing CSS. Recipe stage
editing is not introduced. Applied time adjustments are shown in planned total
time. Saving for later writes a SavedBrewPreparation; the Journal view for these
records is intentionally left to journey 04.

Normal UI no longer creates Plans, marks them used, confirms handoffs or offers
repair/retry-sync. The five Next Try UI components were removed; legacy domain,
repositories and migration adapters remain until REQ-53. Old Plan URLs only
redirect to a verified preparation/result or show a preserved-data fallback.
Source Plan-list URLs redirect to Detail; recommendation-creation URLs redirect
to the shared preparation route. Normal UI links no longer target these URLs.

## Local storage and conversion

`cupmaster:brew-preparations` has a version-1 envelope with:

- entries: ID/timestamps, Snapshot/Plan seed, nullable sourceBrewId and one nullable
  appliedAdjustment, optional legacy Plan/Brew IDs;
- redirects: old unstarted Brew ID → converted preparation ID;
- lineage: executed Brew ID → source/adjustment metadata, preserving execution;
- backups: exact original Plan and Brew storage strings;
- processedRaw and warnings: idempotence and preserved unresolved cases.

Applied adjustment stores the original validated adjustment and source analysis,
recommendation ID, fingerprint, generated time, rationale, confidence, evidence,
before/after changes and the actual applied value. It has no draft/used workflow.

Conversion reads raw legacy data before the old reader can normalize contradictory
used states. Valid unstarted resulting Brews use their actual confirmed Snapshot
and Plan, rather than reapplying the original recommendation. Executed results
only gain projected lineage; no pending copy is created. Valid orphan Plans can
use their embedded Recipe information. Unsafe/missing/duplicate/conflicting cases
retain originals with warnings instead of fabricated execution.

All targets, mappings and untouched backups are validated and written together in
one localStorage envelope, followed by readback. There is no cross-key transaction
to leave partially converted targets. Original keys are not changed by conversion.
The original hidden Brew remains in Brew storage; its full pre-conversion original
is also in the backup when later normal repository operations rewrite the envelope.
REQ-53 owns eventual deletion. Same raw Plan input is a no-op; changed/conflicting
inputs do not overwrite an already converted/user-edited entry.

Converted unstarted Brews are filtered from listAll/listDrafts/Journal, but remain
addressable for preservation. Both their Live Brew and preparation routes use a
gate that redirects before mounting execution UI. BrewService.startBrewSession
also refuses a Brew with legacyPreparationId, independent of the UI gate.

## Cloud compatibility and deployment gate

Existing cloud schema/mapper code is unchanged. New local metadata fails cloud
graph preflight with an explicit REQ-37b message, before remote writes; local data
is retained rather than silently stripped. Saved preparations are not in the old
cloud graph and the migration page explicitly says they remain local. Old-format
paths are retained for compatibility; this does not claim new data is synced.

Do not push or deploy before `20261024110000_brew_execution_timing.sql` is actually
applied and verified in local Supabase. That gate remains unsatisfied. No attempt
was made to satisfy it by using a remote database.

## Validation and review

See the final handoff for lint/typecheck/test/build and production-browser results.
Initial focused tests passed; an intermediate typecheck found and corrected a
parse/safeParse envelope-level mismatch. Initial full suite had three failures
because an old test double returned Brew JSON for every storage key; it was
corrected to respect keys, without changing production data or weakening assertions.

Review: cancellation after manual edits (including linked times), raw backup and
single-envelope atomicity, hidden/Brew-start guards, original Snapshot preservation,
same-source repeated cups, inactive legacy modules vs REQ-53, and explicit local-only
cloud preflight. REQ-27/REQ-5 durable retry and REQ-54 corruption recovery remain
out of scope. A production browser test is not iOS/Android physical-device QA.

Final stable-source checks passed: lint, typecheck, production build, and all
56 test files / 863 tests. The added preparation suite contains 12 tests, including
ambiguous IDs/shared result mappings (quarantined rather than arbitrarily chosen).
The existing navigation test also verified the retained Journal active-tab mapping
during an old Plan URL redirect. No old product link was restored.

The 390 × 844 production browser passed four grouped flows: three new cups from
one historical source without changing it; explicit Analysis application and
cancellation retaining a manual grind edit; both old Brew URLs plus a Plan URL
redirecting to one converted preparation with the confirmed 90°C override intact
and no old execution UI/card; and save-for-later without creating execution or
implementing the journey-04 list. No unhandled browser errors. The mobile Journal
screenshot was inspected. Evidence is in the external Codex artifact directory
under req37-browser-results.json and req37-journal.png (synthetic data only).

42 changed files: 37 existing files use LF, five obsolete UI components deleted;
diff --check passed, index remains empty. No commit, push, deployment or private
vision data in this delivery. Notion REQ-37 is submitted for review; REQ-37b waits
for local Supabase verification; it must finish before journey 14.

## Approved review correction (2026-10-25)

Adjustment changes now retain each changed parameter's original source and the
grind recipeDefault. Cancellation restores these alongside the value only while
the current value still equals the recorded recommendation. Manually edited
values retain their metadata. Optional metadata keeps existing records readable;
missing historical source metadata is not guessed. Regression coverage verifies
temperature source/userOverrides cleanup and persisted grind metadata restoration.
The optional backup-size optimization is deferred; full original Brew backup
retention remains unchanged.

REQ-37b must precede journey 14: a repeat cup currently rejects the entire cloud
migration preflight. Its migration/mapper must handle legacyPreparationId,
sourceBrewId and appliedAdjustment, including fields persisted on the next Brew
write after hydrate projection. The local Supabase deployment gate is unchanged.

Post-review validation: lint, typecheck, build and all 56 test files / 864 tests
passed. This includes 13 preparation tests. The complete test summary arrived
late from the process output; a redundant rerun was stopped after the original
successful exit was received. No code changes followed validation.
