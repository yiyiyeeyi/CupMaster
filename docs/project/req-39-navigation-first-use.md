# REQ-39 — Navigation and first use

Baseline: 3e5060b; branch feature/camera-brew-runtime. Claude review passed;
the user authorized the REQ-39 commit and branch push on 2026-10-26.
SQL/cloud mutation, main merge and manual deployment remain out of scope.

## Scope and acceptance mapping

- Root opens Discover directly. Old /brew and /onboarding are server redirects,
  preserving query keys/repeated values and sanitizing returnTo. No old mandatory
  form or profile-completion gate is reachable. Removed unreferenced BrewHub,
  OnboardingGate and OnboardingForm; profile labels now live in new copy strings.
- Bottom navigation is Discover / + / Journal / Me. Pure route-level tests cover
  active mapping and hiding on execution, preparation, /complete and the
  justCompleted=1 Journal result flow. Normal historical Brew Detail keeps its
  Journal navigation. The + action has an accessible label and no fake tab state.
- Only completed or abandoned non-legacy Brews can seed +. createdAt descending,
  then ID ascending, determines the last cup; edits to older feedback do not
  promote it. Not-started/in-progress/paused cups are excluded. No eligible cup
  uses gentle-start; fallback uses the easiest available valid recipe, or a
  real empty state when none exists. Read failure is not silently called empty.
- Historical Snapshot/Plan deep copies work when the source recipe is gone.
  Results, analysis, execution and sourcePreparationId are not cloned. Opening
  preparation does not persist a Brew. Recipe Detail and saved preparation /
  Analysis entries remain explicit and take precedence over the + mode.
- The shared Quick Prepare has an ordinary recipe select at the top, using
  existing input styles/touch height. Changing it rebuilds recipe defaults and
  stage IDs while preserving optional Bean/notes/goal; it clears recommendation,
  sourceBrewId AND sourcePreparationId with an explicit notice. Completing this
  changed cup cannot consume the original saved preparation. Explicit save-later
  still edits the original preparation ID, with an explicit one-line notice
  after switching recipes; reopening that saved item is then a
  new explicit preparation selection. Same-cup reset keeps its separate form
  and cannot replace the historical Snapshot.
- Anonymous DiscoveryPreferences uses only PRD experience and six need enums,
  with a nullable unselected level. New preferences win over old complete or
  incomplete Onboarding data, including an explicit unselected/empty choice.
  Legacy ProfileProvider is read-only; its former save/session-placeholder API
  was removed. No legacy raw profile, name, timestamps or completion flag is
  rewritten. Corrupt old data remains intact and does not block Discover.
- Discover and Me share one preferences provider/card/repository. Saving failures
  do not replace the effective stored value or fake success. Needs are retained
  as explicit preferences; existing experience ranking is reused, with no made-up
  needs scoring. Unknown experience pins the real beginner recipe. All recipes
  remain selectable and no Bean/equipment/auth requirement is introduced.

## Explicit boundaries

REQ-39b is a separate plan, not implementation, in req-39b-nickname-plan.md and
Notion 405e841a44e381109fe9d20c08fcc05f. AuthForm, AuthProvider,
ProfileBootstrapService, cloud repositories/schema/types and migrations remain
unchanged. Existing bootstrap behavior is deliberately not claimed as fixed.
Account migration/sync (including anonymous preferences) remains journeys 14/15;
the existing migration's full-profile requirement is not bypassed with a fake
profile. No picker or Live Brew visual work is included. CSS changes only make
four navigation columns and reuse existing input treatment for native selects.

## Verification / review notes

Focused tests passed (31): seed eligibility/fallback, creation tie sorting,
historical recipe independence/deep-copy, switched-recipe completion preserving
the saved preparation, new-preference priority/PRD validation/failed writes,
read-only legacy data, navigation visibility and redirect query/return safety.
Tests extend the existing preparation and completion services rather than
replacing those contracts. Initial typecheck caught optional equipment.dripper
and a test-only excess field; both were fixed without relaxing validation.

The first concurrent verification attempt exhausted host memory and the process
environment was interrupted; its incomplete full-test result is not counted.
Subsequent validation runs are sequential; build uses a temporary Node heap cap,
not a changed project configuration. Final results/browser evidence follow below.

Please focus review on seed selection, sourcePreparationId detachment and saved
preparation deletion safety, old-profile read-only guarantees/new precedence,
route query retention and hidden completion navigation. No raw private vision
data was inspected. General corrupt Brew recovery remains REQ-54; a damaged new
preferences envelope is preserved and not overwritten by a pretend successful
save. Neither failure blocks viewing recipes, but Brew writes keep existing
persistence protections.

## Final validation and handoff

Final lint and typecheck passed. Production build passed sequentially with
NODE_OPTIONS=--max-old-space-size=512 after the host-memory failure. All 59 test
files / 892 tests passed with one worker and testTimeout=30000 (same temporary
heap cap). No project resource configuration or test assertions were weakened.
The earlier interrupted attempt is not counted as a successful full-suite run.

Production Chrome at 390 x 844 passed three grouped flows:

1. New root visit opens Discover without a profile/name form, retains campaign
   query, shows Discover/+ /Journal/Me, and + uses gentle-start. A not-started
   draft with modified parameters is excluded. Old /brew retains repeated query
   values and safe returnTo; preparation and Live Brew hide navigation.
2. An abandoned cup with a removed source recipe uses its historical Snapshot.
   Switching from a saved preparation clears sourcePreparationId; the new cup
   completes through the actual guided runtime and auto-saves, while the original
   preparation remains. justCompleted navigation is hidden; ordinary historical
   Detail keeps it. The source historical Snapshot remains unchanged.
3. Old /onboarding redirects with query retention and unsafe returnTo sanitation.
   All six PRD needs are present, new preferences override the old profile, Me
   reads the same preferences, and a quota failure does not claim persistence.
   The old profile string stays byte-identical; damaged legacy raw is preserved
   and Discover remains usable. No unhandled browser exceptions.

Screenshots req39-discover.png and req39-prepare.png were inspected in the external
Codex artifact directory; no horizontal overflow. Evidence is saved in
req39-browser-results.json. This is isolated synthetic browser QA, not physical
iOS/Android testing. Browser/server were closed after verification.

Acceptance: all seven review corrections are implemented or, for nickname work,
explicitly split to the independent REQ-39b plan. Please recheck route-level
visibility/query rules, immutable historical seeding, recipe switching not
consuming an old preparation, profile-read-only guarantees and optional choices.
No Auth/bootstrap/cloud/SQL changes, main merge or manual deployment.
REQ-39b remains a plan awaiting Claude review; no implementation was started.
The corrupted-new-preferences reset path is recorded in Notion REQ-54 only.

## Review approval and pre-commit verification (2026-10-26)

The approved optional copy clarification is included: after changing a saved
preparation's recipe, a one-line notice explains that save-later updates that
original preparation. Persistence behavior is unchanged. The production browser
flow verified this notice and that completing the changed cup preserves the
original preparation. All three existing browser scenarios passed without
unhandled exceptions; the isolated browser and local server were stopped.

Re-ran lint, typecheck, all 59 test files / 892 tests, and production build:
all passed. Tests ran with one worker and a temporary 512 MB Node heap limit
to fit the host; no project configuration was changed for these settings.
