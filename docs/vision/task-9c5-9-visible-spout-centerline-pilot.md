# Task 9C-5.9 — Visible Spout Centerline Pilot

## Outcome

**Pilot result: mixed / do not expand centerline annotation yet.**

The corrected 62-image CVAT export passes exact identity, cardinality, endpoint-order and geometry QA. The centerline representation recovers the previously collapsed white/low-contrast session-013 much better than the bbox baseline, but it catastrophically loses reflective/dark session-004 and remains weak on short, edge-truncated session-012 cases. Adding a separate tip heatmap does not make the behavior consistently better and often harms the critical folds.

This is evidence that the visible-centerline concept carries useful structure, but this pilot formulation is not stable enough to justify annotating the full 191-frame development pool. Tracking remains disconnected. Session-014 stays sealed; sessions 005–010 were not accessed.

## Data and annotation QA

Dataset: `cupmaster-spout-centerline-pilot-v0`

| Session | Positive centerlines | Calibrated negatives used for presence |
|---|---:|---:|
| session-001 | 6 | 7 |
| session-002 | 6 | 5 |
| session-003 | 6 | 5 |
| session-004 | 10 | 6 |
| session-011 | 10 | 15 |
| session-012 | 12 | 8 |
| session-013 | 12 | 8 |
| **Total** | **62** | **54** |

The positives prioritize 34 prior Task 9C-5.8 failures, 33 water-overlap frames, 24 white-spout frames, 20 dark-spout frames, 14 edge-truncated frames, 12 low-contrast frames and 12 short-visible-segment frames. Negatives come from the same authoritative development sessions and have manual dripper calibration; unannotated positive frames are excluded rather than treated as negatives.

Source export: `.vision-work/datasets/task-9c5-9/exports/cvat-centerline-pilot-v0.zip`

Annotation format: CVAT for images 1.1, one ordered `gooseneck_spout_centerline` polyline per positive. Point 0 is the physical outlet and subsequent points run toward the visible kettle-side tube.

| QA check | Result |
|---|---:|
| CVAT image records | 62 |
| Exact manifest matches | 62/62 |
| Exact-label polylines | 62/62 |
| Missing / unknown / duplicate images | 0 / 0 / 0 |
| Wrong labels or shape types | 0 |
| Out-of-bounds / zero-length / duplicate-point shapes | 0 |
| Self-intersections / pathological jumps | 0 |
| Reversed endpoint suspects | 0 |
| Implausible point-0 suspects | 0 |
| Manual review items | 0 |

Point 0 is compared with the authoritative tip using effective dripper radius `sqrt(radiusX * radiusY)`. Point-0 disagreement spans 0.0020–0.0853 effective radii, with median 0.0211. No point order was silently reversed.

Training-ready merge:

`.vision-work/datasets/task-9c5-9/annotations/centerline-pilot-v0.training-ready.json`

QA details:

`.vision-work/datasets/task-9c5-9/annotations/centerline-pilot-v0.qa.json`

## Frozen representation and protocol

- Input: frozen Task 9C-5.4/5.5 Balanced manual-dripper search region, letterboxed to 224×224.
- Backbone: torchvision MobileNetV3-large ImageNet-1K V2 features, frozen; 2,971,952 feature parameters.
- Output resolution: 56×56.
- Centerline target: Euclidean distance to the ordered polyline, rasterized as `exp(-distance² / (2 * 1.5²))`; sigma is 1.5 heatmap pixels.
- Tip target: separate normalized 2D Gaussian, sigma 1.5 heatmap pixels.
- Centerline-only head: 143,730 parameters.
- Centerline+Tip head: 143,747 parameters.
- Presence: independent BCE head, fixed acceptance threshold 0.50.
- Centerline mask: fixed sigmoid threshold 0.50; largest 8-connected component used for geometry.
- Centerline loss: positive soft Dice plus weighted BCE; negative BCE suppression.
- Tip loss: positive-only spatial cross-entropy; absent from Centerline-only.
- Evaluation: seven-fold leave-one-session-out. The held-out session is excluded from training and checkpoint selection.
- Checkpoint: fixed final epoch after 60 epochs; no result-driven reruns or threshold tuning.
- Line tolerance: 0.10 effective dripper radius.
- Usable tip: normalized error ≤ 0.50.

The Centerline-only tip diagnostic selects the endpoint of the predicted component closest to the manually calibrated dripper center. This is an analysis decoder, not a learned tip head or a production proposal.

## Per-session recognition comparison

