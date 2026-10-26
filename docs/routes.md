# Routes

## REQ-36 update

- Normal final-stage completion automatically saves and replaces Live Brew with
  `/journal/[brewId]?justCompleted=1`; the existing Detail hosts the completion
  result table and optional quick feeling.
- `/brew/[brewId]/complete` is a compatibility redirect to Brew Detail, without
  a separate Summary component or Save Brew action.
- Journal no longer has a completed-draft section. To Brew UI remains journey 04;
  Next Try links remain until REQ-37. Earlier route descriptions below are historical
  where they mention manual Summary saving.

REQ-35 applies the V1 interruption policy on `/brew/[brewId]`: browser/system
Back records departure; foreground and reload reconcile wall time within 30
minutes. Expiry clears execution and replaces the page with the same Brew's
`/prepare` route (native replacement also supports bfcache restoration).
Overrun offers actual-time Finish and Save to `/journal/[brewId]`, or Discard to
preparation. No new route is added. The Brew hub no longer suggests continuing
a draft, and Journal excludes setup/active/paused/discarded execution. Wake Lock
help is an inline preparation hint and bottom sheet. See
`docs/project/req-35-interruption.md`; this supersedes REQ-4's reload timing note.

REQ-4 synchronizes Guided Brew pause/resume, stage/completion timing and
same-Brew execution clearing with local storage. Restart setup is removed;
App Back confirms 是／否 during execution. Yes clears execution and routes to
`/brew/[brewId]/prepare`, preserving the same Brew and parameters; No/Escape
keeps execution running. Write failure stays on Live Brew with the data intact.
Reloaded paused Brews continue through the existing manual route view with
frozen timers and Resume. Guided camera/voice-session reconstruction is not
part of this requirement. See `docs/brew-state-machine.md`.

REQ-3 updates the existing `/brew/[brewId]` guided setup without adding routes:
camera denial, unsupported capture, acquisition errors or preview failure fall
back to timer/voice guidance. The existing action area also offers
「不用相機，只用計時與語音」 even when camera capture is available. The same
camera card provides retry; re-enabling the preview during a Brew does not
restart its timer or stages. Completion still routes to Brew Complete for the
separate Save Brew action. Pause/restart persistence and failed-write recovery
remain tracked by REQ-4, REQ-27 and REQ-5.

Cloud 2 adds public `/auth` for optional email/password sign-in and sign-up. There is no whole-app auth guard: Discover, Brew, Journal, Me, and onboarding remain local and public. `/auth?next=/...` accepts only same-site relative paths and the auth route hides Bottom Navigation.

The same route includes a transient post-signup confirmation screen with resend, Change email, Back to Sign in, and Continue locally. No callback or email-bearing route is added.

Cloud 1 adds no product route, login route, session gate, or remote data dependency.

- `/dev/demo` is a development-only, repository-backed Demo seed/reset utility. Production runtime exposes no seed controls, and the route is intentionally absent from product navigation.

- `/journal/[brewId]/plans` is a source-scoped list of Next Tries. It is not a global Plans manager. Source Brew cards continue to open `/journal/[brewId]`; Plan access is provided from Brew Detail.

Bottom navigation has one active destination: recipe browsing is Discover, all Prepare/Live/Complete routes are Brew, and Journal detail/feedback/edit/analysis/recommendation confirmation/Plan/source-Plans routes are Journal.

Journal cards now include active Brew drafts as a small continuation section. Pending Suggested Plan handoff routes to `/brew/[brewId]/prepare`; accepted or overridden `not_started` Brew routes to `/brew/[brewId]`; in-progress Brew continues there; completed Brew routes to `/journal/[brewId]`. The whole card is one semantic link with no nested action.

Suggested Plan UI now projects one shared execution state across `/plans/[planId]`, `/brew`, `/brew/[brewId]`, and `/journal/[brewId]`. Plan actions route to Draft Prepare, ready/in-progress Live Brew, or completed Journal Detail without creating or repairing data during page load.

