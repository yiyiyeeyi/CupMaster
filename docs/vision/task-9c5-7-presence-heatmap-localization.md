# Task 9C-5.7 — Separate Presence + Heatmap Tip Localization

## Decision

**Gate: FAIL. Do not open session-014 and do not reconnect tracking.**

Separating presence from localization is diagnostically effective, but the tested system is not sufficiently robust. The heatmap representation materially recovers localization on the white/low-contrast session-013 domain. The independent presence head remains unstable across domains: session-004 positive recall collapses and the stronger-backbone session-012 fold accepts every negative. The primary remaining bottleneck is mixed **presence representation plus targeted data coverage**, not manual dripper geometry.

No threshold was tuned after seeing a held-out fold. No ONNX was exported because the gate failed.

## Scope and data discipline

- Authoritative development sessions only: 001, 002, 003, 004, 011, 012, 013.
- Seven-fold leave-one-session-out (LOSO). Each held-out session is excluded from training and checkpoint selection.
- 176 frames with manual dripper calibration: 122 positives and 54 intentional negatives.
- Frozen manual dripper proxy and frozen `balanced` search crop from Tasks 9C-5.4/5.5.
- Presence threshold fixed at 0.50 before evaluation.
- Session-014 was not read, extracted, inspected, or inferred.
- External benchmark sessions 005–010 were not accessed.

## Formulation

### Shared input and backbone

The 224×224 letterboxed Balanced manual search crop is passed through a frozen ImageNet-pretrained MobileNetV3 feature extractor. A small trainable spatial adapter feeds two independent heads:

1. a binary presence head using spatial pooling and one logit;
2. a heatmap decoder using two 2× upsampling transposed convolutions and a 1-channel 28×28 output.

The heads share the adapter, but presence probability is not derived from heatmap confidence and localization validity is not derived from presence probability.

### Losses

- Presence: binary cross entropy with logits over positives and authoritative intentional negatives.
- Localization: spatial cross entropy against a normalized 2D Gaussian, evaluated on positive frames only.
- Negative localization loss: masked to exactly zero. Negatives never receive a fabricated coordinate.
- Gaussian target: 28×28, sigma 1.5 heatmap pixels, centered on the authoritative tip after source-to-letterbox mapping.
- Combined optimization loss: unweighted presence BCE plus positive-only localization cross entropy. Both components are recorded separately in checkpoint history.

### Decoding and metrics

- Primary decoder: heatmap argmax, mapped from heatmap coordinates to 224×224 input and then through the stored letterbox/crop transform to source coordinates.
- Secondary diagnostic: spatial soft-argmax.
- Heatmap `peak` below is the maximum spatial-softmax probability, not a presence probability.
- Normalized error: source-pixel Euclidean tip error divided by manual dripper `effectiveRadius = sqrt(radiusX × radiusY)`.
- `usable localization`: normalized error ≤0.50, fixed before evaluation.
- `overall usable locate`: presence accepted at 0.50 **and** localization usable. Localization errors are also reported independently across every true positive.
- AUROC and PR-AUC use raw independent presence probability. With these small per-session samples they are diagnostic, not threshold-selection inputs.

## MobileNetV3-small result

| Held-out | Presence recall | Specificity | Precision | AUROC | PR-AUC | Heatmap usable | Overall usable | Norm mean / median / P90 / max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 001 | 94.7% | 85.7% | 94.7% | .992 | .997 | 100% | 94.7% | .108 / .083 / .192 / .266 |
| 002 | 100% | 100% | 100% | 1.000 | 1.000 | 100% | 100% | .107 / .083 / .241 / .339 |
| 003 | 100% | 80.0% | 92.3% | 1.000 | 1.000 | 100% | 100% | .076 / .082 / .135 / .144 |
| 004 | 14.3% | 100% | 100% | 1.000 | 1.000 | 50.0% | 7.1% | 1.321 / 1.113 / 2.501 / 2.676 |
| 011 | 84.2% | 80.0% | 84.2% | .905 | .844 | 100% | 84.2% | .152 / .143 / .313 / .431 |
| 012 | 40.0% | 75.0% | 80.0% | .519 | .784 | 80.0% | 35.0% | .501 / .208 / 1.505 / 2.880 |
| 013 | 52.2% | 75.0% | 85.7% | .777 | .909 | 95.7% | 47.8% | .215 / .133 / .232 / 1.674 |

