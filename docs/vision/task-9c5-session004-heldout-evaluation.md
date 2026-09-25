# Task 9C-5 — Session-004 Held-Out First-Party Evaluation

Status: **FAIL — no external benchmark evaluation**

Date: 2026-09-25  
Branch: `feature/camera-brew-runtime`  
Frozen source commit: `ce6662902575886432729edaf0c25d3db2dc1201`  
Test source: `data/vision/raw/session-004.mov` only

## Decision

The frozen hybrid does not generalize to session-004. Gate B classifies every authoritative positive test frame as absent and rejects every continuous detector candidate, so the state machine never leaves `SEARCHING`. No keypoint is confirmed, no LK segment starts, no exit produces `LOST`, and no re-entry produces `REACQUIRED`.

The detector/ROI/keypoint path also fails independently in the sparse held-out test: only 8/14 positives pass the frozen detector threshold, no predicted bbox reaches IoU 0.50, frozen 30% padding contains only 4/14 positive tips end to end, and Mode B normalized error rises from 0.0836 on session-003 validation to 0.8594 on session-004 held-out frames.

This is a held-out failure. No threshold, checkpoint, ROI, hysteresis, tracker parameter, architecture, or state transition was changed after observing it. The system is not production-ready and must not proceed to the external benchmark in this experiment round.

## Held-out discipline

| Check | Result |
| --- | --- |
| Session-004 result used to alter a threshold | no |
| Session-004 result used to retrain a model | no |
| Checkpoint reselected using session-004 | no |
| ROI padding changed | no |
| Presence hysteresis changed | no |
| LK parameters changed | no |
| State machine changed | no |
| External sessions 005–010 accessed | no |
| Production runtime modified | no |

One evaluation-wrapper bug was fixed before continuous inference: a rejected negative detector output had degenerate bbox geometry, and the static evaluator attempted to pad it even though it could never enter the frozen ROI path. The wrapper now skips padding rejected/invalid boxes. This did not change model output or runtime behavior. The aborted attempt did not reach continuous evaluation or produce a held-out decision.

## Frozen artifacts and configuration

| Component | Frozen value |
| --- | --- |
| Detector | B0, threshold 0.70, SHA-256 `4a432c32122966a7389ead7b10b1fe89d8c55aa3adb780abb3b857111b412a17` |
| Full-frame keypoint | A1, threshold 0.70, SHA-256 `ab116063e39ff8d90969c852eb6380e54e852c6fce3c84fc526850956a99e3b2` |
| ROI keypoint | R4 jitter head, threshold 0.50, SHA-256 `4392120cb1e2aa3cd652dd6bf0d607bd7252505e4460b2c69eb25f470ed20117` |
| Presence | Gate B, threshold 0.50, SHA-256 `85ce9a8a650ed70e2505201daa367cbc314c889ee0df941e6079de4e034b2db4` |
| ROI | bbox + 30% per side, clamp, no square conversion, 224×224 letterbox |
| Presence policy | 5 Hz, two consecutive absent observations for `LOST` |
| Semantic correction | frozen 5 Hz |
| Tracker | exact Task 9C-4 pyramidal LK settings |
| State machine | exact Task 9C-4.1 implementation |

The training-ready manifest and annotation hashes, source-video hash, runtime/provider, complete configuration, per-frame predictions, and invocation timings are recorded in the generated results.

## Test data and event audit

The video is 309.176 seconds, 1080×1920, 29.970 fps, and 9,266 frames. The authoritative sparse test set has 22 frames: 14 positive and 8 negative.

The complete video was audited before model output was inspected. Event boundaries are approximate manual references from 2-second and 0.5-second contact sheets, not model-selected windows. Boundary precision is limited by that review cadence.

| Approximate time | Event | Notes |
| --- | --- | --- |
| 00:00.0–01:16.0 | Preparation/interference | Coffee loading, bed preparation, hands, brewer interaction |
| 01:16.0–01:34.5 | Absence | Empty setup before first pour |
| 01:34.5–01:56.5 | Active pour 1 | Entry through top image edge; continuous motion |
| 01:56.5–02:22.5 | Absence | Clear exit |
| 02:22.5–02:35.0 | Active pour 2 | Re-entry and pour |
| 02:35.0–02:56.5 | Absence/interference | Exit; hand adjustment around 02:46–02:55 |
| 02:56.5–03:08.0 | Active pour 3 | Re-entry and pour |
| 03:08.0–03:34.5 | Absence/interference | Exit; hand adjustment around 03:24–03:34 |
| 03:34.5–03:41.5 | Active pour 4 | Short pour |
| 03:41.5–04:12.5 | Absence/interference | Exit; brewer/hand adjustment around 03:56–04:11 |
| 04:12.5–04:27.0 | Active pour 5 | Re-entry and pour |
| 04:27.0–04:52.0 | Absence | Clear final exit |
| 04:52.0–05:09.2 | Scene transition | Brewer removal and server/cup handling; no usable spout |

