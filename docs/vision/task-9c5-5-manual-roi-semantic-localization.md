# Task 9C-5.5 — Manual ROI Semantic Localization

Date: 2026-09-28  
Status: **FAIL — do not proceed to tracking or session-014**

## Experiment contract

This experiment used authoritative annotated development sessions 001, 002, 003, 004, 011, 012, and 013. Stored annotation dripper geometry was used only as a proxy for future user calibration; no dripper detector was run. Session-014 and external benchmark sessions 005–010 were not accessed.

All 122 positive frames have calibration geometry. Fifteen of 69 negative frames do not, so they were not given invented or cross-frame geometry. The manual-ROI LOSO experiment therefore used 176/191 frames: 122 positives and 54 negatives. Full-frame baselines retain their prior complete 191-frame evaluation, so negative-FPR denominators differ and are printed per fold in the generated results.

Frozen primary candidate:

- Balanced Task 9C-5.4 search preset
- frozen ImageNet MobileNetV3-small feature extractor
- search-region coarse keypoint head
- local refinement head
- global/local confidence threshold: 0.50
- local ROI side: 65% of the clipped search-region width
- local ROI constrained to the manual search region
- positive local jitter: translation up to 30% of side, scale 0.85–1.15
- fixed 80 epochs; held-out session not used for training or checkpoint selection
- seven-fold leave-one-session-out evaluation

## Search-region geometry

Every positive tip is inside both frozen presets. However, the theoretical regions are much larger than the available image around close-up drippers. “Excessive clipping” means less than 80% of the theoretical region remains after image-boundary clamping.

### Balanced

| Session | Eligible / total | Missing calibration | Tip containment | Retained area mean / median | Excessive clipping |
|---|---:|---:|---:|---:|---:|
| 001 | 26 / 27 | 1 negative | 100% | 0.495 / 0.496 | 100% |
| 002 | 20 / 22 | 2 negatives | 100% | 0.425 / 0.427 | 100% |
| 003 | 17 / 17 | 0 | 100% | 0.492 / 0.492 | 100% |
| 004 | 20 / 22 | 2 negatives | 100% | 0.511 / 0.509 | 100% |
| 011 | 34 / 34 | 0 | 100% | 0.768 / 0.783 | 100% |
| 012 | 28 / 30 | 2 negatives | 100% | 0.599 / 0.420 | 64.3% |
| 013 | 31 / 39 | 8 negatives | 100% | 0.311 / 0.293 | 100% |

### Wide-entry

| Session | Tip containment | Retained area mean / median | Excessive clipping |
|---|---:|---:|---:|
| 001 | 100% | 0.381 / 0.382 | 100% |
| 002 | 100% | 0.330 / 0.331 | 100% |
| 003 | 100% | 0.380 / 0.380 | 100% |
| 004 | 100% | 0.397 / 0.395 | 100% |
| 011 | 100% | 0.646 / 0.659 | 100% |
| 012 | 100% | 0.487 / 0.322 | 100% |
| 013 | 100% | 0.242 / 0.229 | 100% |

Wide-entry preserves no additional annotated tips and increases clipping. Balanced remains the better of the two frozen presets, but it fails the predeclared clipping gate on every session. Because actual positive containment is 100%, clipping is a setup/policy mismatch rather than the cause of the observed positive semantic collapses.

## Baseline comparison

`A` is full-frame keypoint, `B` is the previous full-frame Global→Local candidate, `C` is manual-ROI coarse, and `D` is manual-ROI coarse→local refinement.

### Locate rate

| Session | A full frame | B full Global→Local | C manual coarse | D manual refined |
|---|---:|---:|---:|---:|
| 001 | 94.7% | 94.7% | 94.7% | 94.7% |
| 002 | 100% | 100% | 100% | 100% |
| 003 | 100% | 100% | 100% | 100% |
| 004 | 100% | 64.3% | 92.9% | 92.9% |
| 011 | 36.8% | 36.8% | 94.7% | 94.7% |
| 012 | 20.0% | 20.0% | 65.0% | 65.0% |
| 013 | 4.3% | 4.3% | 0.0% | 0.0% |

Manual ROI recovers 004 and 011 acquisition and substantially improves 012, but it does not generalize to session-013.

## Manual-ROI coarse localization

Errors are Euclidean source-pixel error divided by manual dripper effective radius.

| Session | Locate | Mean | Median | P90 | Max | Negative FPR |
|---|---:|---:|---:|---:|---:|---:|
| 001 | 94.7% | 0.191 | 0.151 | 0.371 | 0.504 | 0.0% |
| 002 | 100% | 0.208 | 0.165 | 0.393 | 0.449 | 0.0% |
| 003 | 100% | 0.150 | 0.125 | 0.258 | 0.486 | 0.0% |
| 004 | 92.9% | 0.497 | 0.443 | 1.092 | 1.194 | 0.0% |
| 011 | 94.7% | 0.351 | 0.251 | 0.888 | 1.447 | 40.0% |
| 012 | 65.0% | 0.574 | 0.534 | 0.981 | 1.057 | 50.0% |
| 013 | 0.0% | — | — | — | — | 12.5% |

## Manual-ROI refined localization