Argmax consistently outperformed soft-argmax in the critical small-backbone folds. Soft-argmax P90 was .835 on 004, .653 on 012, and .790 on 013; averaging diffuse or multimodal maps produced large errors on 012/013.

The small model fails the gate: session-004 and session-012 presence recall collapse, 004 localization tail regresses, and 013 presence remains only 52.2% despite strong heatmap localization.

## Controlled capacity check

Because the required MobileNetV3-small experiment failed, one stronger browser-compatible backbone was tested: official torchvision MobileNetV3-large ImageNet-1K V2. No other model was swept, and every data, loss, epoch, crop, decoder, and threshold setting remained fixed.

| Property | MobileNetV3-small | MobileNetV3-large |
|---|---:|---:|
| Frozen feature parameters | 927,008 | 2,971,952 |
| Trainable head parameters | 78,146 | 102,722 |
| Active total parameters | 1,005,154 | 3,074,674 |
| Feature resolution | 576×7×7 | 960×7×7 |
| Measured CPU forward, batch 1 | 12.09 ms | 24.04 ms |
| Estimated CPU throughput | 82.7 FPS | 41.6 FPS |

CPU figures are 30 warm-cache PyTorch forwards on this workstation and are comparative estimates, not browser benchmarks. Both architectures have established ONNX support, but Large approximately doubles this CPU cost and increases model-transfer/memory pressure. Quantization and actual ONNX Runtime Web profiling would be required before browser selection.

Source: official torchvision MobileNetV3 implementation and weights. Torchvision implementation is BSD-3-Clause; use of pretrained weight artifacts and their ImageNet provenance must also be reviewed for the intended distribution context.

### MobileNetV3-large LOSO metrics

| Held-out | Presence recall | Specificity | Precision | AUROC | PR-AUC | Heatmap usable | Overall usable | Norm mean / median / P90 / max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 001 | 100% | 71.4% | 90.5% | .985 | .995 | 100% | 100% | .111 / .115 / .188 / .366 |
| 002 | 86.7% | 100% | 100% | .987 | .996 | 100% | 86.7% | .121 / .095 / .193 / .330 |
| 003 | 100% | 20.0% | 75.0% | .983 | .994 | 100% | 100% | .101 / .081 / .161 / .319 |
| 004 | 14.3% | 100% | 100% | .988 | .995 | 85.7% | 14.3% | .354 / .149 / 1.221 / 1.648 |
| 011 | 78.9% | 86.7% | 88.2% | .951 | .958 | 94.7% | 78.9% | .268 / .184 / .404 / 1.847 |
| 012 | 100% | 0% | 71.4% | .325 | .706 | 75.0% | 75.0% | .608 / .377 / 1.304 / 2.398 |
| 013 | 73.9% | 87.5% | 94.4% | .886 | .956 | 100% | 73.9% | .149 / .136 / .255 / .339 |

Large confirms that capacity helps session-013 heatmap localization and presence, but does not solve presence robustness. Its session-012 specificity is 0%, and session-004 recall remains 14.3%.

## Comparison with direct coordinate and structure baselines

The new column uses MobileNetV3-large because it is the strongest result from this task. `New overall` requires independent presence plus normalized error ≤0.50. Earlier locate rates retain their original confidence/acceptance definitions, so this is an operational comparison rather than an identical metric.

| Session | 9C-5.5 Tip-only recall/spec | 9C-5.6 Joint recall/spec | New presence recall/spec | New heatmap usable | New overall usable |
|---|---:|---:|---:|---:|---:|
| 004 | 92.9% / 100% | 42.9% / 100% | 14.3% / 100% | 85.7% | 14.3% |
| 011 | 94.7% / 60.0% | 94.7% / 20.0% | 78.9% / 86.7% | 94.7% | 78.9% |
| 012 | 65.0% / 62.5% | 100% / 37.5% | 100% / 0% | 75.0% | 75.0% |
| 013 | 0% / 100% | 21.7% / 100% | 73.9% / 87.5% | 100% | 73.9% |