Suggested Plan routes added in the current increment:

- `/journal/[brewId]/analysis/recommendations/[recommendationId]/plan` previews one deterministic change and requires explicit confirmation; loading or cancelling never creates data.
- `/plans/[planId]` displays the independent Next Try and can create or reopen its resulting Brew draft.
- `/plans/*` belongs to Journal for bottom-navigation active state. A standalone `/plans` collection is not included yet.

| Route | Purpose | This round |
|---|---|---|
| `/` | Client gate: incomplete onboarding → `/onboarding`; complete → `/discover` | Implemented |
| `/onboarding` | Two-step display name, then experience + optional needs; also edits the same profile | Implemented |
| `/discover` | Personalized, deterministic recipe discovery | Implemented |
| `/recipes/[recipeId]` | Immutable recipe version detail and Start Brew entry | Implemented |
| `/recipes/[recipeId]/prepare` | Editable Quick Prepare; creates a local Brew Draft from defaults/overrides | Implemented |
| `/brew` | Minimal hub that deterministically resumes the latest in-progress Brew or links to Discover | Implemented |
| `/brew/[brewId]` | Guided camera setup or timer/voice mode for new drafts; existing manual continuation for started Brews | REQ-3 camera fallback and opt-out; persisted pause/restart correction remains REQ-4 |
| `/brew/[brewId]/complete` | Completed Brew overview, optional quick feeling, and Save Brew | Implemented |
| `/journal` | Saved Brews and completed drafts projected from BrewRepository | Implemented |
| `/journal/[brewId]/feedback` | Add, edit, or skip subjective Flavor Feedback for a completed Brew | Implemented (Vertical Slice 2 increment) |
| `/journal/[brewId]/edit` | Add or edit optional Bean, Equipment, actual values, and notes for one completed Brew | Implemented (Vertical Slice 2 increment) |
| `/journal/[brewId]/analysis` | Request, retry, re-run, and view a local structured preview analysis | Implemented (local mock only) |
| `/journal/[brewId]` | Snapshot-based Brew Detail and stage results | Implemented |
| `/me` | Local profile summary/edit; other areas labelled Upcoming | Partial |
| `/migration` | Authenticated Review → Ready → explicit migration progress/failure/resume/completed | Cloud 4-2; runtime remains Local |
| `/dev/migration-qa` | Development-only Local smoke tools, read-only remote preflight, checkpoint inspection | Cloud 4-3; unavailable in production |

Future nested routes should follow the four slices and App Router conventions. Do not introduce a Pages Router or a second routing tree.


## REQ-37 local preparation

`/brew/prepare` reads sourceBrewId/recommendationId/preparationId and shares the Recipe Quick Prepare form. `/brew/[brewId]/prepare` keeps same-cup reset semantics. Converted legacy unstarted IDs redirect from both Brew routes before execution UI mounts. Old Plan/creation/list URLs are compatibility redirects only; normal UI has no Next Try links. See docs/project/req-37-local-preparation.md.
# REQ-38 Journal behavior

`/journal?filter=all|completed|preparations` filters completed Brews and the existing
SavedBrewPreparation entries. The default/unknown filter is all. Preparation cards
open `/brew/prepare?preparationId=…` for confirmation/editing; delete requires
confirmation. Successful completed-and-saved Brews consume sourcePreparationId;
Journal retries secondary cleanup without undoing saved Brews. This is local only.
# REQ-39 / First use

`/` redirects to Discover. `/brew` redirects to `/brew/prepare`; `/onboarding`
redirects to `/discover?preferences=edit`. Existing query keys and repeated values
are preserved; returnTo is sanitized to an allowed same-site origin page.
The four navigation entries are Discover / + / Journal / Me. Brew execution,
preparation and completion routes, including Journal justCompleted=1, hide it.
The + entry only seeds from completed/abandoned non-legacy Brews; otherwise it
uses gentle-start. Recipe switching detaches the old preparation and recommendation.
