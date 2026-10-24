# Task 9C-5.13 — Targeted Spout / Tip Retraining

## Outcome

Targeted repair data produced a **partial** cross-domain improvement, but the
result is not stable enough to connect to tracking. It reduced the overall
unusable-observation rate from 46.6% to 41.8% and nearly doubled the medium
quality share from 9.6% to 17.8%. It did not improve the high-quality share,
materially regressed parts of sessions 001–004, and increased targeted
hard-negative false presence from 16.7% to 25.0%.

Decision: **MORE_DATA**. Retain the fixed manual-calibration / Balanced-search
formulation for diagnosis, but do not treat the present model as ready for
tracking replay or precise radial coaching.

## Safety and provenance

- Development sessions: 001, 002, 003, 004, 011, 012, 013, 015, 016, 017,
  018, and 019.
- Targeted repair sessions: 015–019, user-confirmed training eligible.
- Session 014 was not accessed.
- External-reference sessions 005–010 were not accessed.
- Private inputs, checkpoints, predictions, and evaluation outputs remain
  below `.vision-work`; none are committed or uploaded.
- No runtime, UI, trajectory-engine, Task 9D, tracking, ONNX, water-stream, or
  impact-point change was made.

## Data integrity

The authoritative combined annotation pool contains 242 unique frames: 146
positive and 96 negative. The frozen Balanced manual search region requires
dripper geometry, leaving 224 eligible observations: 146 positive and 78
negative. The 18 excluded observations are negatives without dripper geometry;
they were not relabelled or silently used with inferred geometry.

| Pool | Total | Positive | Negative |
|---|---:|---:|---:|
| Existing 001–004, 011–013, all annotations | 191 | 122 | 69 |
| Targeted 015–019, all annotations | 51 | 24 | 27 |
| Combined complete pool | 242 | 146 | 96 |
| Existing manual-ROI eligible | 176 | 122 | 54 |
| Targeted manual-ROI eligible | 48 | 24 | 24 |
| Combined experiment pool | 224 | 146 | 78 |

Frame IDs and `(session, timestamp)` pairs are unique; images and annotations
match exactly. No forbidden session occurs in the pool. In each targeted LOSO
fold, the held-out session is excluded from both training and selection, so the
actual training count equals 224 minus that session's eligible counts.

## Fixed training configuration

- Frozen ImageNet-1K V2 MobileNetV3-large feature backbone, 960×7×7 output.
- Manual dripper calibration and frozen `Balanced` search region.
- Presence/tip head: independent BCE presence objective plus positive-only
  28×28 Gaussian heatmap objective, sigma 1.5 heatmap pixels, argmax decoder.
- Spout-region head: independent presence plus axis-aligned bbox, BCE plus
  `5 × SmoothL1`.
- Presence and region thresholds: 0.50, unchanged.
- Four fixed inputs per training observation: identity, horizontal flip,
  brightness 0.90, and contrast 1.10.
- AdamW and the established Task 9C-5.7 / 9C-5.8 learning rates, weight decay,
  batch size, and 80-epoch fixed-final-epoch selection.
- Baseline old-session results are the prior seven-fold LOSO results. One
  all-old model evaluates previously unseen sessions 015–019. Targeted results
  are twelve-fold leave-one-session-out over the combined pool.

No hyperparameter or threshold was selected from these held-out results.

## Per-session presence

Values are baseline → targeted. FPR is `1 - specificity`.

| Session | Pos / neg | Recall | Specificity | FPR |
|---|---:|---:|---:|---:|
| 001 | 19 / 7 | 100.0% → 100.0% | 71.4% → 57.1% | 28.6% → 42.9% |
| 002 | 15 / 5 | 86.7% → 86.7% | 100.0% → 100.0% | 0.0% → 0.0% |
| 003 | 12 / 5 | 100.0% → 91.7% | 20.0% → 40.0% | 80.0% → 60.0% |
| 004 | 14 / 6 | 14.3% → 21.4% | 100.0% → 100.0% | 0.0% → 0.0% |
| 011 | 19 / 15 | 78.9% → 78.9% | 86.7% → 80.0% | 13.3% → 20.0% |
| 012 | 20 / 8 | 100.0% → 90.0% | 0.0% → 37.5% | 100.0% → 62.5% |
| 013 | 23 / 8 | 73.9% → 82.6% | 87.5% → 100.0% | 12.5% → 0.0% |
| 015 | 7 / 1 | 0.0% → 28.6% | 100.0% → 100.0% | 0.0% → 0.0% |
| 016 | 3 / 8 | 66.7% → 100.0% | 75.0% → 37.5% | 25.0% → 62.5% |
| 017 | 3 / 6 | 66.7% → 66.7% | 100.0% → 100.0% | 0.0% → 0.0% |
| 018 | 7 / 4 | 100.0% → 100.0% | 50.0% → 75.0% | 50.0% → 25.0% |
| 019 | 4 / 5 | 25.0% → 0.0% | 100.0% → 100.0% | 0.0% → 0.0% |

