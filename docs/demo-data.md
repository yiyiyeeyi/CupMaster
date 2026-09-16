# Development Demo Data

`/dev/demo` is a development-only utility for creating repeatable Local MVP states. A production build still compiles the route, but the runtime renders an unavailable message and exposes no write controls.

## Seed actions

- **Seed Full Demo** writes one completed onboarding profile, eleven Brews, and seven Suggested Plans.
- **Seed Minimal First Brew** writes the profile plus the smallest recipe Draft needed to demonstrate the first-cup flow.
- **Seed Analysis + Next Try** writes the focused completed-analysis and Suggested Plan graph.
- **Reset CupMaster Local Data** removes only the profile, Brew, and Suggested Plan repository data. It never calls `localStorage.clear()`.

All actions pass through `UserProfileRepository`, `BrewRepository`, and `SuggestedPlanRepository`. UI components do not parse or write storage. Data is runtime-validated with Zod before batch persistence.

## Identity and repeatability

Fixture route IDs use the fixed URL-safe `demo-` prefix. This intentionally differs from the illustrative `demo:` prefix because a real browser walk found colon-based IDs could become dynamic-route dead ends. Repeating a seed replaces only matching Demo records and does not duplicate them. Non-Demo Brews and Plans are retained. Replacing a non-Demo profile requires a second explicit confirmation.

Most timestamps are fixed offsets from `DEMO_BASE_TIME`. The in-progress timer receives an injected-clock-relative `startedAt`, while its stable sorting timestamp remains deterministic. Tests inject the clock.

## Full state matrix

| Fixture | Purpose |
| --- | --- |
| Brew A | saved, awaiting Feedback, no details or Analysis |
| Brew B | saved with details, Feedback, current Analysis, and multiple Plans |
| Brew C | completed Draft with an outdated Analysis |
| Brew D | partially completed in-progress recipe Brew |
| Brew E | not-started recipe Draft |
| Brew F | Suggested Plan preparation pending |
| Brew G | accepted Suggested Plan, ready to brew |
| Brew H | overridden Suggested Plan with Suggested and Using values |
| Brew I | in-progress Suggested Plan result |
| Brew J | completed and saved Suggested Plan result |
| Brew K | failed Analysis attempt retaining the prior successful result |

The seven Plans cover ready to prepare, preparation pending, ready to brew, overridden, in progress, completed, and needs repair. Brew B owns multiple Plans for deterministic newest-first and `+ N more` demonstrations.

## Safety and known boundary

The seed service rejects writes outside development/test. Seed data is local to the current browser profile and is not authentication, cloud sync, Supabase, or a production migration mechanism. Resetting CupMaster data also removes non-Demo CupMaster records only after explicit confirmation; unrelated origin storage remains untouched.