The bbox baseline is the frozen Task 9C-5.8 MobileNetV3-large prediction restricted to the same 62 pilot positives and the same eligible negatives. `Recall / specificity` is shown.

| Held-out session | BBox-only | Centerline-only | Centerline+Tip |
|---|---:|---:|---:|
| 001 | 1.000 / 1.000 | 0.833 / 1.000 | 0.833 / 0.857 |
| 002 | 1.000 / 1.000 | 0.500 / 1.000 | 0.667 / 1.000 |
| 003 | 0.833 / 1.000 | 0.833 / 1.000 | 1.000 / 1.000 |
| 004 | 0.900 / 1.000 | 0.100 / 1.000 | 0.100 / 1.000 |
| 011 | 0.800 / 1.000 | 0.700 / 0.933 | 0.700 / 0.933 |
| 012 | 1.000 / 0.375 | 0.417 / 1.000 | 0.417 / 0.750 |
| 013 | 0.083 / 0.875 | 0.667 / 1.000 | 0.500 / 1.000 |

Centerline supervision changes the error tradeoff rather than uniformly improving recognition. It strongly suppresses session-012 false presence but loses most true positives. It produces a real session-013 recovery, yet destroys the otherwise strong session-004 recall.

## Centerline geometry

Values are means over held-out positives. Symmetric distance is normalized by effective dripper radius; coverage and precision use the frozen 0.10-radius tolerance.

| Session | Formulation | Symmetric distance ↓ | GT coverage ↑ | Predicted precision ↑ | Largest-component fraction ↑ |
|---|---|---:|---:|---:|---:|
| 004 | Centerline-only | 0.306 | 0.368 | 0.174 | 0.896 |
| 004 | Centerline+Tip | 0.250 | 0.383 | 0.315 | 0.884 |
| 011 | Centerline-only | 0.228 | 0.299 | 0.387 | 0.792 |
| 011 | Centerline+Tip | 0.182 | 0.333 | 0.385 | 0.800 |
| 012 | Centerline-only | 0.138 | 0.253 | 0.207 | 0.391 |
| 012 | Centerline+Tip | 0.190 | 0.130 | 0.155 | 0.366 |
| 013 | Centerline-only | 0.178 | 0.358 | 0.483 | 0.862 |
| 013 | Centerline+Tip | 0.144 | 0.201 | 0.365 | 0.583 |

High component fraction alone is not proof of semantic correctness: session-004 predictions are often coherent but misplaced. Session-012 has both low coverage and fragmented structure. Session-013 Centerline-only is the clearest positive result, with coherent predictions and meaningful recognition recovery.

## Tip localization

Normalized held-out errors are shown as mean / median / P90 / max, followed by overall usable locate rate. The direct-tip baseline is Task 9C-5.7 MobileNetV3-large on the same pilot positives.

| Session | Formulation | Normalized error | Usable locate rate |
|---|---|---:|---:|
| 004 | Direct tip | 0.420 mean | 0.200 |
| 004 | Centerline-only endpoint | 0.780 / 0.814 / 1.878 / 1.878 | 0.000 |
| 004 | Centerline+Tip | 1.386 / 1.821 / 1.991 / 2.303 | 0.000 |
| 011 | Direct tip | 0.349 mean | 0.600 |
| 011 | Centerline-only endpoint | 0.426 / 0.442 / 0.975 / 0.975 | 0.500 |
| 011 | Centerline+Tip | 0.191 / 0.204 / 0.273 / 0.343 | 0.700 |
| 012 | Direct tip | 0.701 mean | 0.667 |
| 012 | Centerline-only endpoint | 0.411 / 0.464 / 0.730 / 0.730 | 0.250 |
| 012 | Centerline+Tip | 1.197 / 1.293 / 1.949 / 2.551 | 0.167 |
| 013 | Direct tip | 0.147 mean | 0.667 |
| 013 | Centerline-only endpoint | 0.199 / 0.169 / 0.330 / 0.400 | 0.667 |
| 013 | Centerline+Tip | 0.215 / 0.228 / 0.325 / 0.379 | 0.500 |

The Joint tip is close to its predicted line on sessions 011 and 013 (mean 0.073 and 0.086 radii), but grossly inconsistent on 004 and 012 (1.851 and 1.104 radii). Near-predicted-endpoint rates are only 0.20 for 011, 0.083 for 012, 0.333 for 013 and zero for 004. A separate tip heatmap therefore does not yet exploit the ordered-curve endpoint reliably.

## Critical diagnostics

### Session-004

