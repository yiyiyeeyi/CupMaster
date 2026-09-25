# Task 9C-4 continuous-video hybrid prototype

Status: **COMPLETE — validation prototype; NOT READY for held-out session-004**

## Scope and evidence

The same offline runner evaluated Modes A, B, and C on `data/vision/raw/session-003.mov`. Session 004 and external sessions 005–010 were not opened. No model was trained or retuned, no checkpoint was created, and production runtime code was not modified.

Required windows:

| Window | Time |
| --- | --- |
| Primary | `00:07.75–00:47.50` |
| Clean tracking | `00:32.00–00:45.50` |
| Exit/lost | `00:21.75–00:23.50` |
| Reacquisition | `00:30.50–00:32.50` |
| Edge/hand | `00:05.00–00:10.75` |
| Repeat cycle | `01:01.50–01:09.50` |

All windows were run independently from `ABSENT` through the same state machine. The source was decoded at 60 fps with synchronous processing, queue depth zero, and zero intentionally dropped frames. Overlapping windows were intentionally rerun to test cold-start behavior; sparse localization aggregates use only primary plus repeat-cycle records so authoritative checkpoints are not double-counted.

## Frozen model and runtime configuration

- Mode A: existing A1 full-frame keypoint model, frozen 0.70 threshold, called on every source frame.
- Modes B/C search: existing B0 detector at 2 Hz and confidence threshold 0.70.
- Detector ROI: expand by 30% of predicted width/height on every side, clamp, no square conversion, crop, then `224×224` letterbox.
- Modes B/C keypoint: Task 9C-3 ROI-jitter head at frozen 0.50 threshold.
- Mode B: ROI keypoint on every source frame while active.
- Mode C: LK propagation at source cadence and semantic keypoint correction at 5 Hz; immediate local semantic attempts on low tracker quality.
- Initial acquisition: three consecutive confirmations; reacquisition: two.
- Anti-drift threshold: `0.20 × current bbox diagonal`.
- Local relocalization: at most two attempts and at most 400 ms.

Mode A uses the existing full-frame head because the Task 9C-3 head was trained for ROI input. This distinction was frozen before running the video and was not selected from the resulting metrics.

## LK tracker

OpenCV `4.12.0` pyramidal Lucas–Kanade was added only to the ignored D-drive experiment environment.

| Setting | Value |
| --- | --- |
| Window | `21×21` |
| Pyramid | maximum level 3 |
| Termination | 20 iterations or epsilon 0.01 |
| Features | up to 30 Shi–Tomasi corners in a tip-centered circular patch |
| Refresh | reinitialize the patch after accepted semantic correction |
| Forward/backward gate | median-independent per-feature error ≤ 1.5 px |
| LK error gate | ≤ 20 |
| Minimum valid features | 4 |
| Quality | weighted valid ratio, FB consistency, and feature support |
| Accepted quality | ≥ 0.50 |

The tracker propagates the median valid-feature displacement. It never initializes without detector plus keypoint confirmation. A large semantic/tracker disagreement enters `UNCERTAIN`; it is not silently snapped.

## Sparse ground truth

Localization uses 14 existing authoritative session-003 checkpoints inside the primary or repeat windows: 12 positive and 2 negative. All have dripper geometry, so all located positives are normalized by `sqrt(radiusX × radiusY)`. No dense labels were created.

An eight-frame ignored visual-review package covers exact temporal boundaries absent from the static annotations: initial entry/acquisition, first exit, pre-reentry/reentry, second exit, and repeat entry/exit. It is reference-only and does not manufacture point ground truth.

- Manifest: `.vision-work/eval/task-9c4/sparse-review/sparse-event-review.json`
- Sheet: `.vision-work/eval/task-9c4/sparse-review/sparse-event-review.jpg`

The temporal event boundaries remain the audited quarter-second observations from Step 0. Reacquisition/lost figures should therefore be read at that precision.

## Mode comparison

### Localization and temporal stability

| Mode | Pixel mean / median / P90 | Normalized mean / median / P90 | Miss rate | Negative FP | Sparse residual jitter median / P90 |
| --- | --- | --- | ---: | ---: | --- |
| A | 139.09 / 150.95 / 197.37 px | 0.4328 / 0.4658 / 0.6149 | 0% | 0/2 | 19.99 / 35.82 px/s |
| B | 151.95 / 133.45 / 272.13 px | 0.4731 / 0.4162 / 0.8472 | 0% | 0/2 | 47.06 / 159.31 px/s |
| C | 155.51 / 67.47 / 334.68 px | 0.4852 / 0.2073 / 1.0477 | 0% | **2/2** | 29.20 / 108.46 px/s |

