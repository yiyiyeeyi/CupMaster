# Task 9C-5.10 — Multi-scale Centerline + Endpoint-on-Curve Pilot

## Outcome

**Gate: FAIL. Do not expand centerline annotation and do not reconnect tracking.**

Multi-scale features explain a meaningful part of the short- and side-edge failure: short-visible recall rises from 0.167 to 0.583 at 56×56 and 0.667 at 112×112, while edge-truncated recall rises from zero to 0.357 and 0.429. Resolution alone does not produce that recovery.

The gains do not generalize across the required sessions. The primary multi-scale/high-resolution candidate lowers session-013 recall from 0.667 to 0.333, lowers session-004 from 0.100 to zero, and reduces session-012 specificity from 1.000 to 0.375. Top-edge and reflective-spout recall remain zero. The success gate therefore fails despite the subgroup improvements.

Session-014 remains sealed. External benchmark sessions 005–010 were not accessed.

## Frozen data and protocol

- Positives: the 62 human-reviewed Task 9C-5.9 centerlines.
- Negatives: the same 54 calibrated negatives.
- Annotation source: `.vision-work/datasets/task-9c5-9/annotations/centerline-pilot-v0.training-ready.json`.
- Input: frozen Balanced manual-dripper search region, letterboxed to 224×224.
- Backbone: frozen torchvision MobileNetV3-large ImageNet-1K V2.
- Evaluation: seven-fold leave-one-session-out over 001, 002, 003, 004, 011, 012 and 013.
- Training: fixed 60 epochs and final-epoch checkpoint; no result-driven early stopping, threshold tuning or checkpoint reselection.
- Presence and line thresholds: 0.50.
- Line tolerance: 0.10 effective dripper radius.
- Usable endpoint error: at most 0.50 effective dripper radius.

## Formulations

### A — Frozen Task 9C-5.9 baseline

- Final backbone feature only: 960×7×7.
- Output: 56×56.
- Soft-tube sigma: 1.5 heatmap pixels.
- Centerline-only head and dripper-relative extremity decoder are reused without retraining or retuning.

### B — High-resolution

- Final 960×7×7 feature only.
- Four compact transposed-convolution stages produce 112×112.
- Soft-tube sigma: 3.0 heatmap pixels, exactly twice the 56×56 sigma so target width is equivalent in 224-input coordinates.
- Head parameters: 110,963.

### C — Multi-scale

- Intermediate feature: MobileNetV3-large block 6, 40×28×28.
- Final feature: 960×7×7, projected and bilinearly resized to 28×28.
- Intermediate and final projections are concatenated and fused by one 3×3 convolution.
- One upsampling stage produces 56×56.
- Soft-tube sigma: 1.5.
- Head parameters: 151,427.

### D — Multi-scale + high-resolution

- Same minimal 28×28 skip fusion as C.
- Two upsampling stages produce 112×112.
- Soft-tube sigma: 3.0.
- Head parameters: 159,603.

Source coordinates are first transformed through the exact crop, letterbox and optional augmentation geometry into normalized 224-input coordinates, then multiplied by `heatmapSize - 1`. No source-coordinate rounding occurs before rasterization.

## Endpoint-on-curve objective

Candidates B–D predict centerline logits and endpoint logits. The spatial endpoint logits used by the loss and decoder are:

`endpointRaw + log(sigmoid(centerlineLogits))`

This differentiable gate penalizes endpoint probability where predicted curve support is weak. Endpoint spatial cross-entropy is positive-only and uses a Gaussian centered on ordered polyline point 0. Negatives never invent an endpoint target. This replaces the fully independent Task 9C-5.9 Joint tip heatmap as the primary endpoint formulation.

## Runtime and memory impact

Values are CPU head-only measurements; the common frozen backbone is excluded.

