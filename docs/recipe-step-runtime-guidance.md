# Task 9D-3 — Recipe Step Runtime & Voice Guidance

## Outcome

Recipe steps can now carry optional execution guidance for three moments:

1. step start;
2. one or more scheduled details while the step is active;
3. step end or transition.

The existing deterministic `BrewRuntime` and stage reducer emit presentation-independent `BrewGuidanceEvent` values. The application controller exposes those events as both queryable history and a live subscription. No browser speech API, UI copy policy, or voice implementation is coupled to the domain.

## Architecture audit

CupMaster currently has two related execution representations:

| Layer | Responsibility | Persistence |
| --- | --- | --- |
| `RecipeStep` | authored recipe instruction, target, pattern, and optional guidance | source recipe/version |
| `BrewStage` and `BrewRecipeSnapshot.steps` | prepared plan plus immutable historical recipe snapshot | local/remote Brew records |
| `BrewRecipeStageDefinition` | normalized input for the deterministic camera/manual stage engine | runtime only |
| `BrewSessionRuntime` | live state, stage records, pause accounting, and emitted guidance history | in-memory runtime contract |
| `BrewRuntimeController` | detector integration, commands, snapshot subscriptions, and guidance subscriptions | application boundary |

The persisted manual Brew workflow in `BrewService` remains separate from the camera/manual `BrewRuntimeController`. Task 9D-3 extends the deterministic runtime and its recipe adapter; it does not silently replace the existing Live Brew UI or persistence workflow.

## Recipe guidance contract

Guidance is optional, so all existing recipes and stored Brews remain valid.

```ts
interface RecipeStepGuidance {
  start?: string;
  details?: Array<{
    id: string;
    atSeconds: number;
    message: string;
  }>;
  end?: string;
}
```

Detail IDs must be unique within a step. Elapsed times are finite and non-negative. Recipe validation trims and bounds guidance messages. The local Brew schema accepts the optional structure on both snapshot steps and planned stages.

The Brew factory deep-clones nested guidance into both the `BrewPlan` and immutable `BrewRecipeSnapshot`; later source-recipe edits therefore cannot rewrite historical guidance.

## Recipe → runtime → guidance flow

```text
RecipeStep guidance (seconds)
          │
          ▼
createBrewRuntimeRecipeDefinition
          │ converts scheduled details to milliseconds
          ▼
BrewRecipeRuntimeDefinition / sorted runtime stages
          │
          ▼
reduceBrewRuntime(event)
          │ appends each eligible semantic event once
          ▼
BrewSessionRuntime.guidanceEvents
          │
          ├── BrewRuntimeController.getGuidanceEvents()
          ├── subscribeGuidance() ──► UI adapter
          └── subscribeGuidance() ──► future voice adapter
```

The adapter accepts recipe identity, display name, and `RecipeStep[]`. It maps `durationSeconds` to `targetPourDurationMs` and guidance `atSeconds` to `atElapsedMs`. The stage engine performs stable sorting by stage order and by detail elapsed time without mutating recipe input.

## Guidance event contract

Each emitted event contains:

- stable event ID;
- monotonic sequence number across restarts;
- run number;
- actual emission timestamp;
- moment: `step_start`, `step_detail`, or `step_end`;
- stage ID, order, and name;
- presentation-neutral message;
- optional detail ID and scheduled elapsed time.

Event IDs follow the semantic identity of the event:

```text
{sessionId}:run-{runNumber}:{stageId}:start
{sessionId}:run-{runNumber}:{stageId}:detail:{detailId}
{sessionId}:run-{runNumber}:{stageId}:end
```

Before appending, the reducer checks existing IDs. Duplicate ticks, repeated start/stop inputs, and a detail encountered again on a later tick therefore cannot emit a second copy.

## Timing and runtime operations

| Operation | Runtime behavior | Guidance behavior |
| --- | --- | --- |
| start | begins the runtime session | no step event until a step actually starts |
| pour/step start | enters the next sorted stage | emits optional start guidance once |
| tick | evaluates elapsed active stage time | emits every newly due detail in deterministic order |
| pause | stores prior state and pause timestamp | emits details already due at the pause boundary, then stops elapsed-time progress |
| resume | restores the prior runtime state | adds pause duration; does not replay events |
| stage stop/transition | completes current stage | emits any detail due by the end boundary, then optional end guidance |
| restart | creates a clean run with incremented run number | retains history/sequence and makes the new run's IDs eligible once |
| completion | remains terminal until explicit restart | final normal stage stop includes final end guidance |

Detailed guidance uses active time:

```text
active elapsed = event timestamp − stage start − accumulated stage pause duration
```

This prevents a five-second cue from firing merely because the app remained paused for five seconds. If no tick occurs between a due time and a stage transition, the transition emits due details immediately before the end event. The event retains both actual emission time and scheduled elapsed time, so a presentation adapter can reason about lateness without changing domain semantics.

## Controller and presentation boundary

`BrewRuntimeController.subscribeGuidance(listener)` delivers only newly emitted events; subscribing does not replay history and therefore does not unexpectedly speak old instructions. `getGuidanceEvents(afterSequence)` supports UI recovery, logging, or an adapter that maintains a durable cursor. Returned events and runtime snapshots are cloned so consumers cannot mutate controller state.

A future voice adapter should subscribe to guidance, apply voice/user settings, and speak `event.message`. A UI adapter may display the same event or query history. Neither adapter decides timing or exactly-once identity.

Vision frames now also drive a runtime tick after detector processing. Thus camera-driven steps receive scheduled detail guidance even when no pour-state transition occurs. Explicit manual `tick(timestampMs)` supports timer-driven integrations without a camera.

## Complete example coverage

The focused test recipe is a four-step Balanced V60:

1. Bloom, with dry-spot and swirl details;
2. First pour, with steady-stream detail;
3. Second pour, with kettle-height detail;
4. Final pour, with gentle-finish detail.

Tests cover:

- recipe-to-runtime conversion;
- deterministic stage/detail sorting and input immutability;
- all three guidance moments;
- complete multi-stage execution;
- repeated ticks and duplicate transitions;
- pause/resume during a step and between steps;
- transition-time delivery when an intermediate tick is absent;
- restart with new run identity and monotonic sequence;
- manual completion and terminal behavior;
- independent snapshot and guidance subscriptions;
- nested guidance cloning into BrewPlan and Recipe Snapshot;
- compatibility with all existing unguided runtime tests.

## Boundaries and follow-up

- No voice engine or browser speech API is implemented.
- No UI is changed.
- No final coaching copy policy is introduced.
- Runtime event history is session-scoped and in memory; a long-lived integration may persist a consumer cursor separately.
- Restart retains event history for auditability but resets stage progress and pause accounting.
- Authored details scheduled after an early step end are not emitted because they were never due while that step was active.

The recommended next slice is a small voice/presentation adapter that consumes `BrewGuidanceEvent`, honors user mute/repeat preferences, and remains replaceable without modifying recipe or runtime semantics.