Presence remains a primary bottleneck. The improvement on 013 and 018 is real,
but failure on 004, 015, and 019 and the 016 specificity collapse prevent a
generalization claim.

## Per-session spout-region recognition

Targeted IoU statistics are conditional on accepted positive detections;
IoU-threshold recalls use every positive as denominator. Mean IoU is shown as
baseline → targeted.

| Session | Recall baseline → targeted | Mean IoU baseline → targeted | Target IoU ≥ .30 | Target IoU ≥ .50 |
|---|---:|---:|---:|---:|
| 001 | 100.0% → 89.5% | .644 → .370 | 68.4% | 5.3% |
| 002 | 100.0% → 100.0% | .392 → .352 | 60.0% | 26.7% |
| 003 | 91.7% → 91.7% | .809 → .672 | 91.7% | 91.7% |
| 004 | 92.9% → 64.3% | .506 → .293 | 35.7% | 0.0% |
| 011 | 89.5% → 89.5% | .153 → .381 | 63.2% | 26.3% |
| 012 | 100.0% → 80.0% | .022 → .040 | 0.0% | 0.0% |
| 013 | 4.3% → 21.7% | .000 → .014 | 0.0% | 0.0% |
| 015 | 14.3% → 42.9% | .000 → .183 | 14.3% | 0.0% |
| 016 | 100.0% → 100.0% | .146 → .218 | 0.0% | 0.0% |
| 017 | 100.0% → 100.0% | .022 → .200 | 0.0% | 0.0% |
| 018 | 100.0% → 100.0% | .136 → .268 | 28.6% | 0.0% |
| 019 | 100.0% → 100.0% | .316 → .293 | 25.0% | 25.0% |

The bbox head often recognizes that a spout-like structure exists without
producing useful overlap. It is therefore not a reliable runtime prerequisite;
forcing tip localization behind this region gate would discard valid semantic
observations, especially in 012, 013, and 015–018.

## Per-session tip localization

All errors are normalized by the annotated dripper effective radius. Mean is
shown as baseline → targeted. The five threshold columns use every positive as
denominator and require presence acceptance; a presence miss therefore cannot
be counted as successful localization.

| Session | Mean baseline → target | Target median / P90 / max | ≤.02 | ≤.04 | ≤.06 | ≤.10 | ≤.20 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 001 | .111 → .121 | .094 / .236 / .327 | 5.3% | 10.5% | 31.6% | 52.6% | 84.2% |
| 002 | .121 → .414 | .060 / 2.244 / 2.968 | 0.0% | 0.0% | 46.7% | 60.0% | 80.0% |
| 003 | .101 → .068 | .063 / .121 / .153 | 16.7% | 25.0% | 41.7% | 75.0% | 91.7% |
| 004 | .354 → .723 | .565 / 1.570 / 1.604 | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |
| 011 | .268 → .149 | .104 / .258 / .674 | 5.3% | 15.8% | 15.8% | 47.4% | 68.4% |
| 012 | .608 → .289 | .199 / .488 / 1.805 | 0.0% | 5.0% | 20.0% | 20.0% | 45.0% |
| 013 | .149 → .150 | .111 / .330 / .440 | 0.0% | 8.7% | 8.7% | 39.1% | 65.2% |
| 015 | .712 → .322 | .296 / .625 / .625 | 0.0% | 0.0% | 0.0% | 0.0% | 14.3% |
| 016 | .664 → .144 | .125 / .257 / .257 | 0.0% | 0.0% | 33.3% | 33.3% | 66.7% |
| 017 | .427 → .356 | .432 / .524 / .524 | 0.0% | 0.0% | 0.0% | 0.0% | 33.3% |
| 018 | .265 → .140 | .111 / .296 / .296 | 0.0% | 28.6% | 28.6% | 42.9% | 71.4% |
| 019 | .120 → .107 | .103 / .143 / .143 | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |

Session 019's raw heatmap coordinates are moderately close, but its 0% presence
recall makes every observation unavailable under the required conservative
presence policy. This is why localization validity is not derived from heatmap
confidence alone.

## Product quality buckets

| Bucket | Baseline | Targeted |
|---|---:|---:|
| High: ≤ .02R | 4 / 146 (2.7%) | 4 / 146 (2.7%) |
| Medium: > .02R and ≤ .06R | 14 / 146 (9.6%) | 26 / 146 (17.8%) |
| Low: > .06R and ≤ .20R | 60 / 146 (41.1%) | 55 / 146 (37.7%) |
| Unusable: > .20R or unavailable | 68 / 146 (46.6%) | 61 / 146 (41.8%) |

