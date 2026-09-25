# Task 9C-3 detector ROI to keypoint robustness

Status: **COMPLETE — validation experiment only; architecture not frozen**

## Scope and controls

This experiment keeps the Task 9C-2 frozen MobileNetV3-small feature extractor, B0 detector, and spatial keypoint head architecture. It tests whether fixed detector-ROI padding and bounded ROI jitter reduce crop sensitivity.

| Split | Sessions | Positive | Negative | Total |
| --- | --- | ---: | ---: | ---: |
| Train | 001–002 | 34 | 15 | 49 |
| Validation | 003 | 12 | 5 | 17 |

- Seed: `20260925`.
- Input: `224×224` RGB letterbox.
- B0 detector threshold: `0.70`; keypoint threshold: `0.50`.
- R0 reuses the existing B1 head and its GT box expanded by 20% per side.
- Predicted-ROI policy order: expand the predicted bbox around its center, clamp to image bounds, crop, then letterbox to `224×224`. There is no square conversion.
- Padding percentages are fractions of the predicted bbox width/height added independently to **each** side.
- Session 004 and external sessions 005–010 were not opened. No tracking or production runtime work was performed.

Task 9C-2's reported B2 was produced with 20% padding per side. It is retained below as **legacy B2 (20%)** and is not relabeled as the strict no-padding R1 result.

## Detector ROI diagnostics

All diagnostics cover the 12 session-003 validation positives. A signed safety margin is the minimum tip-to-ROI-edge distance when contained and the negative Euclidean distance to the closest ROI point when outside. The normalized margin divides that signed value by the ROI's smaller dimension.

| Diagnostic | Result |
| --- | ---: |
| Raw predicted-ROI tip containment | 75.00% (9/12) |
| Safety margin, px | mean 17.56; median 14.10; P90 56.07; min -26.31; max 90.45 |
| Safety margin / min ROI dimension | mean 0.0406; median 0.0314; P90 0.1361; min -0.0599; max 0.1719 |
| Center displacement, px | mean 121.29; median 124.84; P90 180.18; max 191.27 |
| Center displacement / GT bbox diagonal | mean 0.1788; median 0.1802; P90 0.2479; max 0.3195 |
| Predicted / GT width ratio | mean 0.8736; median 0.8756; P90 0.9848; max 0.9921 |
| Predicted / GT height ratio | mean 1.0141; median 1.0149; P90 1.0886; max 1.1263 |

Three raw predicted ROIs exclude the tip. Width ratios below one across all positives show a systematic tendency toward narrower boxes, while center displacement is also material.

| Padding per side | Tip containment |
| ---: | ---: |
| 0% | 75.00% (9/12) |
| 15% | 100% (12/12) |
| 30% | 100% (12/12) |

## Validation matrix

All configurations emitted a keypoint for all 12 positives, so miss rate is 0%. All normalized metrics use the annotated effective dripper radius. No positive was excluded for missing scale geometry.

| Configuration | Pixel mean | Median | P90 | Max | Normalized mean | Median | P90 | Max | Miss rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| R0 existing B1, GT ROI | 50.03 | 41.77 | 110.54 | 127.30 | 0.1556 | 0.1288 | 0.3420 | 0.3937 | 0% |
| R1 existing head, predicted ROI, 0% | 155.78 | 163.35 | 212.82 | 220.15 | 0.4850 | 0.5022 | 0.6756 | 0.6858 | 0% |
| R2 existing head, predicted ROI, 15% | 99.49 | 102.27 | 148.27 | 168.26 | 0.3098 | 0.3158 | 0.4585 | 0.5342 | 0% |
| R3 existing head, predicted ROI, 30% | 46.55 | 42.28 | 84.06 | 98.45 | 0.1453 | 0.1309 | 0.2599 | 0.3125 | 0% |
| R4 jitter head, predicted ROI, 30% | 26.73 | 20.50 | 60.71 | 80.63 | **0.0836** | **0.0641** | **0.1927** | **0.2529** | 0% |
| Jitter head, GT ROI | 26.95 | 22.70 | 44.82 | 52.98 | 0.0839 | 0.0708 | 0.1387 | 0.1638 | 0% |

For reference, legacy B2 (predicted ROI with 20% per-side padding) had normalized mean `0.2555`, median `0.2429`, and P90 `0.4074`.

### Gap analysis

Using the Task 9C-2 legacy B2-to-B1 mean gap as the denominator:

- R3 fixed 30% padding closes `110.34%` of the gap: `(0.255453 - 0.145306) / (0.255453 - 0.155626)`. It slightly exceeds the R0 mean, although its median is 1.6% worse than R0.
- R4 closes `172.12%` of that same gap and reduces normalized mean by 42.45% relative to R3.
- The jitter head on GT ROI improves normalized mean from `0.1556` to `0.0839` (46.07%) rather than damaging best-case precision. Its median improves from `0.1288` to `0.0708`, and P90 from `0.3420` to `0.1387`.