| Candidate | Head ms | Estimated head FPS | Dense output bytes/sample | Retained feature bytes/sample |
|---|---:|---:|---:|---:|
| B: high-res 112 | 3.95 | 253.5 | 150,528 | 188,160 |
| C: multi-scale 56 | 4.06 | 246.5 | 37,632 | 313,600 |
| D: multi-scale 112 | 4.64 | 215.7 | 150,528 | 313,600 |

Moving from 56 to 112 quadruples each dense map's memory. Keeping the 28×28 intermediate feature adds 125,440 bytes per sample over final-feature-only inference.

## Structural presence

Each cell is held-out positive recall / negative specificity.

| Session | A: baseline 56 | B: high-res 112 | C: multi-scale 56 | D: multi-scale 112 |
|---|---:|---:|---:|---:|
| 001 | 0.833 / 1.000 | 0.833 / 0.714 | 1.000 / 1.000 | 0.667 / 1.000 |
| 002 | 0.500 / 1.000 | 0.833 / 1.000 | 0.667 / 1.000 | 0.667 / 1.000 |
| 003 | 0.833 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 0.833 / 1.000 |
| 004 | 0.100 / 1.000 | 0.100 / 1.000 | 0.100 / 1.000 | 0.000 / 1.000 |
| 011 | 0.700 / 0.933 | 0.500 / 0.933 | 0.800 / 0.933 | 0.600 / 0.933 |
| 012 | 0.417 / 1.000 | 0.333 / 0.875 | 0.833 / 0.000 | 1.000 / 0.375 |
| 013 | 0.667 / 1.000 | 0.583 / 1.000 | 0.083 / 1.000 | 0.333 / 1.000 |

The high session-012 recall of C/D is paired with 8/8 and 5/8 false-present negatives respectively. It is not a valid recovery.

## Centerline geometry by held-out session

Metrics are GT coverage / prediction precision / symmetric normalized distance. The frozen tolerance is 0.10 effective radius.

| Session | A | B | C | D |
|---|---:|---:|---:|---:|
| 001 | 0.719 / 0.617 / 0.053 | 0.675 / 0.559 / 0.068 | 0.968 / 0.873 / 0.030 | 0.998 / 0.800 / 0.032 |
| 002 | 0.725 / 0.725 / 0.041 | 0.527 / 0.667 / 0.088 | 0.807 / 0.751 / 0.027 | 0.955 / 0.933 / 0.029 |
| 003 | 0.848 / 0.788 / 0.058 | 0.839 / 0.658 / 0.069 | 0.938 / 0.864 / 0.040 | 0.874 / 0.913 / 0.049 |
| 004 | 0.368 / 0.174 / 0.306 | 0.325 / 0.219 / 0.297 | 0.505 / 0.599 / 0.161 | 0.637 / 0.479 / 0.142 |
| 011 | 0.299 / 0.387 / 0.228 | 0.179 / 0.288 / 0.225 | 0.252 / 0.762 / 0.270 | 0.229 / 0.562 / 0.279 |
| 012 | 0.253 / 0.207 / 0.138 | 0.172 / 0.107 / 0.176 | 0.576 / 0.513 / 0.102 | 0.468 / 0.409 / 0.743 |
| 013 | 0.358 / 0.483 / 0.178 | 0.312 / 0.516 / 0.163 | 0.116 / 0.284 / 0.187 | 0.173 / 0.518 / 0.208 |

Some rejected session-004 predictions have geometrically better heatmaps, but the frozen presence gate rejects them. Conversely, D's accepted session-012 output includes semantically false-present negatives and a large symmetric-distance tail. Dense geometry quality alone cannot substitute for presence generalization.

## Endpoint-on-curve by held-out session

Rows report usable rate, normalized mean / median / P90 / max, endpoint-to-predicted-centerline mean distance, and correct GT endpoint-side rate.