| Session | Locate | Local ROI containment | Mean | Median | P90 | Max | Negative FPR |
|---|---:|---:|---:|---:|---:|---:|---:|
| 001 | 94.7% | 100% | 0.102 | 0.099 | 0.160 | 0.161 | 0.0% |
| 002 | 100% | 100% | 0.072 | 0.059 | 0.160 | 0.163 | 0.0% |
| 003 | 100% | 100% | 0.116 | 0.101 | 0.207 | 0.300 | 0.0% |
| 004 | 92.9% | 100% | 0.348 | 0.186 | 0.986 | 1.261 | 0.0% |
| 011 | 94.7% | 100% | 0.252 | 0.175 | 0.391 | 1.335 | 40.0% |
| 012 | 65.0% | 80.0% | 0.282 | 0.230 | 0.636 | 0.736 | 37.5% |
| 013 | 0.0% | 95.7% | — | — | — | — | 0.0% |

The local head is effective when the coarse stage produces a usable center. Session-013 demonstrates the limiting case: 100% search-region containment and 95.7% local-ROI containment, but all 23 positives are rejected by the coarse confidence gate. Geometry is available; semantic confidence collapses.

## Presence evidence

Joint presence requires coarse confidence ≥ 0.50 and local confidence ≥ 0.50.

| Session | Positive recall | Negative specificity | False present | False absent |
|---|---:|---:|---:|---:|
| 001 | 94.7% | 100% | 0 | 1 |
| 002 | 100% | 100% | 0 | 0 |
| 003 | 100% | 100% | 0 | 0 |
| 004 | 92.9% | 100% | 0 | 1 |
| 011 | 94.7% | 60.0% | 6 | 1 |
| 012 | 65.0% | 62.5% | 3 | 7 |
| 013 | 0.0% | 100% | 0 | 23 |
| Pooled | 73.0% | 83.3% | 9 | 33 |

Presence evidence is not usable across sessions. Manual cropping changes the error from primarily false absence in full-frame acquisition to a mix of session-specific false absence and false presence.

## Recovery assessment

- **011:** refined locate improves from 36.8% to 94.7%, median error from 0.242 to 0.175. This is real positive recovery, but negative FPR rises from 6.7% to 40.0%; it fails presence specificity.
- **012:** refined locate improves from 20.0% to 65.0%, median error from 1.228 to 0.230. It remains below the 70% locate gate, local containment is only 80%, and negative FPR is 37.5%.
- **013:** refined locate changes from 4.3% to 0%. All positives are inside the search region, but coarse positive confidence is below 0.50 for every frame. No recovery.
- **004:** refined locate improves from 64.3% to 92.9% and median is 0.186, but P90 remains 0.986 due confident localization errors on reflective dark-spout frames.

## Failure analysis: geometry versus semantics

| Session | Gate result | Dominant classification | Evidence |
|---|---|---|---|
| 001 | FAIL | geometry-policy QA only | 100% tip containment and strong semantics, but only ~49.5% of the oversized theoretical search region remains |
| 002 | FAIL | geometry-policy QA only | 100% containment and 100% locate; search rectangle is substantially outside the close crop |
| 003 | FAIL | geometry-policy QA only | 100% containment/locate; retained search area ~49.2% |
| 004 | FAIL | semantic localization tail | local ROI contains every tip, yet reflective dark spout/water frames produce confident large errors; P90 0.986 |
| 011 | FAIL | false presence / visibility-contract ambiguity | kettle body, hand, reflective metal, and apparent outlet-like structures in authoritative negatives produce six joint false positives; one inspected negative visibly resembles an active spout and remains authoritative for this run |
| 012 | FAIL | mixed semantic acquisition and local geometry | right-edge/truncated bright outlets, overlays, reflections, and scale changes cause seven misses; four accepted/missed positives have local containment failures and three negatives become false present |
| 013 | FAIL | coarse semantic domain collapse | white spout, white/light filter, water/highlight and low local contrast; coarse confidence is near zero despite 100% manual search containment |

The overall bottleneck is **semantics**, with an additional search-policy clipping issue. Manual calibration successfully removes tip exclusion as the explanation: both presets contain 100% of annotated positive tips. It does not solve appearance-conditioned confidence, false presence, or precise outlet semantics.

## Gate decision

The predeclared gate required, per session: search containment ≥ 95%, excessive clipping ≤ 20%, refined locate ≥ 70%, normalized median ≤ 0.25, P90 ≤ 0.60, negative FPR ≤ 10%, presence recall ≥ 70%, specificity ≥ 90%, plus at least +20 percentage-point locate improvement on 011–013.

The candidate fails because:

- every session fails the clipping guidance gate under the Balanced preset except that 012 still fails on 64.3% of frames;
- 012 remains below the locate gate and has high false presence;
- 013 has total coarse semantic collapse and is 4.3 points worse than the previous candidate;
- 004 retains a severe error tail;
- 011 and 012 presence specificity is unusable.

Therefore:

- catastrophic cross-session collapse: **yes**
- best tested candidate: Balanced manual search ROI → coarse → 65%-of-search-width local refinement, threshold 0.50
- candidate accepted: **no**
- proceed to tracking: **no**
- session-014 opening gate: **FAIL**
- ONNX export: **no**

## Artifacts

- metrics: `.vision-work/runs/task-9c5-5/results.json`
- predictions: `.vision-work/runs/task-9c5-5/predictions.json`
- LOSO checkpoints: `.vision-work/checkpoints/task-9c5-5/loso/`

No model or data artifact is intended for source control.

## Quality gates

- Python vision tests: PASS, 33/33 across eight test files
- repository tests: PASS, 734/734
- lint: PASS
- typecheck: PASS
- build: PASS
- `git diff --check`: PASS
- ONNX validation: not run because the semantic gate failed and no ONNX was exported
