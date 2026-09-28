# Task 9C-5.3 — Targeted Annotation Normalize + Cross-Session Retraining

Date: 2026-09-28  
Branch: `feature/camera-brew-runtime`  
Research status: **cross-session gate failed; session-014 remains sealed**

## Scope and data discipline

This research round used development sessions 001–004 and external research sessions 011–013. Sessions 011–013 remain `sourceType = external_reference`, `researchTrainingEligible = true`, and `productionTrainingEligible = false`. Session-014 was not opened, decoded, extracted, annotated, or inferred. External benchmark sessions 005–010 were not accessed. No production runtime was changed.

The resulting development pool contains 191 frames: 122 positives and 69 intentional negatives. Evaluation used seven leave-one-session-out folds. In each fold the held-out session was excluded from training and checkpoint selection. Both heads used a fixed final epoch (80), rather than choosing an epoch from held-out results.

Frozen candidate configuration:

- architecture: full-frame global coarse keypoint → local refinement keypoint
- backbone: frozen ImageNet MobileNetV3-small features
- global/local confidence threshold: 0.50
- local ROI: square, 65% of image width, centered on the global prediction and clamped to image bounds
- positive ROI augmentation: translation up to 30% of side and scale 0.85–1.15
- image augmentation: identity, horizontal flip, brightness 0.90, contrast 1.10
- primary target: `spout_tip`; `gooseneck_spout` is analysis geometry and `dripper` is normalization geometry

## VIA normalization

All 103 VIA records matched the annotation-package manifest by exact filename/frame identity. VIA ellipse and circle geometry normalize to `centerX`, `centerY`, `radiusX`, `radiusY`, and `effectiveRadius = sqrt(radiusX * radiusY)`. A partially visible ellipse may extend beyond an image edge, but its center, positive radii, and intersection with the image must be valid. Positive rectangles and points remain strictly inside image bounds.

The source export had seven records with 15 blank or shape-incompatible label fields. These were mechanically reconcilable because every accepted role has a unique VIA shape: rectangle → `gooseneck_spout`, point → `spout_tip`, and circle/ellipse → `dripper`. The normalized artifact records every repair with frame ID, original label, shape, normalized label, and reason; the original VIA file was not edited. Affected frames were `session-011-t085000`, `session-011-t091000`, `session-011-t113000`, `session-012-t033000`, `session-013-t042000`, `session-013-t072000`, and `session-013-t075000`.

| Session | Total | Positive | Negative | Dripper | Bbox | Tip |
|---|---:|---:|---:|---:|---:|---:|
| 011 | 34 | 19 | 15 | 34 (100.0%) | 19/19 | 19/19 |
| 012 | 30 | 20 | 10 | 28 (93.3%) | 20/20 | 20/20 |
| 013 | 39 | 23 | 16 | 31 (79.5%) | 23/23 | 23/23 |

Validation result: **PASS**. There are no unmatched records, duplicate frame identities, duplicate shapes, partial positives, invalid target coordinates, or unsupported labels after the explicit normalization audit. The normalized artifact is `.vision-work/datasets/task-9c5-3/annotations/task-9c5-3-targeted-v1.normalized.json`.

## Cross-session results

Errors are Euclidean tip error divided by dripper effective radius. Locate rate uses the frozen 0.50 confidence threshold. FPR is measured on intentional negatives.

### Global stage

| Held-out session | Pos / neg | Locate | Norm mean | Median | P90 | Max | Negative FPR |
|---|---:|---:|---:|---:|---:|---:|---:|
| 001 | 19 / 8 | 94.7% | 0.449 | 0.390 | 0.782 | 0.824 | 0.0% |
| 002 | 15 / 7 | 100.0% | 0.437 | 0.392 | 0.771 | 0.909 | 0.0% |
| 003 | 12 / 5 | 100.0% | 0.240 | 0.244 | 0.314 | 0.413 | 0.0% |
| 004 | 14 / 8 | 100.0% | 0.534 | 0.449 | 0.951 | 0.998 | 0.0% |
| 011 | 19 / 15 | 36.8% | 0.692 | 0.545 | 1.855 | 1.855 | 6.7% |
| 012 | 20 / 10 | 20.0% | 1.210 | 1.251 | 1.522 | 1.522 | 0.0% |
| 013 | 23 / 16 | 4.3% | 0.689 | 0.689 | 0.689 | 0.689 | 6.3% |

### Global → Local

| Held-out session | Locate | ROI containment | Norm mean | Median | P90 | Max | Negative FPR |
|---|---:|---:|---:|---:|---:|---:|---:|
| 001 | 94.7% | 94.7% | 0.240 | 0.183 | 0.452 | 0.542 | 0.0% |
| 002 | 100.0% | 100.0% | 0.142 | 0.080 | 0.444 | 0.631 | 0.0% |
| 003 | 100.0% | 100.0% | 0.140 | 0.148 | 0.180 | 0.192 | 0.0% |
| 004 | 64.3% | 100.0% | 0.276 | 0.157 | 0.956 | 0.956 | 0.0% |
| 011 | 36.8% | 31.6% | 0.471 | 0.242 | 1.816 | 1.816 | 6.7% |
| 012 | 20.0% | 10.0% | 1.177 | 1.228 | 1.488 | 1.488 | 0.0% |
| 013 | 4.3% | 47.8% | 0.663 | 0.663 | 0.663 | 0.663 | 6.3% |

