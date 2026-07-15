# Data Model

`UserProfile` stores display name, experience, and current needs only; onboarding does not create full Bean, Equipment, flavor, or AI profiles. `Recipe` points to versioned authored instructions. `QuickPrepareInput` overlays optional user input on recipe defaults and creates `BrewPlan` plus `BrewRecipeSnapshot`.

`Brew` owns its snapshot and four independent status fields. Optional `FlavorFeedback`, `Insight`, and `SuggestedPlan` can arrive later. `Equipment` is owned gear; `GearGuideItem` is educational content. `CollectionItem` remains a My Library concern.

All observed values declare a source: `recipe_default`, `user_override`, `measured`, `calculated`, `user_reported`, or `inferred`. IDs are opaque strings and timestamps are ISO-8601 strings at domain boundaries.

## Snapshot invariant
The snapshot copies source identity/version when present, title, method, author, dose, water, temperature, grind, dripper, expected time, steps, overrides, and optional Bean/equipment metadata. A Brew never resolves historical instructions from the mutable current Recipe.
