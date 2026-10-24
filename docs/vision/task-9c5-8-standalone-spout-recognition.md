# Task 9C-5.8 — Standalone Gooseneck-Spout Recognition Audit

## Decision

**Standalone recognition gate: FAIL. Interpretation: CASE B + CASE D.**

The model partially recognizes `gooseneck_spout`, but not across all development domains. MobileNetV3-large recovers session-004 presence, yet neither backbone recognizes session-013, and high-confidence predictions in 011/012 frequently localize the coffee bed, dripper interior, or background rather than the spout. Axis-aligned bbox supervision is also inconsistent across the dataset: the first-party sessions contain mostly compact boundary-truncated boxes while 011–013 contain smaller horizontal boxes.

This directly shows that tip localization is **not** the only downstream problem. Gooseneck semantic recognition/localization itself is not cross-session robust.

Session-014 remains sealed. Sessions 005–010 were not accessed. No tip head, tracking, production change, or ONNX export was created.

## Protocol

- Authoritative development sessions: 001, 002, 003, 004, 011, 012, 013.
- 176 manual-dripper-calibrated frames: 122 positives, 54 intentional negatives.
- Input: frozen `balanced` manual search-region crop, letterboxed to 224×224.
- Output: one independent presence logit plus one axis-aligned `gooseneck_spout` bbox. There is no tip output.
- Loss: binary cross entropy for presence; positive-only Smooth L1 for bbox coordinates. Negatives do not receive a bbox target.
- Evaluation: seven-fold leave-one-session-out, fixed final epoch, held-out session excluded from training and selection.
- Confidence threshold: fixed at 0.50 before evaluation.
- Recognition failure for visual audit: missing accepted detection or accepted bbox IoU <0.30.

## Standalone recognition results

### MobileNetV3-small

IoU statistics are conditional on an accepted positive bbox; IoU recall denominators include every positive, so presence misses count as failures.

| Held-out | Detection recall | Specificity / FPR | IoU mean / median / P90 | Recall IoU≥.30 | Recall IoU≥.50 | Positive / negative confidence median |
|---|---:|---:|---:|---:|---:|---:|
| 001 | 94.7% | 100% / 0% | .711 / .763 / .819 | 94.7% | 89.5% | 1.000 / .000 |
| 002 | 100% | 100% / 0% | .494 / .487 / .850 | 86.7% | 46.7% | 1.000 / .000 |
| 003 | 100% | 100% / 0% | .671 / .707 / .741 | 100% | 91.7% | 1.000 / .006 |
| 004 | 7.1% | 100% / 0% | .561 / .561 / .561 | 7.1% | 7.1% | .000 / .000 |
| 011 | 100% | 33.3% / 66.7% | .260 / .241 / .380 | 31.6% | 5.3% | .997 / .867 |
| 012 | 50.0% | 50.0% / 50.0% | .142 / .136 / .282 | 5.0% | 0% | .479 / .515 |
| 013 | 4.3% | 100% / 0% | .264 / .264 / .264 | 0% | 0% | .000 / .000 |

### MobileNetV3-large

| Held-out | Detection recall | Specificity / FPR | IoU mean / median / P90 | Recall IoU≥.30 | Recall IoU≥.50 | Positive / negative confidence median |
|---|---:|---:|---:|---:|---:|---:|
| 001 | 100% | 100% / 0% | .644 / .700 / .823 | 94.7% | 84.2% | 1.000 / .000 |
| 002 | 100% | 100% / 0% | .392 / .419 / .768 | 60.0% | 33.3% | 1.000 / .003 |
| 003 | 91.7% | 100% / 0% | .809 / .798 / .911 | 91.7% | 91.7% | 1.000 / .005 |
| 004 | 92.9% | 100% / 0% | .506 / .457 / .782 | 71.4% | 42.9% | .998 / .000 |
| 011 | 89.5% | 100% / 0% | .153 / .158 / .338 | 10.5% | 0% | .951 / .008 |
| 012 | 100% | 37.5% / 62.5% | .022 / .000 / .038 | 0% | 0% | .984 / .993 |
| 013 | 4.3% | 87.5% / 12.5% | .000 / .000 / .000 | 0% | 0% | .010 / .005 |

Large changes confidence behavior more than it improves structure localization. It dramatically recovers 004, removes 011 false positives, and increases 012 positive acceptance, but it does not recover 013. In 011 it reduces accepted-bbox median IoU from .241 to .158; in 012 it drives median IoU to zero and raises FPR. Capacity effect is therefore **moderate and mixed**, not a general solution.

## Ground-truth bbox quality

