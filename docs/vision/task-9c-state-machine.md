# Task 9C hybrid runtime state machine

Status: **FROZEN for offline feasibility experiments**

## State meanings and module activity

| State | Meaning | Module activity | Data retained |
| --- | --- | --- | --- |
| `ABSENT` | Runtime stopped or no search requested | None | Completed segment summaries only |
| `SEARCHING` | Initial whole-frame search | A: keypoint; B/C: detector at polling rate | Confirmation counters, search telemetry |
| `ACQUIRING` | Candidate exists but is not confirmed | Keypoint every eligible frame; detector may refresh ROI | Candidate bbox/point, origin (`initial` or `reacquisition`), confirmation run |
| `TRACKING` | Target is currently confirmed | A/B: periodic model observations; C: tracker high-rate plus model refresh | Last trusted bbox/tip, tracker state in C, open segment |
| `UNCERTAIN` | Quality fell below policy but timeout/attempt budget remains | Immediate keypoint refresh; detector if ROI is stale; tracker output is provisional | Last trusted observation, open segment, failure timer and attempts |
| `LOST` | Confirmation was lost | Detector or full-frame keypoint search; tracker stopped | Last segment summary and reacquisition counter; no live candidate/tracker state |
| `REACQUIRED` | Confirmed after a loss; transient audit state | Keypoint confirmation complete; tracker may initialize | New segment, confirmed point/bbox, transition telemetry |

`TRACKING` means “confirmed and being followed by the configured mode,” not necessarily “an optical tracker is active.” This keeps segment and evaluation semantics identical across Modes A–C.

## Transition table

| From | Event / guard | To | Actions |
| --- | --- | --- | --- |
| `ABSENT` | `BEGIN_SEARCH` | `SEARCHING` | Clear transient state; arm search scheduler |
| `SEARCHING` | Search miss | `SEARCHING` | Increment search/miss telemetry |
| `SEARCHING` | Candidate meets module threshold | `ACQUIRING` | Store candidate; start initial confirmation run |
| `ACQUIRING` | Candidate rejected or confirmation interrupted | `SEARCHING` | Clear candidate and confirmation run |
| `ACQUIRING` | Initial confirmation count reached | `TRACKING` | Start first segment at first confirmation timestamp; initialize tracker in C |
| `TRACKING` | Tracker/model confidence degrades or correction jump exceeds bound | `UNCERTAIN` | Start failure timer; freeze last trusted point; request correction |
| `UNCERTAIN` | Local keypoint confirmation succeeds in budget | `TRACKING` | Apply confirmed correction; clear failure timer/attempts |
| `UNCERTAIN` | Attempts exhausted or 400 ms timeout reached | `LOST` | End segment at last trusted timestamp; reset tracker and candidate |
| `LOST` | Search miss | `LOST` | Keep searching; do not emit points |
| `LOST` | Candidate meets module threshold | `ACQUIRING` | Mark origin as reacquisition; start two-observation confirmation |
| `ACQUIRING` | Reacquisition confirmation reached | `REACQUIRED` | Start a new segment; initialize tracker in C |
| `REACQUIRED` | Transition event recorded | `TRACKING` | Resume normal schedule |
| `REACQUIRED` | Immediate confidence degradation | `UNCERTAIN` | Preserve new segment but start correction policy |
| Any state | `STOP` | `ABSENT` | End open segment if present; reset modules and transient state |

The pure reference transition function rejects any transition not listed above. Timeouts and confirmation counters are orchestrator guards that emit the corresponding event; they are not hidden inside model adapters.

## Data lifecycle

On entry to `SEARCHING` from `ABSENT`, clear bbox, tip, tracker state, attempts, timers, and confirmation counters. On an ordinary search miss, retain only counters and telemetry.

On entry to `ACQUIRING`, retain the candidate and its source frame, confidence, and acquisition origin. Any interruption resets the consecutive confirmation run; non-consecutive evidence never accumulates.

During `TRACKING`, the last accepted point is trusted output. Raw candidate corrections and tracker-only provisional points may be logged for evaluation but are not emitted as confirmed ground truth.

During `UNCERTAIN`, keep the open segment and last trusted output so a short dropout can recover without creating an artificial segment break. Do not advance the trusted trajectory with low-quality tracker points.

On entry to `LOST`, close the segment, clear live bbox/tip/tracker state and all image/tensor references, and retain only compact segment/transition telemetry. Reacquisition must form a new segment.

## Initial acquisition policy

The experimental default requires three consecutive eligible keypoint observations at or above 0.55. In Modes B/C, each observation must also be associated with a current detector bbox at or above 0.45. Candidate points must lie within image bounds and within the accepted ROI when one exists. A miss or contradictory candidate resets the run.

## Reacquisition policy

After `LOST`, Mode A searches with the whole-frame keypoint model; Modes B/C restart the detector. A candidate needs two consecutive qualifying keypoint observations before `REACQUIRED`. This lower count is an experiment default intended to test latency, not a claim that two frames are safe in production. False-reacquisition rate is a required gate.

## Anti-drift policy

Mode C may propagate between model calls, but:

1. refresh the keypoint at 5 Hz or sooner on low tracker quality;
2. keep the detector inactive during healthy tracking;
3. reject silent corrections exceeding 0.20 of the current bbox diagonal;
4. attempt at most two local keypoint recoveries;
5. enter `LOST` and restart full detection after the attempt budget, 400 ms failure timeout, invalid trusted geometry, unusable ROI, or explicit scene discontinuity;
6. never extend a segment solely because the tracker continues returning coordinates.

These numeric values are configurable and must be tuned without session 004.
