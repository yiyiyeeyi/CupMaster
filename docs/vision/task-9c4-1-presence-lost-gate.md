# Task 9C-4.1 — Presence / Lost Gate

Status: **PASS — select Gate B for the session-004 held-out evaluation**

Date: 2026-09-25  
Branch: `feature/camera-brew-runtime`  
Evaluation source: `data/vision/raw/session-003.mov` only  
Frozen training sessions: `session-001`, `session-002`  
Frozen validation session: `session-003`

## Decision

Gate B, a tiny full-frame binary presence classifier, is selected. It makes all three canonical physical exits reach `LOST`, prevents any segment from crossing a known absence interval, and permits the known re-entry to create a new segment. Its three false `LOST` transitions equal the frozen Task 9C-4 primary-plus-repeat baseline; Gate A produces four and therefore adds one false split during valid visibility.

This passes the narrow 9C-4.1 presence/lost gate. It does not make the hybrid tracker production-ready: the three pre-existing local-relocalization false splits remain, and the sparse localization tail remains poor. The next permitted step is session-004 held-out evaluation with Gate B frozen, not production runtime integration.

## Scope and data isolation

- No dense labels were created. Authoritative first-party frame labels were mapped to `spout_present`: positive frame = 1, intentional negative = 0.
- Training used sessions 001–002 only. Validation and temporal evaluation used session-003 only.
- Session-004 and sessions 005–010 were not accessed.
- Task 9C-3 detector, ROI, and keypoint thresholds were not retuned.
- The production runtime was not modified. Changes are confined to the offline Task 9C-4 runner and its focused tests.
- Generated checkpoints, ONNX, predictions, metrics, clips, and contact sheets remain under ignored `.vision-work/` paths.

## Presence gates

The session-003 static validation set contains 17 authoritative sparse frames: 12 present and 5 absent. These figures are diagnostic, not a claim of generalization from a tiny validation set.

| Metric | Gate A — detector-derived | Gate B — binary classifier |
| --- | ---: | ---: |
| Method | Existing B0 valid detection | Frozen MobileNetV3-small features + global average pooling + one linear logit |
| Threshold | 0.70 | 0.50 |
| Accuracy | 100.00% | 94.12% |
| Positive recall | 100.00% | 100.00% |
| Negative specificity | 100.00% | 80.00% |
| False-present rate | 0.00% | 20.00% (1/5) |
| False-absent rate | 0.00% | 0.00% |
| Median latency | 24.67 ms | 26.74 ms |
| P90 latency | 53.51 ms | 36.29 ms |

Gate B's only sparse false present is the negative frame `session-003-t000000`, with probability 0.5273. This borderline error did not create a temporal false reacquisition because acquisition also requires a detector candidate and keypoint confirmations.

### Gate B training and export

- Formulation: full-frame binary classification, chosen to keep presence independent of tracker quality and tracker ROI drift.
- Head: 576-to-1 linear layer over frozen MobileNetV3-small features; 577 trainable parameters.
- Loss/optimizer: class-weighted binary cross entropy, AdamW, learning rate 0.01, weight decay 0.0001.
- Augmentation: identity, horizontal flip, brightness 0.90, contrast 1.10.
- Seed: 20260925; 100 epochs; checkpoint selected by lowest session-003 validation loss.
- Best epoch / validation loss: 100 / 0.112389.
- ONNX parity maximum absolute logit difference: 0.00000346.
- Checkpoint SHA-256: `65810f9af6a67a964ebfae4cb5dbd0c560a06277ceb2c7f890bf50cc9072ed01`.
- ONNX SHA-256: `85ce9a8a650ed70e2505201daa367cbc314c889ee0df941e6079de4e034b2db4`.

## Frozen temporal policy

- Presence polling: 5 Hz while `TRACKING`.
- Gate A: present at detector confidence >= 0.70; absent otherwise.
- Gate B: present at classifier probability >= 0.50; absent otherwise.
- Acquisition: one positive presence observation plus the existing three consecutive keypoint confirmations.
- Reacquisition: one positive presence observation plus the existing two consecutive keypoint confirmations.
- Lost hysteresis: two consecutive absent observations. Confirmed absence immediately ends the current segment, clears the LK tracker and keypoint state, and returns to detector search.
- Existing uncertainty behavior remains frozen: two local attempts or a 400 ms timeout.
- Old tracker state is never carried across `LOST`.

