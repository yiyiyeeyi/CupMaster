# Routes

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
| `/brew/[brewId]` | Start session, timestamp timers, manual stage completion, and reload recovery | Interactive foundation; no Pause or Finish |
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