“Sparse residual jitter” is the per-second residual between predicted checkpoint displacement and annotated checkpoint displacement for adjacent positive checkpoints no more than five seconds apart. It is not a substitute for dense frame-to-frame ground-truth jitter; no dense labels were added.

Mode C reduces median sparse jitter by 37.95% relative to Mode B, but is 46.04% worse than Mode A. Its normalized median is substantially better than A/B, while its mean and P90 are worse because of catastrophic drift. It therefore does not preserve localization quality reliably.

### Invocation rates and compute

Rates aggregate all six requested window runs over their 70.75 s total video duration.

| Mode | Detector calls/s | Keypoint calls/s | Tracker calls/s | Effective offline FPS | Semantic duty | Tracker duty |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 0 | 60.08 | 0 | 26.71 | 69.03% | 0% |
| B | 0.42 | 51.48 | 0 | 37.93 | 59.76% | 0% |
| C | 0.21 | 5.94 | 57.48 | 32.60 | **5.63%** | 50.39% |

Mode C reduces expensive detector-plus-keypoint calls to 6.15/s: 89.77% below Mode A and 88.15% below Mode B. Semantic duty falls by 90.58% relative to Mode B. This answers the compute question positively, but does not offset the failed temporal safety behavior.

These are synchronous Windows desktop CPU / ONNX Runtime measurements. They do not predict browser, worker, or mobile performance.

### Latency

Latency includes adapter preprocessing plus inference. Warm-up was three calls per model and was excluded from steady-state summaries.

| Mode/module | Median | P90 | P99 |
| --- | ---: | ---: | ---: |
| A keypoint | 23.11 ms | 33.90 ms | 59.62 ms |
| B detector | 22.78 ms | 27.47 ms | 41.70 ms |
| B keypoint | 16.32 ms | 23.25 ms | 52.46 ms |
| C detector | 19.84 ms | 26.03 ms | 26.55 ms |
| C keypoint | 12.63 ms | 27.24 ms | 67.87 ms |
| C LK update | 15.37 ms | 19.04 ms | 27.56 ms |

The 60 fps source period is 16.67 ms. Median LK fits narrowly inside it on this desktop, but P90 does not; the synchronous runner achieves 32.60 effective FPS for Mode C. No real-time browser claim is justified.

## Primary-window state behavior

### Mode A

- Initial acquisition completes at `00:08.617`.
- An artificial split occurs at `00:16.133`; reacquisition completes at `00:16.200` while the target remained visible.
- First true exit reaches `LOST` at `00:22.633`: approximately 0.383 s delay.
- True re-entry at `00:31.250` reaches `REACQUIRED` at `00:31.350`: approximately 0.100 s.
- Second exit reaches `LOST` at `00:46.150`: approximately 0.400 s delay.
- Primary continuity mean: 0.765; one false split, no false merge.

### Mode B

- An early segment begins during the partial edge/hand entry and splits at `00:08.850`.
- First true exit reaches `LOST` only at `00:23.850`: 1.600 s delay.
- True re-entry reaches `REACQUIRED` at `00:31.383`: approximately 0.133 s.
- A second artificial split occurs at `00:31.700`.
- The second true exit never reaches `LOST` before the window ends.
- Primary continuity mean: 0.957; two false splits, no cross-absence merge, one censored lost failure.

### Mode C

- LK quality failures at `00:09.067` and `00:09.150` recover during the edge/hand phase.
- A semantic/tracker disagreement at `00:10.583` produces `LOST` at `00:10.600` and an artificial `REACQUIRED` at `00:10.633`, even though the target never left.
- The resulting segment remains open across the true `00:22.25–00:31.25` absence. Both `00:25` and `00:31` authoritative negative checkpoints emit points.
- Neither primary exit reaches `LOST`; both are censored failures.
- Because the first absence was merged, the true `00:31.25` re-entry never emits `REACQUIRED` and is a censored reacquisition failure.
- Primary continuity mean is 0.915, but this is inflated by the false merge. There is one false split and one false merge.

On the repeat cycle, Mode C creates two more artificial splits near `01:03.75` and `01:04.20`, reaches only 0.649 continuity, and again fails to declare `LOST` after the `01:08.00` exit.

## Tracker drift and semantic correction

Mode C is initially accurate: normalized checkpoint error is 0.062 at 10 s and 0.026 at 22 s. After the merged absence, it degrades to 1.089 at 38 s, 1.048 at 40 s, and 1.043 at 45 s. The corresponding pixel errors are 351, 334, and 335 px.

