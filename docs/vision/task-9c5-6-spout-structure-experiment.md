# Task 9C-5.6 — Spout Structure Experiment

Date: 2026-09-28  
Status: **FAIL — explicit structure is informative but not robust enough**

## Question and protocol

This experiment compared three formulations under the same frozen Balanced manual-dripper search crop:

- **A1 Tip-only:** Task 9C-5.5 coarse tip → 65%-of-search-width local tip refinement.
- **A2 Neck-first:** spout bbox → bbox-derived local tip crop → local tip head → geometry consistency.
- **A3 Joint Neck+Tip:** one shared-feature head predicts presence, bbox, and tip → geometry consistency.

Evaluation used seven leave-one-session-out folds over sessions 001, 002, 003, 004, 011, 012, and 013. Each held-out session was excluded from training and checkpoint selection. Session-014 and sessions 005–010 were not accessed.

A1 reuses the frozen Task 9C-5.5 predictions. A2 and A3 use the same frozen MobileNetV3-small feature extractor, augmentations, search crop, 80 fixed epochs, and 0.50 confidence thresholds.

## Structure contracts

### Neck-first

1. Predict `gooseneck_spout` inside the manual search crop.
2. Accept structure when bbox confidence ≥ 0.50 and decoded bbox width/height are each at least 2 px.
3. Construct the tip crop by padding the predicted bbox 30% on every side and clamping it to the manual search region.
4. Accept the local tip when confidence ≥ 0.50.
5. Require the predicted tip to lie inside the predicted bbox padded by 10% for consistency.

If the bbox is rejected, the end-to-end tip is a miss. During positive local-head training only, the authoritative visible spout bbox padded by 30% supplies a stable crop; negatives use the detector proposal.

### Joint Neck+Tip

The joint head shares the same frozen search-crop feature tensor and produces one presence confidence, four bbox coordinates, and two tip coordinates. Training loss is binary presence loss plus equally weighted bbox and tip Smooth-L1 coordinate losses. Final acceptance requires confidence ≥ 0.50, a valid bbox, and the tip inside the same 10%-padded consistency bbox.

For both structure variants, the bbox target and IoU reference are the authoritative `gooseneck_spout` rectangle intersected with the visible manual search crop. Runtime acceptance never uses ground-truth IoU.

## Implementation audit

The first run exposed a tooling bug before interpretation: a reused keypoint helper intentionally wrote zero bbox targets, causing zero-area predictions. The structure example builder was corrected to encode the authoritative bbox through each crop/augmentation geometry, a regression test was added, and all seven folds were rerun from the fixed seed. Only the corrected rerun is reported below. Generated JSON was also made strict by avoiding non-finite candidate scores.

## Per-session comparison

### Locate rate and negative FPR

| Session | Tip-only locate / FPR | Neck-first locate / FPR | Joint locate / FPR |
|---|---:|---:|---:|
| 001 | 94.7% / 0.0% | 84.2% / 0.0% | 89.5% / 0.0% |
| 002 | 100% / 0.0% | 100% / 0.0% | 100% / 0.0% |
| 003 | 100% / 0.0% | 83.3% / 0.0% | 100% / 0.0% |
| 004 | 92.9% / 0.0% | 28.6% / 0.0% | 42.9% / 0.0% |
| 011 | 94.7% / 40.0% | 73.7% / 13.3% | 94.7% / 80.0% |
| 012 | 65.0% / 37.5% | 45.0% / 12.5% | 100% / 62.5% |
| 013 | 0.0% / 0.0% | 8.7% / 0.0% | 21.7% / 0.0% |

Neck-first materially reduces false presence in 011 and 012, but loses too many positives. Joint raises recall in 012/013 but converts structure into a permissive, self-consistent false-positive path in 011/012.

### Normalized tip error: median / P90 / max

Coordinate summaries are conditional on accepted predictions. Very small accepted counts are not evidence of robust recovery.

