# REQ-3 — Optional camera in Guided Brew

## Scope

Vertical Slice 1 / V1 complete loop, on the existing Brew route. The approved
product decision also permits choosing timer/voice mode when a camera is
available. No new route, layout section, calibration contract or vision
inference is added. The reviewed REQ-28 fix is the baseline (`c2bcb53`).

## Behavior

- Camera denial, unsupported capture, acquisition errors, or failed preview
  playback switch setup to `timer_voice` mode. Start no longer waits for camera
  frames or dripper placement in that mode.
- Before brewing, the existing action area offers
  「不用相機，只用計時與語音」 even while camera permission is pending or the
  preview is available. It stops sampling, clears the preview and stops tracks.
- The existing camera card visibly labels the mode and offers retry. Failed
  retry leaves timer/voice available. Successful retry before Start returns to
  positioning and requires fresh placement confirmation; successful retry
  during brewing changes only the preview mode and preserves runtime progress.
- Start, recipe guidance, timer progression, completion and Save Brew reuse the
  existing engine and services. No Feedback, AI, Bean or owned Equipment is
  required to save the cup.

## Async resource boundary

The camera service increments a request generation on stop/restart. Late
acquisition results are stopped rather than installed, and late rejections
cannot overwrite a newer stream. The component also invalidates its pending
preview/attachment work on stop, switch and effect cleanup. No permission
promise can be cancelled at the browser level; its result is safely discarded.

Mode selection belongs to the application session, while media ownership
remains in the camera adapter. New copy is extracted into
`src/components/guided-brew-copy.ts`. Components use the existing services and
repositories for Brew persistence; this requirement introduces no new store.

## Verification

New unit tests cover timer/voice completion without any camera frame, fresh
positioning after switching back, preserving an active runtime while enabling
camera, late permission grants after cancellation, overlapping requests, and
late rejections after a newer successful request.

Browser tests use an isolated profile, synthetic stationary
camera frames, and a speech API spy; private media and ordinary browser data
are never used. The four-stage test recipe is accelerated to two seconds per
stage with one detail at one second.

The production-server browser run passed all eight scenarios below. Each
completed four stages, emitted twelve guidance speech calls with no duplicate
messages, and saved a completed Brew without Feedback or AI. The saved total
was eight seconds in each accelerated case. No unhandled browser exceptions
were reported.

| Scenario | Additional assertion |
| --- | --- |
| Permission denied | Automatic timer/voice mode and empty video source |
| Capture unsupported | Automatic timer/voice mode and empty video source |
| Camera available, user opts out | Existing preview stopped and cleared |
| Permission pending, user opts out | Late-granted track is ended |
| Preview playback fails | Timer/voice fallback still completes and saves |
| Retry before starting | Fresh positioning is required; opt-out remains available |
| Retry during brewing | Same stored start timestamp and uninterrupted runtime |
| Normal camera control | Original placement and camera-guided flow still works |

The development-server run passed its first three cases but was interrupted
by memory pressure in the test environment. Turbopack initially returned 404
for the existing dynamic route; Webpack served it after cold compilation but
later reported a cache allocation failure. All eight cases were therefore
rerun on the production server after a successful build. Interrupted dev
generation also left malformed `.next/dev/types` files; the ignored generated
directory was preserved outside the repository before rebuilding. No source,
package, TypeScript configuration, or build configuration was changed for
these environment workarounds.

Final quality gates: lint PASS, typecheck PASS, test PASS (51 files / 816
tests, `npm test -- --maxWorkers=1` with writable process-scoped TEMP/TMP),
production build PASS, and eight production browser cases PASS. The first
full test run had one unrelated existing migration-review timeout; the same
test file passed independently, followed by the final complete passing run,
without changing its timeout or assertions. Build ran outside the sandbox.

## Limits

Physical phone permission UI and audible OS speech remain device QA. Browsers
may require a permissions change in browser settings before retry can succeed;
the app cannot override a denied permission. Speech is optional and touch start
remains available when speech recognition is unsupported.

Persisted pause/restart semantics and write-failure recovery remain REQ-4,
REQ-27 and REQ-5. This change does not claim reload continuation for an active
guided runtime. It does not change either A/B coordinate contract.