The local stage materially reduces central error on sessions 001–004 when it emits, but it cannot recover when the global center misses the target/domain. Sessions 011–013 therefore show catastrophic session-specific collapse despite being represented by the other two external-research sessions during each LOSO fold.

### Presence evidence

The joint rule is global confidence ≥ 0.50 **and** local confidence ≥ 0.50. Agreement distance was recorded as an audit distribution and was not converted into a tuned decision threshold.

| Held-out session | Recall | Specificity | False present | False absent |
|---|---:|---:|---:|---:|
| 001 | 94.7% | 100.0% | 0 | 1 |
| 002 | 100.0% | 100.0% | 0 | 0 |
| 003 | 100.0% | 100.0% | 0 | 0 |
| 004 | 64.3% | 100.0% | 0 | 5 |
| 011 | 36.8% | 93.3% | 1 | 12 |
| 012 | 20.0% | 100.0% | 0 | 16 |
| 013 | 4.3% | 93.8% | 1 | 22 |
| Pooled | 54.1% | 97.1% | 2 | 56 |

Specificity is strong, but positive evidence is unusable across the new domains. This does not justify reviving or training the independent Gate B classifier; the semantic acquisition problem must be addressed first.

## Session-004 recovery

Against the prior Task 9C-5.2 65% ROI LOSO result, session-004 did not recover:

| Metric | 9C-5.2 | Expanded 9C-5.3 |
|---|---:|---:|
| locate rate | 85.7% | 64.3% |
| ROI containment | 100.0% | 100.0% |
| normalized mean | 0.436 | 0.276 |
| normalized median | 0.352 | 0.157 |
| normalized P90 | 0.744 | 0.956 |
| normalized max | 1.055 | 0.956 |
| negative FPR | 0.0% | 0.0% |

Median and mean improved among accepted outputs, but recall fell by 21.4 points and tail error worsened. This is partial localization improvement, not recovery.

## Gate and decision

The predeclared per-session gate required: locate ≥ 80%, ROI containment ≥ 95%, normalized mean ≤ 0.30, median ≤ 0.20, P90 ≤ 0.45, negative FPR ≤ 10%, presence recall ≥ 80%, and specificity ≥ 90%. The candidate fails on session 001 P90/containment, session 004 locate/P90/presence recall, and multiple acquisition/localization/presence criteria on every new external-research session.

- known domain coverage in the annotated pool: **improved**
- cross-session robustness from that coverage: **not improved sufficiently**
- catastrophic collapse: **yes**, on sessions 011–013
- Global → Local still preferred: **only as the research direction**, not as a frozen holdout candidate
- keypoint-derived presence ready for temporal testing: **no**
- session-014 opening gate: **FAIL**
- selected all-development checkpoint: **none**
- ONNX export: **not performed because the cross-session gate failed**

The next research step should remain inside sessions 001–004 and 011–013: diagnose why the frozen feature/head setup treats each new source as a separate domain, then predeclare one constrained representation/training change and repeat LOSO. Session-014 must stay sealed until this gate passes.

## Artifacts and technical note

- normalized annotations: `.vision-work/datasets/task-9c5-3/annotations/task-9c5-3-targeted-v1.normalized.json`
- fold checkpoints: `.vision-work/checkpoints/task-9c5-3/loso/`
- metrics: `.vision-work/runs/task-9c5-3-targeted-retraining/results.json`
- predictions: `.vision-work/runs/task-9c5-3-targeted-retraining/predictions.json`

During the first run, an out-of-image negative prediction exposed a crop construction bug: the existing square ROI clamped edges but did not first clamp its center, allowing an inverted crop. The fix clamps only the predicted center to valid image bounds before applying the already-frozen 65% ROI. It does not alter thresholds, ROI size, architecture, labels, or state-machine behavior. A regression test covers the failure. The full seven-fold run was restarted from the fixed seed after the fix.

## Conclusions

1. Targeted domain expansion improved data coverage, but did not produce robust leave-one-session-out generalization.
2. Session-004 did not recover under the complete gate.
3. Sessions 011–013 all show catastrophic acquisition and presence-recall failures.
4. Global → Local remains the more coherent semantic architecture, but this trained candidate is rejected.
5. Keypoint-derived presence is not reliable enough for temporal testing.
6. Session-014 is not authorized to open from these results.

## Quality gates

- annotation validation: PASS, 103/103 exact matches
- normalization unit tests: PASS, 4/4
- Python vision tests: PASS, 29/29 across seven test files
- repository tests: PASS, 729/729
- lint: PASS
- typecheck: PASS
- build: PASS
- ONNX validation: not run because no model was exported after the research gate failed