All five entries/exits interact with the upper image boundary. Reflective metal, water, dark brewer structures, and several hand-interference periods are present.

## Held-out single-frame evaluation

### Detection and ROI

| Metric | Session-004 result |
| --- | ---: |
| Positive acquisition recall | 57.14% (8/14) |
| Positive recall at IoU ≥ 0.50 | 0.00% (0/14) |
| Negative false-positive rate | 0.00% (0/8) |
| Accepted-positive bbox IoU mean / median / P90 / max | 0.191 / 0.149 / 0.491 / 0.491 |
| Raw tip containment, all positives | 14.29% (2/14) |
| 30%-padded containment, all positives | 28.57% (4/14) |
| Raw containment, accepted positives | 25.00% (2/8) |
| 30%-padded containment, accepted positives | 50.00% (4/8) |

Session-003 validation had 75% raw containment and 100% containment after 15% or 30% padding. The session-004 collapse is therefore detector ROI shift/generalization failure, not evidence that a slightly different padding percentage should be selected. Six positive frames fail acquisition outright: 147, 154, 183, 187, 215, and 217 seconds. Four additional accepted detections still exclude the tip after padding: 150, 180, 253, and 255 seconds.

### Keypoint Mode A — full frame

| Metric | Result |
| --- | ---: |
| Located positives | 12/14 |
| Miss rate | 14.29% |
| Negative false-positive rate | 0.00% |
| Pixel error mean / median / P90 / max | 101.88 / 99.54 / 140.33 / 335.74 px |
| Normalized error mean / median / P90 / max | 0.3670 / 0.3575 / 0.5023 / 1.2120 radii |
| Normalized eligible | 12/12 located |

### Keypoint Mode B — detector → padded ROI → jitter head

| Metric | Result |
| --- | ---: |
| Located positives | 8/14 |
| End-to-end miss rate | 42.86% |
| Negative false-positive rate | 0.00% |
| Pixel error mean / median / P90 / max | 238.87 / 218.43 / 386.42 / 386.42 px |
| Normalized error mean / median / P90 / max | 0.8594 / 0.7843 / 1.3831 / 1.3831 radii |
| Normalized eligible | 8/8 located |

For comparison, the selected R4 path on session-003 validation had zero misses and normalized mean / median / P90 / max of 0.0836 / 0.0641 / 0.1927 / 0.2529. Held-out Mode B mean error is about 10.3× the validation mean and is materially worse than held-out full-frame Mode A. The ROI/keypoint improvement does **not** generalize.

## Presence evaluation

### Authoritative sparse frames

| Metric | Session-003 validation | Session-004 held-out |
| --- | ---: | ---: |
| Positive recall | 100% (12/12) | **0% (0/14)** |
| Negative specificity | 80% (4/5) | 100% (8/8) |
| False-present rate | 20% | 0% |
| False-absent rate | 0% | **100%** |
| Accuracy | 94.12% | 36.36% |
| Median / P90 latency | 26.74 / 36.29 ms | 28.32 / 38.68 ms |

All 14 held-out positive probabilities are below 0.50; the largest is 0.333 at 100 seconds. This is not a borderline threshold effect across a few examples. It is a session-level presence generalization failure.

### Full continuous video

Gate B was invoked 100 times after detector candidates: 94 during audited visible intervals and 6 during absence. All 94 visible observations were false absent, and none of the 6 absent observations was false present.

- False absent: 94/94, 100%
- False present: 0/6, 0%
- Denominator caveat: these are conditional on frozen gate invocations; `SEARCHING` frames without a detector candidate do not invoke Gate B.

Because presence never becomes positive, detector candidates never advance to keypoint confirmation.

## Continuous session-004 results

| Metric | Result |
| --- | ---: |
| Audited true visible segments | 5 |
| Emitted trajectory segments | 0 |
| True exits reaching `LOST` | 0/5 |
| Lost delay | unavailable — acquisition never occurred |
| False `LOST` | 0, vacuous because tracking never started |
| True reacquisitions | 0/4 |
| Reacquisition latency | unavailable |
| False reacquisitions | 0 |
| False segment splits | 0, vacuous |
| False segment merges | 0, vacuous |
| Segments crossing confirmed absence | 0, vacuous |
| Segment continuity | 0 for all five true intervals |
| Sparse continuous miss rate | 100% (14/14 positives) |