These percentages describe this small, single-session validation set and are not production claims.

## ROI-jitter training

One keypoint-head variant was trained; the backbone and head architecture were unchanged.

- Training ROI starts from the GT bbox.
- Independent `dx` and `dy` are sampled uniformly from `[-0.10, 0.10] × bbox width/height`.
- One shared scale is sampled uniformly from `[0.85, 1.30]` and applied to width and height.
- Deterministic rejection sampling makes at most 32 attempts so the annotated tip remains inside the crop.
- Validation inputs are never jittered.
- Existing augmentations only: identity, horizontal flip, brightness 0.90, contrast 1.10.
- Training budget: 100 head-only epochs; best checkpoint at epoch 75.
- Checkpoint SHA-256: `812c1c5497f899284528943b2ec76d1705c18da14a5a9a9006b81f40a463c7e7`.

## Highest-error R4 frames

The top five are classified from the overlay, ROI geometry, containment, and IoU. All padded ROIs touch the top image boundary because the spout enters from above; boundary contact alone is therefore not sufficient to call every error truncation.

| Frame | Normalized error | Detector IoU | Tip contained | Safety margin px | Confidence | Cause |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| `session-003-t040000` | 0.2529 | 0.4340 | yes | 251.35 | 0.9995 | image-edge truncation / shifted low-IoU ROI |
| `session-003-t067000` | 0.1927 | 0.4935 | yes | 115.58 | 0.9998 | image-edge truncation / shifted low-IoU ROI |
| `session-003-t017000` | 0.1144 | 0.5813 | yes | 202.16 | 0.9999 | keypoint failure despite good ROI |
| `session-003-t022000` | 0.0878 | 0.6412 | yes | 142.52 | 0.9998 | keypoint failure despite good ROI |
| `session-003-t035000` | 0.0723 | 0.5182 | yes | 164.49 | 0.9999 | keypoint failure despite good ROI |

The first two retain relatively poor detector alignment after padding. The other three have IoU at or above 0.50, contain the tip with ample margin, and are residual keypoint errors rather than crop exclusion. No labels were changed.

## Best validation configuration

The best observed validation configuration is the existing B0 detector at threshold `0.70`, its bbox expanded by 30% of predicted width/height on every side and clamped to image bounds, followed by a non-square crop letterboxed to `224×224`, then the ROI-jitter-trained keypoint head at threshold `0.50`.

This is an experiment winner, not a frozen product architecture. Selection and measurement both use session 003, the validation sample contains only 12 positives from one session, and session 004 remains sealed.

## Decision

1. **Simple padding materially closes the legacy B2-to-B1 gap.** Thirty percent per side reduces mean normalized error from `0.2555` to `0.1453` and restores full tip containment.
2. **ROI-jitter materially improves predicted-ROI robustness.** R4 reduces mean error another 42.45% versus R3 and improves median and P90 as well.
3. **Robustness training does not damage GT-ROI precision in this validation run.** It improves all reported GT-ROI error summaries.
4. **The remaining error is both ROI quality and keypoint robustness, with a strong data limitation.** Padding removes crop exclusion, while jitter produces another large gain. The largest residuals include two poor-alignment/image-edge ROIs and three keypoint failures despite adequate ROIs. Only one 12-positive validation session is insufficient to assign a stable production error budget.

Do not freeze the final architecture from this result. A later gate should validate the selected configuration on still-sealed first-party session 004 before any external benchmark or tracking decision.

## Artifacts and ONNX

Generated artifacts remain ignored under `.vision-work`:

- Results: `.vision-work/runs/task-9c3-roi-robustness/results.json`
- Per-frame diagnostics: `.vision-work/runs/task-9c3-roi-robustness/diagnostics.json`
- Predictions: `.vision-work/runs/task-9c3-roi-robustness/predictions.json`
- Deterministic jitter samples: `.vision-work/runs/task-9c3-roi-robustness/jitter-samples.json`
- Validation contact sheets and overlays: `.vision-work/eval/task-9c3/validation-visuals/`
- Head checkpoint: `.vision-work/checkpoints/task-9c3/r4-jitter-roi-keypoint.head.pt`
- ONNX export: `.vision-work/exports/onnx/task-9c3/r4-jitter-roi-keypoint.onnx`

The ONNX model uses fixed input `[1, 3, 224, 224]`, output `[1, 3]` (`confidence`, normalized `x`, normalized `y`), and is 4,195,476 bytes. ONNX Runtime CPU matched the PyTorch output within `3.58e-7` maximum absolute difference. Export emitted the same non-blocking legacy-exporter warning recorded in 9C-2.

## Verification

- Python compile: pass.
- New ROI policy tests: pass, 3/3.
- Existing tests: pass, 44 files and 729 tests.
- Lint: pass.
- Typecheck: pass.
- Production build: pass.
- ONNX load/inference/parity: pass; maximum absolute difference `3.58e-7`.
