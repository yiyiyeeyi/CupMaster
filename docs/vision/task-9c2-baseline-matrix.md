# Task 9C-2 offline baseline matrix

Status: **COMPLETE — offline validation baseline only**

## Scope

The matrix compares A1 full-frame keypoint localization, B0 detection, B1 ground-truth ROI keypoint localization, and B2 predicted-detector ROI keypoint localization. Training is limited to sessions 001–002 and validation to session 003. Tracking, session 004, and the external benchmark are out of scope.

## Dataset and controls

| Split | Sessions | Positive | Negative | Total |
| --- | --- | ---: | ---: | ---: |
| Train | 001–002 | 34 | 15 | 49 |
| Validation | 003 | 12 | 5 | 17 |

- Seed: `20260925`.
- Frozen MobileNetV3-small ImageNet-1K V1 feature extractor; head-only training.
- Input: `224×224` RGB letterbox.
- Conservative deterministic augmentation: identity, horizontal flip, brightness 0.90, contrast 1.10.
- Checkpoint selection: lowest session-003 validation loss within a 100-epoch head budget.
- Confidence selection: fixed candidates 0.30, 0.40, 0.50, 0.60, 0.70 on validation only.
- Media loader allowlist: sessions 001–003. Session 004 and sessions 005–010 were not opened or evaluated.

## Results

### A1 — full-frame keypoint

Confidence threshold: 0.70. All 12 validation positives emitted a keypoint; all five negatives stayed blank.

| Error | Mean | Median | P90 | Max |
| --- | ---: | ---: | ---: | ---: |
| Pixels | 127.85 | 119.69 | 194.71 | 200.53 |
| Dripper radii | 0.3979 | 0.3720 | 0.6108 | 0.6243 |

- Miss rate: 0%.
- Normalized eligible: 12; excluded for missing dripper geometry: 0.
- Negative false-positive count: 0/5.

### B0 — detector only

Confidence threshold: 0.70.

- Positive recall at IoU ≥ 0.50: 66.67% (8/12).
- Positive acquisition rate regardless of IoU: 100% (12/12).
- Negative false-positive rate: 0% (0/5).
- Bbox IoU over acquired positives: mean 0.5604, median 0.5660, P90 0.7304, max 0.7326.
- Positive confidence: mean 0.9997, median 0.9999.
- Negative confidence: mean 0.0124, median 0.0083, max 0.0213.

The confidence separation is strong on this single validation session, but four accepted positive boxes remain below IoU 0.50. This is a localization limitation, not an acquisition miss.

### B1 — ground-truth ROI to keypoint

Confidence threshold: 0.50. The crop expands the GT box by 20% and clips it to image bounds.

| Error | Mean | Median | P90 | Max |
| --- | ---: | ---: | ---: | ---: |
| Pixels | 50.03 | 41.77 | 110.54 | 127.30 |
| Dripper radii | 0.1556 | 0.1288 | 0.3420 | 0.3937 |

- Miss rate: 0%.
- Normalized eligible: 12; excluded for missing dripper geometry: 0.

### B2 — predicted detector ROI to keypoint

All 12 validation positives passed the B0 confidence threshold and the B1 keypoint threshold.

| Conditional error | Mean | Median | P90 | Max |
| --- | ---: | ---: | ---: | ---: |
| Pixels | 82.01 | 78.10 | 131.74 | 145.57 |
| Dripper radii | 0.2555 | 0.2429 | 0.4074 | 0.4621 |

- Detector acquisition failure: 0%.
- Keypoint miss conditional on detector acquisition: 0%.
- End-to-end tip emission rate: 100%.
- End-to-end accurate-tip rate: 16.67% (2/12).
- Accurate-tip definition: normalized error ≤ 0.10 effective dripper radii; if scale geometry were absent, fallback would be ≤ 20 px. No validation frame required the fallback.

## Direct comparisons

### A1 vs B1

A correct ROI materially helps. B1 reduces mean pixel/normalized error by 60.9% and median error by 65.1% relative to A1. This supports the ROI-localization hypothesis.

### B1 vs B2

Detector box error materially erodes the ROI benefit. B2 mean error is 63.9% higher than B1 and median error is 87.0% higher. Visual QA shows several predicted boxes shifted or wider than GT even though their confidence is near one.

### A1 vs B2

The real two-stage path remains better than full-frame localization on session 003: B2 reduces mean error by 35.9% and median error by 34.7%. However, a 0.2555-radius mean normalized error and only 16.67% at the exploratory 0.10-radius accuracy threshold are not sufficient to select a product architecture.

## ONNX feasibility

All models use fixed input `[1, 3, 224, 224]` and opset 17. Output column 0 is confidence; detector columns 1–4 are normalized bbox coordinates and keypoint columns 1–2 are normalized tip coordinates.

| Export | Output | Size | Source vs ONNX max abs difference |
| --- | --- | ---: | ---: |
| B0 detector | `[1, 5]` | 4,195,996 bytes | 4.17e-7 |
| A1 keypoint | `[1, 3]` | 4,195,476 bytes | 5.36e-7 |
| B1 keypoint | `[1, 3]` | 4,195,476 bytes | 2.98e-7 |

All three loaded and ran with ONNX Runtime CPU. Each export captured the same non-blocking legacy-exporter warning: `The feature will be removed. Please remove usage of this function`. Browser integration remains out of scope.

## Visual QA and ignored artifacts

- Contact sheet: `.vision-work\eval\task-9c2\validation-visuals\validation-contact-sheet.jpg`
- Individual overlays: the same directory, one per validation frame.
- Machine-readable metrics: `.vision-work\runs\task-9c2-baseline\results.json`
- Per-frame predictions: `.vision-work\runs\task-9c2-baseline\predictions.json`
- Environment/provenance snapshot: `.vision-work\runs\task-9c2-baseline\environment.json`

Overlay legend: green GT bbox/tip, yellow predicted bbox, cyan A1 point/error line, magenta B2 point/error line. Manual inspection confirmed all 17 validation frames are represented and the overlays agree with the metric behavior.

## Interpretation

Task 9C-2 establishes that ROI conditioning is promising and that detector localization quality is currently the main loss between oracle and real pipeline. It does not justify final architecture selection, tracking work, test-set access, or external evaluation. The next evidence should improve or replace B0 under the same train/validation discipline, then rerun B2 before unsealing session 004.