| Session | Positives | W/H median | Elongation median | Bbox/search area median | Search-boundary touch | Image-boundary partial proxy | Visible diagonal / dripper radius median |
|---|---:|---:|---:|---:|---:|---:|---:|
| 001 | 19 | .93 | 1.12 | 17.9% | 84.2% | 84.2% | 2.06 |
| 002 | 15 | .68 | 1.48 | 6.2% | 100% | 100% | 1.17 |
| 003 | 12 | 1.05 | 1.06 | 20.3% | 100% | 100% | 2.17 |
| 004 | 14 | .78 | 1.33 | 9.1% | 100% | 100% | 1.53 |
| 011 | 19 | 2.30 | 2.30 | 5.3% | 0% | 0% | 1.79 |
| 012 | 20 | 2.34 | 2.34 | 1.8% | 30.0% | 30.0% | .74 |
| 013 | 23 | 2.55 | 2.55 | 5.7% | 17.4% | 17.4% | 1.06 |

The target distribution shifts sharply:

- 001–004 bboxes are mostly compact or vertical, relatively large, and truncated by the image/search boundary.
- 011–013 bboxes are predominantly horizontal and elongated; session-012 has very short visible segments occupying only 1.8% of the search crop at the median.
- Visible-length proxy varies by almost 3× across session medians (.74–2.17 effective radii).
- In visual review, first-party boundary boxes often contain substantial unrelated background because the curved/partly off-frame structure is enclosed by an axis-aligned rectangle. The 011–013 labels are usually tighter, but encode only a short visible outlet/shaft segment.

An image-derived GrabCut occupancy proxy was also generated. Its median estimated background fraction ranged from .479 to .999, but it fails systematically on boundary-touching, reflective black, and low-contrast white spouts. It is retained in the artifact only as a documented diagnostic and is **not** treated as quantitative ground truth. Exact background fraction cannot be established from bbox labels alone; segmentation or centerline annotations are required.

Overall bbox representation quality: **mixed-to-poor**. Individual boxes are internally valid, but the supervision target is not structurally consistent across visibility, orientation, truncation, and domain.

## Geometry-only structure proxy

The existing rectangles do not show one stable anchor pattern suitable for a single axis-aligned prior. Sessions 001–004 are mostly compact/vertical and boundary-truncated; 011–013 are horizontal with substantially different extent. Elongation and visible-length variation can identify domains, but they do not define a stable physical near/far endpoint. Geometry alone therefore does not justify another anchor-box tuning exercise. A future line/centerline label could encode the physical tube direction without treating these bbox statistics as ground truth.

## Failure-frame audit

The following classifications use the stronger MobileNetV3-large fold. Every listed positive is visually reviewed and failed either detection or IoU .30.

### Session-004

| Frames | Classification |
|---|---|
| `t147000`, `t215000`, `t217000` | Spout visible to a human; dark/reflective, top-edge truncation, unusual near-vertical orientation; accepted bbox is coarse/background-heavy and IoU .219–.229. |
| `t187000` | Spout visible but small/dark at top edge; confidence miss (.088), reflection and very short visible segment. |

Large materially improves semantics here versus Small (92.9% versus 7.1% presence recall), but localization remains only 71.4% at IoU .30 and 42.9% at .50.

### Session-011

| Frames | Classification |
|---|---|
| `t004000` | Very short/right-edge visible segment; unusual orientation and partial visibility; confidence miss. |
| `t010000`, `t016000`, `t028000`, `t031000`, `t034000` | Spout visually obvious; dark reflective curved spout. Prediction is displaced onto dark background/dripper region; IoU 0–.262. |
| `t067000`, `t070000` | Obvious outlet with water overlap; high-confidence bbox is centered on background/coffee-bed region. |
| `t073000` | Zoomed/short reflective outlet; confidence miss. |
| `t076000`, `t079000`, `t082000`, `t085000`, `t088000`, `t091000`, `t094000`, `t097000` | Obvious dark spout, commonly with water/reflection; presence is mostly high, but predicted bbox follows background/dripper interior rather than the curved shaft. |

This is mainly bbox/semantic localization failure, not inability to say that some spout-like evidence exists.

### Session-012

All 20 positives fail IoU .30:

| Frames | Classification |
|---|---|
| `t013000`–`t017000` | Human-obvious short white outlet at right edge; low contrast, edge truncation, water overlap on later frames. High-confidence bbox is placed on background/coffee bed. |
| `t025000`–`t032000` | Very short white/gray segment, highlight and water overlap; model continues to box the dripper interior/background. |
| `t033000`, `t036000`, `t037000`, `t038000`, `t039000`, `t042000`, `t044000` | Larger and visually obvious white spout, sometimes with hand/edge interference and water; high confidence but IoU 0–.203. |