Compared with direct coordinate regression: **mixed**. The heatmap representation is decisively better on 013 and produces low central error on 001–003, but worsens the 004 argmax tail and still fails on part of 012. Presence/localization separation exposes the distinction that earlier coupled confidence hid: 013 localization is now good even where presence rejects the target, while 012 presence may be high even when localization is wrong.

## Critical-session analysis

### Session-004

- Large heatmap median is .149, but P90 is 1.221 and max is 1.648 versus Tip-only P90 .986 and max 1.261.
- Only 2/14 positives pass the independent 0.50 presence threshold even though AUROC is .988. This is cross-domain score calibration/representation shift, not permission to retune a threshold on held-out data.
- Reflective dark spout, water overlap, and edge presentation remain the dominant cases.
- Gate item 3 fails: the primary argmax tail is not materially reduced. Soft-argmax P90 .835 is lower, but cannot compensate for 14.3% presence recall and was not uniformly better elsewhere.

### Session-011

- Large presence specificity improves to 86.7% from Tip-only 60.0%; recall falls from 94.7% to 78.9%.
- False-present `session-011-t007000`: kettle body plus hand over the dripper; no identifiable outlet. Classified as **kettle-body/hand confusion**.
- False-present `session-011-t058000`: the authoritative record is negative, but visual review shows a clear black spout outlet and water stream. This is an **annotation-policy ambiguity**, not silently relabeled. It should receive an explicit policy review before future presence training/evaluation.

### Session-012

- Large gets 100% positive recall but 0% specificity: all 8 calibration-eligible negatives are false-present.
- `t005000`, `t009000`, `t010000`: hand-held grinder/distribution shaft over the filter; classified as **hand + shaft/tool confusion**.
- `t007000`: empty filter/coffee bed and background highlights; **dripper/filter/background reflection confusion**.
- `t018000`, `t019000`, `t050000`, `t052000`: no spout, with wet coffee bed, foam/water, filter rim and reflective server/background; **water/reflection/dripper confusion**.
- These remain authoritative negatives. No ambiguity comparable to 011-t058000 was observed in these eight frames.
- Although overall usable locate rises to 75%, accepting every negative is not meaningful recovery. Gate items 2 and 4 fail.

### Session-013 all-positive diagnostic

The stronger model is reported because it is the capacity diagnostic and strongest session-013 result. Categories use fixed diagnostics: error ≤.25 is `correctly concentrated`; otherwise peak <.003 is absent, normalized entropy ≥.80 is diffuse, and the remainder is concentrated on a wrong structure.

| Frame | Presence p | Heatmap peak | Argmax source (x,y) | Norm error | Diagnostic |
|---|---:|---:|---:|---:|---|
| session-013-t036000 | .082 | .0464 | (648.6, 359.6) | .060 | correctly concentrated near GT |
| session-013-t039000 | .020 | .0381 | (598.5, 154.4) | .075 | correctly concentrated near GT |
| session-013-t042000 | .181 | .0362 | (547.4, 154.6) | .072 | correctly concentrated near GT |
| session-013-t045000 | .830 | .0427 | (595.9, 256.3) | .046 | correctly concentrated near GT |
| session-013-t051000 | .573 | .0482 | (698.0, 355.4) | .255 | concentrated on wrong structure |
| session-013-t054000 | .770 | .0436 | (545.8, 462.3) | .112 | correctly concentrated near GT |
| session-013-t057000 | .209 | .0474 | (693.9, 458.3) | .216 | correctly concentrated near GT |
| session-013-t060000 | .437 | .0612 | (698.5, 355.7) | .334 | concentrated on wrong structure |
| session-013-t066000 | .989 | .0584 | (542.7, 612.9) | .183 | correctly concentrated near GT |
| session-013-t069000 | .962 | .0579 | (546.5, 603.6) | .154 | correctly concentrated near GT |
| session-013-t072000 | .870 | .0461 | (444.1, 253.9) | .212 | correctly concentrated near GT |
| session-013-t075000 | .986 | .0673 | (541.7, 504.1) | .045 | correctly concentrated near GT |
| session-013-t078000 | .754 | .0809 | (546.1, 452.3) | .141 | correctly concentrated near GT |
| session-013-t084000 | .988 | .0725 | (544.6, 512.6) | .110 | correctly concentrated near GT |
| session-013-t087000 | .533 | .0745 | (646.7, 304.4) | .111 | correctly concentrated near GT |
| session-013-t090000 | .999 | .0587 | (647.2, 253.9) | .136 | correctly concentrated near GT |
| session-013-t093000 | .951 | .0444 | (596.8, 452.7) | .339 | concentrated on wrong structure |
| session-013-t096000 | .794 | .0581 | (493.7, 359.1) | .108 | correctly concentrated near GT |
| session-013-t102000 | .802 | .0671 | (542.8, 505.2) | .141 | correctly concentrated near GT |
| session-013-t105000 | .972 | .0731 | (545.7, 496.7) | .132 | correctly concentrated near GT |
| session-013-t108000 | .837 | .0787 | (546.5, 452.7) | .168 | correctly concentrated near GT |
| session-013-t111000 | .908 | .0715 | (541.7, 453.7) | .133 | correctly concentrated near GT |
| session-013-t114000 | .473 | .0663 | (490.9, 453.3) | .142 | correctly concentrated near GT |