Centerline presence recall collapses from the bbox baseline's 0.900 to 0.100 for both new formulations. Reflective-spout frames have 0.100 recall; edge-truncated frames have 0.000 Centerline-only recall. Water/reflection and top-edge truncation remain dominant. Structure supervision does not help this domain.

### Session-011

Both structure variants reach 0.700 recall and 0.933 specificity. Joint tip localization improves over direct coordinates (0.191 versus 0.349 mean normalized error), but line coverage remains only 0.333. This is a partial positive result, not enough to offset the critical-fold failures.

### Session-012

Centerline-only eliminates bbox baseline false positives on the included negatives (specificity 1.000 versus 0.375), but recall falls from 1.000 to 0.417. Short-visible-segment recall across the pilot is only 0.167, and edge-truncated Centerline-only recall is 0.000. Joint tip error worsens to 1.197 mean. The white/highlight tube is not robustly recovered and structural evidence does not improve the endpoint.

### Session-013

Centerline-only raises presence recall from the bbox baseline's 0.083 to 0.667 while retaining 1.000 specificity. Low-contrast recall is 0.667, mean line precision is 0.483 and line-derived tip usable rate is 0.667. This is meaningful white/low-contrast recovery, but the Joint model reduces recall to 0.500 and does not improve tip localization.

### Domain aggregates

- Short visible segments: Centerline-only recall 0.167; Joint 0.167.
- Edge truncation: Centerline-only recall 0.000; Joint 0.071.
- Reflective spout: both 0.100 recall.
- White spout: Centerline-only 0.542; Joint 0.458.
- Low contrast: Centerline-only 0.667; Joint 0.500.
- Water overlap: Centerline-only 0.485; Joint 0.455.

## Decision

- BBox baseline: strongest on 001/002/004, but false-positive-prone on 012 and collapsed on 013.
- Centerline-only: best pilot formulation because it recovers 013 and suppresses 012 false positives, but its 004 and short/edge failures are disqualifying.
- Centerline+Tip: improves session-011 tip localization, but is worse or no better on the critical 004/012/013 aggregate.
- Does centerline improve standalone spout recognition? **Mixed.** Strong 013 recovery, material 012 specificity gain, catastrophic 004 recall loss.
- Does centerline improve tip localization? **No overall.** Only session-011 improves; 004/012 worsen and 013 is not better than direct tip.
- Does short visible spout remain recognizable? **No.** Recall is 0.167.
- Does white/low-contrast spout recover? **Partial.** Session-013 recovers; white/highlight session-012 does not.
- Primary remaining bottleneck: **mixed representation and targeted-data coverage**, especially reflective/top-edge, short white/highlight and boundary-truncated structures. The larger backbone is already in use, so capacity alone is not the first explanation.
- Expand centerline annotation to the full development pool: **No.**
- Need stronger backbone: **Not yet as an isolated change.** First resolve short/truncated target representation and add compact targeted coverage; a later controlled backbone comparison may follow.
- Need additional targeted data: **Yes.** Add only dark reflective/top-edge positives like session-004, white/highlight short and right-edge positives like session-012, matched water-on/off variants, and same-scene negatives. Preserve centerlines that terminate at image boundaries.
- Recommended next experiment: retain Centerline-only as an analysis branch, test a multi-scale/high-resolution line head plus explicit endpoint-on-curve objective on the targeted critical cases. Do not annotate all 191 frames first.
- Proceed to tracking: **No.**
- Open session-014: **No.**

## Artifacts

- Results: `.vision-work/runs/task-9c5-9/results.json`
- Predictions: `.vision-work/eval/task-9c5-9/predictions.json`
- Checkpoints: `.vision-work/checkpoints/task-9c5-9/{centerline_only,centerline_tip}/loso/<session>/head.pt`
- Normalized annotations: `.vision-work/datasets/task-9c5-9/annotations/centerline-pilot-v0.training-ready.json`
- Annotation QA: `.vision-work/datasets/task-9c5-9/annotations/centerline-pilot-v0.qa.json`

All generated data, model and evaluation artifacts remain under `.vision-work` and are gitignored. No ONNX model was exported.

## Quality gates

- Annotation QA: PASS — 62/62.
- Training/evaluation execution: PASS — 14/14 fixed-protocol folds completed.
- Python vision tests: PASS — 65/65 across 14 test files.
- Repository tests: PASS — 734/734 across 45 files.
- Lint: PASS.
- Typecheck: PASS.
- Build: PASS.
- `git diff --check`: PASS.