| Session | Tip-only | Neck-first | Joint Neck+Tip |
|---|---:|---:|---:|
| 001 | 0.099 / 0.160 / 0.161 | 0.250 / 0.672 / 0.686 | 0.151 / 0.356 / 0.379 |
| 002 | 0.059 / 0.160 / 0.163 | 0.193 / 0.503 / 0.528 | 0.202 / 0.468 / 0.620 |
| 003 | 0.101 / 0.207 / 0.300 | 0.221 / 0.340 / 0.479 | 0.138 / 0.432 / 0.501 |
| 004 | 0.186 / 0.986 / 1.261 | 0.377 / 1.538 / 1.538 | 0.373 / 1.543 / 1.543 |
| 011 | 0.175 / 0.391 / 1.335 | 0.259 / 0.361 / 0.405 | 0.498 / 0.889 / 1.477 |
| 012 | 0.230 / 0.636 / 0.736 | 0.197 / 0.873 / 0.873 | 0.480 / 0.740 / 0.870 |
| 013 | — | 0.130 / 0.146 / 0.146 (2 tips) | 0.359 / 0.624 / 0.624 (5 tips) |

Neck-first gives a cleaner conditional tail on 011, but the cascade's structure misses dominate end-to-end recall. Neither structure formulation reduces the session-004 tail.

## Spout structure metrics

“Accepted” is positive bbox confidence/validity recall. IoU recall uses the annotated visible bbox intersected with the manual search crop.

### Neck-first bbox

| Session | Accepted structure | Recall IoU≥0.30 | Recall IoU≥0.50 | Accepted IoU median | GT tip inside 10%-padded predicted bbox |
|---|---:|---:|---:|---:|---:|
| 001 | 94.7% | 84.2% | 78.9% | 0.620 | 55.6% |
| 002 | 100% | 66.7% | 26.7% | 0.390 | 100% |
| 003 | 100% | 91.7% | 83.3% | 0.724 | 50.0% |
| 004 | 28.6% | 21.4% | 21.4% | 0.600 | 75.0% |
| 011 | 100% | 26.3% | 0.0% | 0.179 | 57.9% |
| 012 | 50.0% | 0.0% | 0.0% | 0.108 | 70.0% |
| 013 | 8.7% | 0.0% | 0.0% | 0.110 | 100% |

### Joint bbox

| Session | Accepted structure | Recall IoU≥0.30 | Recall IoU≥0.50 | Accepted IoU median | GT tip inside 10%-padded predicted bbox |
|---|---:|---:|---:|---:|---:|
| 001 | 94.7% | 89.5% | 84.2% | 0.720 | 44.4% |
| 002 | 100% | 80.0% | 40.0% | 0.459 | 93.3% |
| 003 | 100% | 83.3% | 41.7% | 0.480 | 91.7% |
| 004 | 42.9% | 35.7% | 14.3% | 0.437 | 66.7% |
| 011 | 94.7% | 0.0% | 0.0% | 0.056 | 27.8% |
| 012 | 100% | 0.0% | 0.0% | 0.054 | 60.0% |
| 013 | 21.7% | 0.0% | 0.0% | 0.096 | 100% |

The joint formulation often predicts a bbox and tip that agree with each other but not with the annotated spout. Geometric self-consistency therefore cannot substitute for semantic correctness. This is most visible in 011/012: accepted structure is high while IoU≥0.30 is zero and false presence rises.

## Presence evidence

| Session | Tip-only recall / specificity | Neck-first recall / specificity | Joint recall / specificity |
|---|---:|---:|---:|
| 001 | 94.7% / 100% | 84.2% / 100% | 89.5% / 100% |
| 002 | 100% / 100% | 100% / 100% | 100% / 100% |
| 003 | 100% / 100% | 83.3% / 100% | 100% / 100% |
| 004 | 92.9% / 100% | 28.6% / 100% | 42.9% / 100% |
| 011 | 94.7% / 60.0% | 73.7% / 86.7% | 94.7% / 20.0% |
| 012 | 65.0% / 62.5% | 45.0% / 87.5% | 100% / 37.5% |
| 013 | 0.0% / 100% | 8.7% / 100% | 21.7% / 100% |

No formulation makes presence usable across all sessions. Neck-first trades recall for specificity. Joint trades specificity for recall and does not provide a valid calibrated structure signal.

## Required difficult-session analysis

### Session-004

- Tip-only remains best: 92.9% locate versus 28.6% Neck-first and 42.9% Joint.
- Neck-first rejects 10/14 positives at the bbox stage; Joint rejects 8/14.
- Dark reflective spout, water/reflection overlap, and edge orientation remain the dominant appearance problem.
- Conditional structure-aware P90 worsens to about 1.54. Explicit bbox supervision neither reduces nor explains away the tail; it adds structure acquisition failure.