| Session | Candidate | Usable | Error mean / median / P90 / max | Curve distance | Correct side |
|---|---|---:|---:|---:|---:|
| 001 | B | 0.833 | 0.115 / 0.122 / 0.150 / 0.150 | 0.024 | 1.000 |
| 001 | C | 1.000 | 0.073 / 0.058 / 0.184 / 0.184 | 0.000 | 1.000 |
| 001 | D | 0.667 | 0.070 / 0.052 / 0.184 / 0.184 | 0.000 | 1.000 |
| 002 | B | 0.833 | 0.631 / 0.171 / 2.894 / 2.894 | 0.303 | 1.000 |
| 002 | C | 0.667 | 0.082 / 0.073 / 0.203 / 0.203 | 0.000 | 1.000 |
| 002 | D | 0.667 | 0.048 / 0.050 / 0.066 / 0.066 | 0.059 | 1.000 |
| 003 | B | 1.000 | 0.128 / 0.122 / 0.210 / 0.210 | 0.271 | 1.000 |
| 003 | C | 1.000 | 0.082 / 0.085 / 0.120 / 0.120 | 0.082 | 1.000 |
| 003 | D | 0.833 | 0.054 / 0.060 / 0.079 / 0.079 | 0.046 | 1.000 |
| 004 | B | 0.000 | 1.026 / 1.011 / 2.105 / 2.362 | 0.112 | 0.300 |
| 004 | C | 0.000 | 0.874 / 0.953 / 1.573 / 2.347 | 0.244 | 0.400 |
| 004 | D | 0.000 | 0.531 / 0.323 / 0.725 / 2.257 | 0.026 | 0.600 |
| 011 | B | 0.500 | 0.198 / 0.167 / 0.266 / 0.643 | 0.232 | 1.000 |
| 011 | C | 0.800 | 0.105 / 0.099 / 0.124 / 0.217 | 0.220 | 1.000 |
| 011 | D | 0.500 | 0.178 / 0.090 / 0.165 / 1.035 | 0.074 | 0.900 |
| 012 | B | 0.167 | 1.113 / 0.982 / 1.945 / 2.743 | 0.568 | 0.667 |
| 012 | C | 0.667 | 0.536 / 0.200 / 1.378 / 1.906 | 0.284 | 0.917 |
| 012 | D | 0.667 | 0.561 / 0.195 / 1.334 / 2.352 | 0.603 | 0.917 |
| 013 | B | 0.583 | 0.219 / 0.212 / 0.390 / 0.425 | 0.147 | 0.917 |
| 013 | C | 0.083 | 0.250 / 0.115 / 0.715 / 1.100 | 0.396 | 0.917 |
| 013 | D | 0.333 | 0.123 / 0.089 / 0.274 / 0.362 | 0.516 | 1.000 |

Compared with the independent Task 9C-5.9 Joint tip head, D substantially reduces conditional error on 004 and 012 and achieves correct-side rates of 0.600 and 0.917. However, usable endpoint rate remains zero on 004, D loses presence recall on 013, and soft curve gating does not guarantee proximity to the thresholded centerline on 012/013. Endpoint-on-curve is therefore mixed rather than a complete solution.

## Length and domain analysis

Length strata use tertiles of the 62 GT visible lengths normalized by effective dripper radius:

- short: ≤ 0.9238
- medium: > 0.9238 and ≤ 1.6875
- long: > 1.6875

| Group | Count | A recall | B recall | C recall | D recall |
|---|---:|---:|---:|---:|---:|
| Length-short | 21 | 0.190 | 0.190 | 0.429 | 0.429 |
| Length-medium | 21 | 0.619 | 0.619 | 0.476 | 0.429 |
| Length-long | 20 | 0.850 | 0.800 | 0.850 | 0.850 |
| Tagged short-visible | 12 | 0.167 | 0.083 | 0.583 | 0.667 |
| Edge truncated | 14 | 0.000 | 0.000 | 0.357 | 0.429 |
| Top-edge truncated | 4 | 0.000 | 0.000 | 0.000 | 0.000 |
| Side-edge truncated | 10 | 0.000 | 0.000 | 0.500 | 0.600 |
| Reflective spout | 10 | 0.100 | 0.100 | 0.100 | 0.000 |
| White spout | 24 | 0.542 | 0.458 | 0.458 | 0.667 |
| Low contrast | 12 | 0.667 | 0.583 | 0.083 | 0.333 |
| Water overlap | 33 | 0.485 | 0.394 | 0.394 | 0.485 |