The targeted model provides more potentially useful direction/circular-motion
observations, but only 20.5% of all positives reach ≤.06R. It is not adequate
for precise radial coaching. Broad motion direction may be recoverable only
after conservative presence and quality gating are improved.

## Descriptive domain results

Selection hints are descriptive metadata, not ground truth, and groups overlap.

| Domain | Positives | Presence baseline → target | Mean tip error baseline → target | Unusable baseline → target |
|---|---:|---:|---:|---:|
| Dark / reflective | 14 | 21.4% → 35.7% | .533R → .222R | 78.6% → 78.6% |
| White / highlight | 10 | 90.0% → 90.0% | .314R → .205R | 60.0% → 40.0% |
| Low contrast | 16 | 43.8% → 50.0% | .465R → .258R | 75.0% → 75.0% |
| Short visible | 18 | 66.7% → 66.7% | .347R → .170R | 61.1% → 55.6% |
| Water on | 24 | 50.0% → 58.3% | .441R → .215R | 70.8% → 62.5% |

Targeted data improves localization error in every listed domain, especially
dark/reflective and short-visible cases. Presence gains are much smaller, which
keeps their usable rate low.

### Hard negatives

Among the 24 metadata-tagged targeted negatives, false presence rose from
4/24 (16.7%) to 6/24 (25.0%). Overlapping tag breakdown:

| Hint | Count | Baseline FPR | Targeted FPR |
|---|---:|---:|---:|
| Hand | 7 | 0.0% | 0.0% |
| Kettle body | 5 | 20.0% | 60.0% |
| Shaft | 5 | 20.0% | 60.0% |
| Rim | 14 | 21.4% | 21.4% |
| Wet bed | 16 | 18.8% | 18.8% |
| Foam | 12 | 25.0% | 33.3% |
| Reflection | 18 | 16.7% | 22.2% |

This is safety-significant: targeted positives improved localization, but the
presence head learned more kettle-body/shaft-like false evidence. UNKNOWN is
preferable to emitting these confident fake trajectory points.

## Comparison answers

1. **Sessions 011–013:** partial repair. Macro tip mean improved from .341R to
   .196R and specificity from 58.1% to 72.5%. Session 013 presence and region
   recall recovered, but bbox overlap stayed unusable; session 012 FPR remains
   62.5%.
2. **White/highlight:** localization improved (.314R → .205R; unusable 60% →
   40%), while presence recall stayed at 90%.
3. **Reflective/dark:** localization improved greatly (.533R → .222R), but
   presence recall only reached 35.7% and unusable share stayed 78.6%.
4. **Short-visible:** mean error improved (.347R → .170R), but presence recall
   did not improve and 55.6% remain unusable.
5. **Hard negatives:** no; aggregate FPR worsened from 16.7% to 25.0%.
6. **Sessions 001–004:** yes, material regression. Macro presence is flat and
   specificity slightly higher, but region recall fell 96.1% → 86.4% and macro
   tip mean worsened .172R → .332R. Sessions 002 and 004 developed severe
   localization tails.
7. **Coarse trajectory coaching:** partial only. Some accepted observations can
   support broad direction, but presence misses/false presence and 41.8%
   unusable observations prevent a reliable trajectory stream.
8. **Primary bottleneck:** mixed, led by domain-general presence plus
   localization tails. The two failure modes must remain independently gated.
9. **Runtime bbox necessity:** the bbox is useful offline evidence, but the
   present bbox head is not reliable enough to gate runtime tip localization.
   Direct heatmap localization inside the calibrated search region remains the
   better diagnostic path, with conservative presence/uncertainty handling.

## Recommendation

**MORE_DATA**, narrowly targeted rather than broad collection:

- matched positive/negative kettle-body and shaft scenes in the same setup;
- more independent dark/reflective outlet-visible positives, especially the
  session-004/015 appearance family;
- independent session-019-like water-off/light-spout positives;
- hard negative variants with foam/reflection while keeping camera, dripper,
  and lighting fixed.

Do not start tracking replay until a session-aware rerun removes the 004/019
presence collapse, reduces the 016/012 false-positive problem, and avoids the
001–004 localization regression. Session 014 remains sealed.

## Reproducibility and private artifacts

- Script: `scripts/vision/task9c5-13-targeted-retraining.py`
- Focused tests: `scripts/vision/task9c5-13-targeted-retraining.test.py`
- Checkpoints: `.vision-work/models/task-9c5-13/` (26 files)
- Metrics: `.vision-work/eval/task-9c5-13/results.json`
- Predictions: `.vision-work/eval/task-9c5-13/predictions.json`

These generated artifact paths are intentionally gitignored and private.