Critically, tracker quality is approximately 1.0 at these severely drifted checkpoints. Forward/backward consistency proves only that a local image patch is trackable; it does not prove that the patch remains the physical outlet. At `00:36.23`, visual QA shows the semantic point near the outlet while the tracker/emitted point is on the coffee bed. The subsequent local attempt returns close enough to the stale anchor to restore `TRACKING`, so correction does not contain the drift.

At the first exit (`00:22.40–00:22.60`), the physical outlet leaves while water droplets and high-contrast dripper/bed texture remain. LK repeatedly becomes uncertain, but the ROI head returns 0.997–1.000 confidence on non-outlet structure and local relocalization restores tracking. This is the dominant failure mechanism.

## Failure classification

| Timestamp | Classification | Evidence/impact |
| --- | --- | --- |
| `00:05–00:10.75` | hand/interference tracking; image-edge truncation | Partial entry and hand clutter; transient LK failures at 9.067 and 9.150 s |
| `00:10.583–00:10.633` | semantic/tracker disagreement | Premature LOST and false segment split/reacquisition while target remains visible |
| `00:22.40–00:22.60` | kettle exited frame; delayed lost transition | Outlet leaves, but local keypoint locks to rim/water and restores tracking |
| `00:22.25–00:31.25` | delayed lost transition / false segment merge | Segment continues through the complete absence; negative checkpoints emit tips |
| `00:31.25` | reacquisition failure | No `REACQUIRED` event because the prior segment never ended |
| `00:36.233` onward | LK drift; semantic/tracker disagreement | Tracker moves to coffee-bed structure; FB quality remains high; >330 px tail errors |
| `00:45.75` | kettle exited frame; delayed lost transition | No LOST before primary window end |
| `01:03.733–01:04.283` | semantic/tracker disagreement | Two artificial splits during a continuously visible repeat pour |
| `01:08.00` | kettle exited frame; delayed lost transition | Repeat-cycle exit is also censored with no LOST |

No detector acquisition failure was the dominant issue. Strict false-reacquisition count is zero because every emitted `REACQUIRED` timestamp occurred while the target was visible; those events are instead false segment splits. The important reacquisition failure is the missing event after the true first absence.

## Decision answers

1. **Does tracking materially improve temporal stability?** Partially. It improves sparse median jitter versus Mode B by 37.95%, but is worse than Mode A and produces catastrophic tail drift.
2. **Does tracking reduce detector/keypoint invocation rate?** Yes. Expensive semantic calls fall about 88% versus Mode B.
3. **Is LK drift controllable with 5 Hz semantic correction?** No. The current correction/relocalization path can confirm the wrong local structure.
4. **Are exit/lost transitions reliable?** No. Mode C misses all three audited exits across primary and repeat windows.
5. **Are reacquisitions reliable?** No. The true primary re-entry is never represented because the preceding absence is merged.
6. **Does Mode C preserve or improve localization quality?** No. Median improves, but mean/P90 worsen and both evaluated negatives become false positives.
7. **Dominant failure source?** Semantically unbounded LK/local-relocalization drift after outlet exit or disagreement. The ROI keypoint confidence is not a reliable presence veto on background, water, rim, or coffee-bed texture.
8. **Ready for held-out session-004?** **No.** The validation runner must first demonstrate reliable segment termination and negative-aware correction on session 003 without changing frozen model thresholds post hoc.

This result does not justify a new learned tracker or production integration. A next validation-only iteration should make full semantic presence evidence—not LK self-consistency or the positive-only ROI head—the authority for retaining a segment after repeated uncertainty/edge exit. Any policy change must be declared before rerunning session 003, then frozen before session 004.

## Ignored artifacts

- Results: `.vision-work/runs/task-9c4-hybrid/results.json`
- Per-frame predictions: `.vision-work/runs/task-9c4-hybrid/predictions.json`
- Annotated primary Mode C clip: `.vision-work/eval/task-9c4/mode-c-primary-annotated.mp4`
- Event/contact sheet: `.vision-work/eval/task-9c4/mode-c-primary-contact-sheet.jpg`
- Failure frames: `.vision-work/eval/task-9c4/event-*.jpg`
- Sparse event review: `.vision-work/eval/task-9c4/sparse-review/`

The annotated clip is 540×960, 60 fps, 2,386 frames, and 39.77 s. Overlay legend: yellow ROI, cyan semantic point, yellow tracker point, magenta emitted point, red bottom marker on state-transition frames.

## Verification

- Python compile: pass.
- Offline runner tests: pass, 5/5.
- Existing repository tests: pass, 44 files and 729 tests.
- Lint: pass.
- Typecheck: pass.
- Production build: pass.

Session-004 accessed: **no**  
External benchmark accessed: **no**  
Training started: **no**  
Production runtime modified: **no**
