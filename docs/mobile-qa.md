# Mobile QA

## Scope and environment

- Baseline viewport: 390 CSS px wide.
- Environment: desktop browser responsive viewport simulation against the local Next.js development server.
- This is not a physical iPhone test. Safe-area behavior is reviewed from CSS use of `env(safe-area-inset-bottom)` and must still be confirmed on hardware.
- Demo data: development-only Full Demo seed, 11 Brews and 7 Suggested Plans, validated through the same local repositories as product flows.

## Route checklist

| Route | Primary checks | Status |
| --- | --- | --- |
| `/onboarding` | labels, 16px inputs, choices, loading stability | Passed responsive simulation |
| `/discover` | cards, Recipe names, navigation | Passed responsive simulation |
| `/recipes/[recipeId]` | parameter layout, text, Start Brew | Passed `gentle-start` simulation |
| `/recipes/[recipeId]/prepare` | form, sticky Start CTA | Passed `gentle-start` simulation |
| `/brew` | Draft hub card | Passed responsive simulation |
| `/brew/[brewId]/prepare` | vertical comparison, form, sticky CTA | Passed pending Suggested Plan fixture |
| `/brew/[brewId]` | draft, accepted, overridden, in-progress and completed-stage states | Passed Full Demo and interactive first-cup flow |
| `/brew/[brewId]/complete` | mobile summary rows, sticky Save | Passed interactive first-cup flow |
| `/journal` | saved/completed/draft/Next Try cards, active navigation | Passed Full Demo |
| `/journal/[brewId]` | Detail sections, Analysis, reverse Plan projection | Passed source and resulting Brew fixtures |
| feedback/edit/analysis/Plan routes | forms, comparisons, evidence, CTA | Passed route/DOM inspection with Demo states |
| `/journal/[brewId]/plans` | source-scoped Plan cards | Passed seven-Plan fixture |
| `/dev/demo` | seed counts, explicit overwrite/reset confirmation, product-nav exclusion | Passed; development only |
| `/me` | profile content; Me intentionally has no bottom tab | Passed responsive simulation |

## Implemented guards

- Removed body-level horizontal overflow masking.
- Added `min-width: 0` to shrinking grid/flex children.
- Long notes, evidence, IDs, titles, and adjustment summaries can wrap.
- Current/Suggested comparisons stack vertically below 392px.
- Brew overview metrics retain Actual, Target, and Difference labels in mobile rows.
- Live/complete/detail stage layouts stack without shrinking into a desktop table.
- Sticky CTA groups share one bottom-navigation/safe-area offset variable.
- Inputs and textareas use a minimum 16px font size to avoid iOS focus zoom.
- Bottom navigation route mapping is covered by deterministic unit tests.

## Local MVP browser acceptance

- The Demo route required explicit confirmation before replacing an existing non-Demo profile, then seeded 11 Brews and 7 Plans. Repeating/resetting/reseeding remained operable.
- A not-started recipe Draft was started, both Snapshot stages were completed, Brew Complete was confirmed, the Brew was saved, and its Journal Detail was opened. Missing actual measurements remained `—`; target values were not copied into actual values.
- Source Brew Detail showed the latest of seven Plans and the source-scoped list exposed all lifecycle states. Pending, accepted, overridden, in-progress, completed-result, and needs-repair routes had actionable or safe fallback destinations.
- Brew Hub resumed the latest in-progress fixture. Journal retained recipe Drafts, completed Draft, saved Brews, source Next Try summaries, and resulting Next Try context.
- Checked pages reported `scrollWidth === clientWidth` at the 390px viewport setting (browser content width 375 CSS px after chrome/scrollbar accounting). Exactly one appropriate bottom destination was active; `/dev/demo` had none.
- A real route defect was found and fixed during the walk: colon-based fixture IDs produced dynamic-route dead ends, so fixed URL-safe `demo-` IDs are now used.

## Design comparison

All `design/01` through `design/19` images were inspected. Implemented routes preserve the editorial headings, line-based cards/tables, large Live Brew focal value, compact Journal rows, vertical Plan comparisons, and bottom CTA hierarchy. Intentionally excluded reference elements are the old Collection/Me bottom tabs, Ask AI, Save/Fork/Edit actions outside current scope, mandatory Bean, fabricated actual/TDS/extraction data, AR/camera, Pause/auto-next, global Plans, and Bean/Gear libraries.

## Limitations

- Keyboard-open behavior and physical safe-area insets require a real mobile device follow-up.
- Visual checks do not claim pixel-perfect equivalence with the design references.
- Browser network logs included unrelated Statsig telemetry timeouts; local routes, persistence, and DOM inspection remained functional.

## Responsive simulation results

- Onboarding: document scroll width matched the viewport content width; Continue was approximately 50px high; labeled textbox, radios, and checkboxes were operable.
- Discover and Recipe Detail: no horizontal overflow; exactly Discover was active; Recipe cards fit the viewport.
- Quick Prepare: all inputs computed to 16px; exactly Brew was active; sticky CTA and Bottom Navigation overlap measured 0px.
- Live Brew Draft: the stage grid resolved to a narrow marker column plus one content column; sticky session action and Bottom Navigation overlap measured 0px.
- Brew Hub, Journal, and Me: scroll width matched client width. Brew and Journal each had exactly their expected active tab; Me had no active bottom tab by design.
- Browser environment emitted unrelated telemetry network timeouts; local CupMaster navigation and DOM inspection remained available.
