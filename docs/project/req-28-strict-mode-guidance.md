# REQ-28 — Strict Mode guidance subscription

Date: 2026-10-24 (Asia/Taipei).

## Browser reproduction

The issue was reproduced before changing product code, in Chrome against
`next dev` with the existing App Router Strict Mode behavior. The browser used
an isolated profile, synthetic stationary camera frames, and a spy on
`speechSynthesis.speak`. No private images or user browser storage were used.

The normal Quick Prepare UI created a Balanced V60 draft. Only that isolated
test draft's snapshot durations were shortened to two seconds per stage, with
one detail at one second. A full navigation to the Brew route exercised effect
setup, cleanup, and setup again. The placement confirmation and Start Brew
buttons were clicked, then all four stages ran to completion.

Before the fix: four stage results and a completed draft were persisted, but
there were zero speech calls, Replay instruction stayed disabled, and current
guidance did not advance to the final end message. The browser reported no
unhandled exceptions. Speech cancellation before starting corroborated the
effect cleanup path.

After the fix: the same scenario produced twelve speech calls in recipe order
(start, detail, end for each of four stages), all with `zh-TW`; Replay instruction
was enabled, the final guidance was displayed, and all four stage results and
the completed draft were persisted. No unhandled browser exceptions occurred.

## Implementation

`GuidedBrewV1Session.activate()` attaches guidance only when no subscription is
active. Disposal clears the subscription reference, so setup after cleanup can
reattach. The component activates the session at the start of its existing
effect. Existing voice and camera cleanup remains in place; no page layout or
product flow changes are part of this fix.

The regression test simulates cleanup followed by repeated activation, checks
exactly one copy of every start/detail/end event, verifies the old subscriber
is not called, and completes the recipe through the active subscription.

## Verification and limits

- Browser flow: PASS for the accelerated four-stage recipe described above.
- Quality gates: lint PASS, typecheck PASS, test PASS (51 files / 810 tests),
  production build PASS. Tests used process-scoped writable TEMP/TMP and
  `npm test -- --maxWorkers=2`. An earlier test run failed with worker EPIPE,
  and a concurrent build failed with memory allocation errors; after closing
  the test browser/dev server and running the checks sequentially, both passed.
  Build ran outside the sandbox because its process restrictions had already
  prevented the unchanged baseline build. No build/test configuration changed.
- The voice spy verifies API invocation and order, not audible playback or OS
  voice availability. A physical iPhone/Android speech test is still required
  by the separate device QA requirements.
- This does not fix camera fallback, persisted pause/restart timing, or failed
  write recovery; those remain separate requirements in the approved sequence.
- REQ-28 changes are intentionally uncommitted for Claude review.