### Session-011

- Neck-first reduces false positives from 6/15 to 2/15 and caps accepted-error max at 0.405, but locate drops from 94.7% to 73.7%.
- All 19 positive bboxes are accepted, yet only 26.3% reach IoU 0.30 and none reach IoU 0.50. Most are coarse/wrong structures.
- Five positives are then rejected by the local tip confidence head.
- Joint retains 94.7% positive recall but marks 12/15 negatives present; 13/18 accepted positive bboxes have IoU below 0.10.
- Kettle body, hand, metal reflection, water, and authoritative negatives containing outlet-like visual evidence remain confusing.

### Session-012

- Neck-first reduces false positives from 3/8 to 1/8, but accepts structure on only 10/20 positives and final locate falls to 45%.
- None of the accepted Neck-first or Joint bboxes reaches IoU 0.30. This is principally a spout-structure localization failure, not merely a tip-head failure.
- Joint accepts all positives but also 5/8 negatives; its median bbox IoU is 0.054.
- Right-edge truncation, bright white spout, strong highlights, text overlays, and scale variation remain dominant.

### Session-013

- Tip-only remains at 0%. Neck-first locates 2/23 (8.7%); Joint locates 5/23 (21.7%).
- Neither structure formulation produces a single IoU≥0.30 bbox.
- Conditional Neck-first errors are low only because two easy accepted examples survive; 21/23 fail at bbox presence.
- Joint shows limited presence recovery but bboxes are wrong/coarse and overall recall remains catastrophic.
- White spout against light filter, water/highlight, low local contrast, and source-specific appearance remain unresolved.

## Decision

### Which formulation is best?

- **Best overall current formulation: Tip-only.** It preserves strong 001–004/011 behavior and has fewer aggregate trade-offs, although it still completely fails session-013 and has high 011/012 FPR.
- **Best structure-aware candidate under the predeclared worst-session selection rule: Joint Neck+Tip.** Its worst difficult-session locate is 21.7%, versus 8.7% for Neck-first. It is nevertheless rejected because its bboxes are semantically wrong and its 011/012 false-positive behavior is worse.
- **Best false-positive suppressor: Neck-first.** It reduces 011 FPR by 26.7 points and 012 by 25 points, but at an unacceptable recall cost.

Explicit structure helps diagnose and sometimes suppress false presence, but this minimal bbox formulation does not improve overall cross-session robustness. The remaining bottleneck is still semantic representation, not dripper/search geometry or a missing consistency rule.

It does not adequately help white/low-contrast spouts: session-013 improves only to 21.7% with Joint and every accepted bbox remains below IoU 0.30.

## Gate

The best structure-aware candidate fails because:

- 004 and 013 remain below the 50% catastrophic-collapse floor;
- 013 does not show meaningful recovery;
- Joint worsens FPR by 40 points on 011 and 25 points on 012 relative to Tip-only;
- 004 tail error is worse, not reduced;
- presence recall/specificity remain session-dependent and unusable.

Final gate: **FAIL**. Session-014 remains sealed. No ONNX was exported.

## Recommended next experiment

Use a combination of:

1. **Separate presence and localization:** train presence explicitly with hard negatives, including kettle body, hand, reflective metal, water-only, and outlet-like structures. Do not make bbox regression the presence gate.
2. **Heatmap localization:** replace direct coordinate regression with a spatial heatmap/soft-argmax formulation for the outlet, optionally conditioned on a separately learned spout feature map.
3. **Targeted data expansion:** add manually reviewed white/low-contrast spouts, reflective dark spouts, edge truncation, and paired positive/negative frames from the same scene.

A stronger structural model may follow, but another small direct-regression bbox head is not justified by this result. Do not attempt to repair these failures with confidence-threshold tuning alone.

## Artifacts

- metrics: `.vision-work/runs/task-9c5-6/results.json`
- predictions: `.vision-work/runs/task-9c5-6/predictions.json`
- LOSO checkpoints: `.vision-work/checkpoints/task-9c5-6/loso/`

All generated artifacts remain gitignored.

## Quality gates

- Python vision tests: PASS — 38/38 across 9 test files, including 5 Task 9C-5.6 tests.
- Repository tests: PASS — 734/734.
- Lint: PASS.
- Typecheck: PASS.
- Build: PASS.
- `git diff --check`: PASS.