The detector responds confidently to the scene but does not localize the spout. This is not a threshold problem.

False-positive negatives:

- `t007000`: dripper/filter and background highlight.
- `t018000`, `t019000`, `t050000`, `t052000`: water/foam, coffee bed, filter rim, reflective server/background.

### Session-013

All 23 positives fail IoU .30:

| Frames | Classification |
|---|---|
| `t036000`, `t039000`, `t042000`, `t045000` | Human-visible white outlet, low contrast and top/right-edge placement; presence effectively absent. |
| `t051000`, `t054000`, `t057000`, `t060000`, `t066000`, `t069000`, `t072000`, `t075000`, `t078000`, `t084000`, `t087000` | White/low-contrast shaft with water and highlight overlap; unusual horizontal presentation. Presence remains below threshold. |
| `t090000` | High-confidence false localization: spout is visible, but predicted bbox is on coffee bed/dripper interior, IoU 0. |
| `t093000`, `t096000`, `t102000`, `t105000`, `t108000`, `t111000`, `t114000` | Human-obvious white outlet with water/highlight overlap; presence collapses and no valid spout bbox is recovered. |

False-positive negative `t022000` contains hand/finger, filter/dripper edges, a cup, and text overlay but no valid spout; classified as hand plus background-edge/dripper confusion.

## Backbone and compute comparison

| Backbone | Active parameters | Feature resolution | CPU forward estimate | Estimated throughput |
|---|---:|---:|---:|---:|
| MobileNetV3-small | 1,046,213 | 576×7×7 | 11.93 ms | 83.9 FPS |
| MobileNetV3-large | 3,103,445 | 960×7×7 | 22.65 ms | 44.2 FPS |

These are 30 warm-cache PyTorch batch-1 forwards on this workstation, not browser benchmarks. Large costs about 1.9× the CPU time. It produces a large gain only on 004 and changes failure tradeoffs elsewhere. Since both backbones collapse on 013 and both fail useful localization on 012, capacity alone is not the main issue.

## Answer to the primary question

- Does `gooseneck_spout` generalize across sessions? **Partially.** It works on 001–003 and Large recovers 004, but structure localization collapses on 011–013.
- Is weak bbox representation involved? **Yes.** Axis-aligned targets change from large boundary-truncated compact boxes to tiny horizontal segments and can include substantial unrelated background.
- Is semantic/backbone representation involved? **Yes.** Session-013 presence collapses even when the white spout is obvious, and 011/012 predictions confidently attend to the wrong structure.
- Is tip localization the main downstream problem? **No.** The upstream spout detector itself is not robust.

Primary failure: **mixed bbox representation + cross-domain semantics/data**. Backbone capacity has a moderate, session-specific effect.

## Recommended next experiment

Choose family **7: line/segment heatmap supervision plus targeted data expansion**.

Add exactly one new annotation:

- `gooseneck_spout_centerline`: an ordered polyline following the center of the visible physical spout tube, starting at the existing physical outlet (`spout_tip`) and ending at the last visible kettle-side point or image boundary. Mark only visible tube; do not bridge occlusion, include water, hand, kettle body, or infer off-frame geometry.

Why: it encodes curved direction and visible extent, avoids axis-aligned background burden, naturally handles truncation, and can be rasterized into a line/segment heatmap without inventing another ambiguous neck-base point. Before training it, collect a compact targeted set containing white low-contrast spouts, short edge-truncated segments, dark reflective spouts, water overlap, and same-scene hand/tool/dripper/water-only negatives.

Do not spend the next experiment on a larger backbone alone and do not proceed to tip/tracking yet.

## Artifacts

- Results: `.vision-work/runs/task-9c5-8/results.json`
- Predictions: `.vision-work/eval/task-9c5-8/predictions.json`
- GT geometry audit: `.vision-work/eval/task-9c5-8/gt-geometry.json`
- Failure contact sheets: `.vision-work/eval/task-9c5-8/{backbone}/session-*-failed-positive-contact-sheet.jpg`
- LOSO checkpoints: `.vision-work/checkpoints/task-9c5-8/{backbone}/loso/`

All artifacts remain under gitignored `.vision-work`.

## Quality gates

- Python vision tests: PASS — 48/48 across 11 test files.
- Repository tests: PASS — 734/734 across 45 files.
- Lint: PASS.
- Typecheck: PASS.
- Build: PASS.
- `git diff --check`: PASS.

The first typecheck was run concurrently with `next build` and encountered a transient race while Next regenerated `.next/types`. After build completion, the canonical standalone `npm run typecheck` command passed without code changes.