The evaluated windows are unchanged: primary 00:07.75–00:47.50, exit/lost 00:21.75–00:23.50, re-entry 00:30.50–00:32.50, edge/hand 00:05.00–00:10.75, and repeat cycle 01:01.50–01:09.50.

## Temporal results

Canonical event metrics combine the primary and repeat-cycle windows without double-counting the focused subwindows.

| Metric | Gate A | Gate B |
| --- | ---: | ---: |
| True exits reaching `LOST` | 3/3 | 3/3 |
| Lost delay mean / median / max | 0.644 / 0.667 / 0.683 s | 0.661 / 0.683 / 0.717 s |
| False `LOST` | 4 | 3 |
| Change from frozen 9C-4 false-LOST baseline (3) | +1 | 0 |
| True reacquisitions | 1/1 | 1/1 |
| Reacquisition latency | 0.117 s | 0.617 s |
| False reacquisitions | 0 | 0 |
| False segment splits | 4 | 3 |
| False segment merges | 0 | 0 |
| Segments crossing known absence | 0 | 0 |
| Background lock terminated | yes | yes |

Gate A fails the selected decision rule because its run adds the valid-visibility split at about 00:32.383. Gate B's false splits occur at about 00:10.600, 01:03.750, and 01:04.200; all are existing local-relocalization failures rather than presence-triggered terminations. Therefore Gate B's additional classifier is justified by temporal behavior even though Gate A has better sparse-frame presence classification.

## Drift termination

With selected Gate B, the three physical exits are terminated as follows:

| True exit | `LOST` | Background-lock duration | Maximum anchor displacement before `LOST` |
| --- | --- | ---: | ---: |
| 00:22.250 | 00:22.833 | 0.583 s | 282.42 px |
| 00:45.750 | 00:46.467 | 0.717 s | 44.51 px |
| 01:08.000 | 01:08.683 | 0.683 s | 189.13 px |

Task 9C-4 missed all three audited exits and allowed background tracking to survive through absence. Gate B bounds each background lock to less than 0.72 seconds and terminates it even when LK remains numerically confident. The large first and repeat-cycle displacement values show why LK quality cannot substitute for semantic presence.

## Tracking and compute

| Metric | Gate A | Gate B |
| --- | ---: | ---: |
| Sparse normalized error mean / median / P90 / max | 0.478 / 0.263 / 1.002 / 1.253 | 0.369 / 0.205 / 1.002 / 1.037 |
| Detector calls/s | 0.751 | 0.803 |
| Keypoint calls/s | 4.576 | 4.838 |
| Tracker calls/s | 43.721 | 42.410 |
| Presence calls/s | 3.825 | 3.755 |
| Expensive semantic duty | 10.86% | 11.29% |
| Effective offline FPS | 39.19 | 38.91 |

Gate B retains the Mode C compute advantage: keypoint inference remains below 5 calls/s, presence is below 4 calls/s, expensive semantic work occupies 11.29% of measured offline wall time, and LK remains the high-frequency path. These are desktop offline measurements and do not establish browser or mobile real-time performance.

## Gate assessment

| Requirement | Gate B result |
| --- | --- |
| Every known primary/repeat exit reaches `LOST` | PASS — 3/3 |
| No segment spans a known absence interval | PASS — 0 crossings |
| Re-entry creates a new reacquired segment | PASS — 1/1 |
| False-present background lock materially reduced | PASS — all three previously missed exits now terminate within 0.72 s |
| No unacceptable increase in false `LOST` | PASS — 3, unchanged from the frozen Task 9C-4 baseline |
| Mode C compute advantage remains meaningful | PASS — 4.84 keypoint calls/s, 11.29% semantic duty |

Overall Task 9C-4.1: **PASS**.  
Selected presence gate: **B**.  
Proceed to session-004 held-out evaluation: **yes**, with all Gate B policy and model parameters frozen before access.

## Artifacts

- Metrics: `.vision-work/runs/task-9c4-1-presence/results.json`
- Frame-level predictions: `.vision-work/runs/task-9c4-1-presence/predictions.json`
- Gate A annotated clip/contact sheet: `.vision-work/eval/task-9c4-1/gate-a/`
- Gate B annotated clip/contact sheet: `.vision-work/eval/task-9c4-1/gate-b/`
- Gate B checkpoint: `.vision-work/checkpoints/task-9c4-1/presence-binary.head.pt`
- Gate B ONNX: `.vision-work/exports/onnx/task-9c4-1/presence-binary.onnx`

All artifact paths above are ignored local research outputs and must not be committed.