Heatmap localization no longer catastrophically collapses on session-013: 23/23 are within the .50 usable limit, with 20/23 within .25. Presence still rejects 6/23, especially early low-contrast cases at 36–42 seconds plus 57, 60, and 114 seconds. The representation has recovered spatial evidence more strongly than binary domain calibration.

## Success gate

| Requirement | Result |
|---|---|
| No session-013 catastrophic collapse | PASS for heatmap and operational locate with Large (73.9%) |
| 011/012 specificity improves without severe recall loss | FAIL: 011 improves, but 012 specificity is 0% |
| 004 high-error tail materially improves | FAIL for primary argmax; presence also collapses |
| 012 meaningful recovery | FAIL: positive recall rises only by accepting all negatives |
| Failures independently diagnosable | PASS |
| Suitable for later temporal tracking | FAIL |

Overall gate: **FAIL**.

## Recommended next work

Do not tune this held-out threshold and do not open session-014. Add a compact, manually reviewed targeted development tranche before the next architecture experiment:

1. paired same-scene negatives containing hand-held grinder/distribution shafts, kettle body without outlet, empty dripper/filter, wet bed/foam, water-only, server and metallic reflections;
2. dark reflective outlets overlapping a water stream and near an image edge, matching session-004 failure conditions;
3. white/low-contrast outlets at the early/top-edge presentations represented by session-013 36–42 s and 57–60 s;
4. explicit positive/negative policy adjudication for `session-011-t058000` and future frames where an identifiable outlet exists but the frame was intended as negative.

Then retest a presence formulation with stronger domain-robust spatial features while retaining heatmap localization. The capacity result does not justify adopting MobileNetV3-large yet: it helps 013 but merely moves the collapse to 012 and roughly doubles CPU cost.

## Artifacts

- Small results: `.vision-work/runs/task-9c5-7/mobilenet_v3_small/results.json`
- Small predictions: `.vision-work/eval/task-9c5-7/mobilenet_v3_small/predictions.json`
- Large results: `.vision-work/runs/task-9c5-7/mobilenet_v3_large/results.json`
- Large predictions: `.vision-work/eval/task-9c5-7/mobilenet_v3_large/predictions.json`
- LOSO checkpoints: `.vision-work/checkpoints/task-9c5-7/{mobilenet_v3_small,mobilenet_v3_large}/loso/`

All generated artifacts and downloaded weights remain under gitignored `.vision-work`.

## Quality gates

- Python vision tests: PASS — 43/43 across 10 test files.
- Repository tests: PASS — 734/734 across 45 files.
- Lint: PASS.
- Typecheck: PASS.
- Build: PASS.
- `git diff --check`: PASS.

The first repository-test invocation supplied Jest's unsupported `--runInBand` flag to Vitest and exited before running tests. It was immediately rerun with the repository's canonical `npm test` command, which passed 734/734. This was a command-line invocation error, not a product or test failure.