The qualitative safety property “no trajectory persists across confirmed absence” is technically not violated, but only because no trajectory exists. This is not temporal-safety success. Exits cannot reach `LOST` and re-entries cannot create new segments when acquisition is completely blocked.

## Tracking, jitter, and drift

LK was never initialized:

- Tracker invocations: 0
- Keypoint corrections: 0
- Semantic/tracker disagreement samples: 0
- Sparse jitter samples: 0
- Drift samples and maximum observed drift: unavailable

No claim about held-out LK drift or correction quality is possible. The dominant failure occurs earlier in the pipeline.

## Compute

| Metric | Session-004 result |
| --- | ---: |
| Detector calls/s | 1.999 |
| Keypoint calls/s | 0.000 |
| Tracker calls/s | 0.000 |
| Presence calls/s | 0.323 |
| Semantic duty | 17.55% |
| Tracker duty | 0.00% |
| Effective offline FPS | 98.41 |
| Wall time | 94.16 s for 309.18 s video |
| Dropped frames / queue depth | 0 / 0 |

The apparent throughput advantage is not evidence that the usable hybrid retained its compute advantage: it results from rejecting every acquisition and therefore doing no keypoint or tracker work. Compute efficiency is only meaningful after acceptable acquisition and localization.

## Failure analysis

| Failure class | Timestamps / evidence | Assessment |
| --- | --- | --- |
| Presence false-absent | Every positive sparse frame; all 94 visible continuous observations | **Dominant blocker**; prevents all acquisition |
| Detector acquisition failure | 147, 154, 183, 187, 215, 217 s | 6/14 positives below threshold |
| Detector ROI shift | All accepted-positive IoUs < 0.50; tips outside padded ROI at 150, 180, 253, 255 s | Severe held-out geometry shift |
| Keypoint localization failure | Mode B normalized mean 0.859, max 1.383 | All emitted Mode B points are unusably inaccurate for trajectory guidance |
| Image-edge truncation | Upper-boundary entry/exit in all five cycles; accepted padded ROIs touch a boundary | Likely contributor to detector geometry failure |
| Hand/interference | ~166–175, 204–214, 236–251 s, plus preparation | Present, but not the main blocker because failures persist in clean active-pour frames |
| Reflective spout/water confusion | Throughout active pours | Plausible contributor to detector/keypoint shift; not isolated causally |
| LK drift / local relocalization split | Not observable | Gate B prevents tracker initialization |
| Delayed `LOST` / false reacquisition | Not measurable | No acquired segment exists |

## Required answers

1. **Does the ROI/keypoint improvement generalize?** No. Mode B misses 42.86%, has 0/14 IoU-qualified detections, and its normalized mean is about 10.3× validation.
2. **Does the presence gate generalize?** No. Positive recall falls from 100% validation to 0% held-out.
3. **Do exits reliably reach `LOST`?** No. 0/5; the system never acquires, so the zero false-LOST count is vacuous.
4. **Do re-entries reliably create new segments?** No. 0/4.
5. **Are false splits still a material issue?** They cannot be evaluated because no segment starts; acquisition failure is strictly earlier and more severe.
6. **Does the hybrid retain its compute advantage?** Not demonstrably. High FPS and zero tracker/keypoint work are consequences of total rejection, not useful hybrid operation.
7. **Dominant held-out failure mode?** Gate B presence false-absent generalization failure, compounded by detector acquisition/ROI shift and unusable Mode B localization.
8. **Ready for external benchmark evaluation?** **No.** Record this first-party failure immutably and return to a new train/validation-only development round without using session-004 for repair.

## Artifacts

- Results: `.vision-work/runs/task-9c5-session004-heldout/results.json`
- Per-frame predictions: `.vision-work/runs/task-9c5-session004-heldout/predictions.json`
- Full-video overlay: `.vision-work/eval/task-9c5/session004-heldout/mode-c-primary-annotated.mp4`
- Full-video contact sheet: `.vision-work/eval/task-9c5/session004-heldout/mode-c-primary-contact-sheet.jpg`
- Static held-out overlay/contact sheet: `.vision-work/eval/task-9c5/session004-heldout/static/`
- Manual event-audit sheets: `.vision-work/eval/task-9c5/session004-audit/`

All generated artifacts remain under ignored `.vision-work/` paths and must not be committed.
