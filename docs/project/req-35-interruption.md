# REQ-35 — V1 interruption, foreground time and Screen Wake Lock

Baseline: `6a2ec7f` (reviewed/committed REQ-4). Includes the approved REQ-35 review corrections.

## Rules and implementation

- Leaving does not pause a Brew. Only explicit Pause excludes time. Live Brew
  uses wall-clock timestamps, including camera-positioning observations fed to
  the session, without changing any camera-coordinate or vision-frame contract.
- Visibility/page lifecycle and Browser Back record one interruption per Brew
  run. Repeated leave signals do not move the deadline. Foreground/pageshow
  evaluates wall time; a frozen `performance.now()` does not freeze execution.
- Within 30 minutes, elapsed timed stages catch up at their timed boundaries.
  Old speech is suppressed during catch-up. Explicit pauses retain their original
  pause timestamp and remain excluded. A full reload uses REQ-4's manual
  continuation view with recovered stage progress; it does not reconstruct the
  camera/voice session. A still-mounted guided view keeps its runtime.
- More than 30 minutes away clears execution and returns to the same Brew's
  preparation route with Snapshot/Plan/parameters preserved. Exactly 30 minutes
  is still inside the window. App Back keeps REQ-4's confirmation; system/browser
  Back is handled as interruption, including bfcache return.
- If the active elapsed time exceeds the recipe's expected total on return,
  show the overrun choice. Do not auto-complete in the background. Finish and Save
  completes the timed timeline at the actual decision time and saves the same Brew;
  Discard clears execution and returns to preparation. Stage weights stay null,
  `wasSkipped` stays false, and run guards reject stale decisions. Ordinary
  end-of-recipe automatic saving/Detail merging remains REQ-36.
- A late manually completed stage can extend the remaining timeline beyond the
  recipe's original total. Until that timeline reaches its final stage, inspection
  returns active and continues normally instead of offering an impossible Finish.
- Setup, active, paused and discarded/reset executions no longer appear in
  Journal. The Brew hub no longer offers Continue Current Brew. Completed drafts
  and Next Try context remain until their respective REQ-36/37 changes; Journal's
  future To Brew view remains journey 04.

## Persistence and failures

`LocalLiveBrewRepository` stores versioned interruption timestamps/run IDs and
the wake-help opt-out in `cupmaster:live-brew`. Components use services/repositories;
no new cloud schema, IndexedDB outbox, retry mechanism or remote write is introduced.
Malformed metadata is retained and reported. Reset write failure preserves the
execution. If completion succeeds but saving fails, the completed draft remains
and Finish and Save can retry without making another Brew.
If foreground inspection fails, the mounted guided session still catches up from
its in-memory runtime and resumes ticking. The error remains visible with the same
Reload Progress action as the manual view; retry re-evaluates persisted policy.

Old records or an abrupt process termination without a recorded leave event use
the last persisted `updatedAt` conservatively as the interruption boundary; normal
visibility/pagehide/unmount paths record the departure explicitly. This fallback
cannot infer an exact OS-kill timestamp.

## Wake Lock and UI

The adapter handles request/release, stale async requests, Strict Mode cleanup,
visibility and pagehide/pageshow. Successful acquisition is silent. Unsupported,
denied or released acquisition shows the specified one-line hint only during
preparation, below the existing controls. The information button opens a bottom
sheet, with the exact instructions and local Don't Show Again preference in
`guided-brew-copy.ts`. The preference is read before rendering the hint to avoid
a dismissed hint flashing on reload. Wake Lock failure never blocks Start.
Real-device QA must cover iOS Safari, iOS home-screen PWA and Android Chrome:
silent acquisition, rejection/unsupported fallback, hide/release/foreground
reacquisition, screen sleep and local opt-out. Desktop API simulation does not
verify these platform behaviors (tracked in Notion REQ-31).

References: [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API),
[visibilitychange](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event).

## Deployment restriction

REQ-4's deployment gate is still active: no push or deployment before
`20261024110000_brew_execution_timing.sql` is actually applied and verified in
local Supabase. This round does not satisfy or bypass that gate.

## Verification

Lint/typecheck, production build and the 54-file / 843-test full suite passed.
Tests use `--maxWorkers=1 --testTimeout=30000` for the resource-limited host.
Review regression coverage includes a three-stage recipe with a late first manual
completion, plus failed foreground metadata reads using the real session and
persistence, continued ticking and successful inspection retry without duplicate
stage results.

Production browser at 390 × 844 passed:

- Unsupported/denied Wake Lock leaves Start usable. The bottom sheet shows all
  instructions and Don't Show Again survives reload. Held Wake Lock is silent,
  releases when hidden, and reacquires on foreground.
- With performance.now frozen, 35 seconds of wall time advances the timed
  stage and displayed total. A 90-second explicit pause stays excluded.
- Injected foreground metadata read failure still catches up the mounted runtime,
  keeps the displayed timer advancing, shows the error and Reload Progress action,
  and succeeds on retry once storage reads are restored.
- Returning past expected time waits for a choice, then Finish and Save records
  actual elapsed integer seconds and preserves Snapshot identity. Timed stage
  durations sum to actual active time before total-display rounding.
- Reload recovers stage progress in the existing manual view. Browser Back after
  more than 30 minutes clears execution, navigates to preserved preparation,
  and leaves the discarded/reset execution out of Journal.
- Explicit overrun Discard was also verified in the browser: the same Brew and
  Snapshot return to preparation with execution cleared.
- The first browser run exposed bfcache/router restoration leaving a reset Brew
  on Live Brew. Expiry now uses a guarded native location replacement; the
  complete browser suite passed after the fix. The final bottom-sheet screenshot
  was visually inspected after its slide animation. No unhandled browser errors.