The architecture specifically helps side-edge and tagged short-visible cases. It does not recover top-edge or reflective examples, and it trades away the prior low-contrast session-013 recovery.

## Success gate

1. Preserve/improve session-013 recovery: **FAIL** — best new recall is 0.583; D is 0.333 versus baseline 0.667.
2. Materially improve session-004 over 0.100: **FAIL** — B/C remain 0.100; D is zero.
3. Improve tagged short-visible recall over 0.167: **PASS** — C 0.583, D 0.667.
4. Make edge-truncated recall meaningfully non-zero: **PARTIAL PASS** — side-edge recovers, top-edge remains zero.
5. Avoid catastrophic specificity loss: **FAIL** — C/D specificity on session-012 is 0.000/0.375.
6. Endpoint-on-curve at least as stable as independent tip: **MIXED** — conditional localization improves on key folds, but usable rate remains presence-limited and curve consistency is weak on 012/013.

Overall: **FAIL**.

## Decision

- Baseline 56×56: preserves the strongest session-013 low-contrast result and specificity, but fails short/edge/reflective cases.
- High-res 112×112: resolution alone does not explain or fix the failures.
- Multi-scale 56×56: improves short and side-edge structure, but catastrophically false-presents session-012 and collapses session-013.
- Multi-scale + high-res: best short/side-edge recall and white-spout aggregate, but fails 004/013 and specificity.
- Endpoint-on-curve: **mixed**; useful endpoint ordering signal, not sufficient semantic presence control.
- Does spatial resolution explain a meaningful part of failure? **Partial.** It adds a small gain only when combined with multi-scale features.
- Does multi-scale representation help? **Partial.** It recovers fine/edge structure but destabilizes domain semantics.
- Expand centerline annotation to the full development pool: **No.**
- Need targeted data: **Yes.** Exact missing cases are dark reflective top-edge positives, short white/highlight right-edge positives, matched water-on/off examples, and same-scene negatives that resemble shaft/rim/reflection. Top-edge and reflective cases are highest priority.
- Need stronger backbone: **No as the immediate isolated next step.** The existing intermediate feature contains useful fine structure; the dominant evidence now points to cross-domain calibration/data plus presence regularization.
- Next experiment: targeted critical-case expansion only, with explicit same-scene negatives and a presence objective protected from dense-structure overfitting. Preserve the curve-gated endpoint analysis, but do not reconnect tracking.
- Proceed to tracking: **No.**
- Open session-014: **No.**

## Technical note

All 21 folds completed and their checkpoints were saved. The initial final-summary step then hit a reporting-only schema mismatch: new records use `endpoint`, while the frozen Task 9C-5.9 baseline uses `tip`. No model behavior was affected. The compatibility reader was tested, and results were regenerated from the original 21 checkpoints without retraining or changing any model setting.

## Artifacts

- Results: `.vision-work/runs/task-9c5-10/results.json`
- Predictions: `.vision-work/eval/task-9c5-10/predictions.json`
- Checkpoints: `.vision-work/checkpoints/task-9c5-10/<candidate>/loso/<session>/head.pt`

All model and evaluation artifacts remain under `.vision-work` and are gitignored. No ONNX export was created.

## Quality gates

- Fixed protocol folds: PASS — 21/21 checkpoints and evaluations.
- Python vision tests: PASS — 71/71 across 15 test files.
- Repository tests: PASS — 734/734 across 45 files.
- Lint: PASS.
- Typecheck: PASS.
- Build: PASS.
- `git diff --check`: PASS.
