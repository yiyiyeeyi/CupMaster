# Task 9C-5.1 — Cross-Session Domain Shift Audit

Status: **COMPLETE — multi-factor first-party domain shift confirmed**

Date: 2026-09-25  
Branch: `feature/camera-brew-runtime`  
Frozen source commit: `8098ceb`  
Scope: authoritative sparse frames from sessions 001–004; session-004 is analysis-only after the completed held-out evaluation

## Decision

The session-004 failure is best explained by a combination of geometric and appearance shift, not by a single threshold defect. Relative to sessions 001–003, session-004 has a materially smaller brewer opening, a more right-shifted spout, greater saturation and highlight/dark content, and lower local contrast around the spout. The frozen detector loses acquisition or predicts a displaced ROI; the frozen presence head maps all 14 session-004 positives below its 0.50 threshold. These two failures compound before tracking can begin.

The full-frame keypoint path is substantially more stable across sessions than the detector/ROI path: session-004 normalized mean/median error is 0.3670/0.3575 radii, versus 0.3979/0.3720 on session-003. It is still too inaccurate and has a 14.29% miss rate, so this is evidence for testing a **global coarse keypoint → local refinement** architecture, not evidence that the existing full-frame head is production-ready.

No model was trained or retrained, no threshold or checkpoint was changed, no annotation was modified, and sessions 005–010 were not accessed.

## Method and definitions

The audit uses all 88 frozen first-party images: 60 positives and 28 intentional negatives. Sessions 001–002 are the original training sessions, session-003 is the original validation session, and session-004 retains its recorded held-out outcome but is now observed analysis data.

Per positive frame, the audit computes normalized box area/aspect/center, normalized tip coordinates, minimum tip-to-image-edge distance, boundary contact, spout-length proxy, and tip position relative to the annotated dripper. Dripper scale is the effective ellipse radius `sqrt(radiusX × radiusY)`, divided by image width. Image statistics are deterministic: full-image luminance mean/standard deviation, local grayscale contrast in the annotated spout box, HSV saturation mean, highlight fraction (`luminance >= 245`), and dark fraction (`luminance <= 45`).

Failure joins use the exact Task 9C-5 frozen detector, full-frame keypoint, R4 ROI keypoint, and Gate B presence outputs. Correlations are descriptive only: session-004 has 14 positives, features covary, and these values do not establish causality.

## Cross-session geometry

| Session | Positives | Box area fraction mean | Box center x mean | Tip x mean | Tip edge distance mean | Dripper radius / width mean | Top-edge touch |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 001 | 19 | 0.0852 | 0.3292 | 0.4811 | 0.3572 | 0.2985 | 78.95% |
| 002 | 15 | 0.0429 | 0.3399 | 0.4306 | 0.2957 | 0.3205 | 100% |
| 003 | 12 | 0.1137 | 0.2429 | 0.4511 | 0.4188 | 0.2974 | 50% |
| 004 | 14 | 0.0439 | **0.4417** | **0.5408** | **0.2533** | **0.2576** | 100% |

The most decisive geometric difference is scale. Session-004's dripper-radius range is 0.2509–0.2601 image widths; the entire sessions 001–003 range is 0.2917–0.3296. Its median therefore lies completely outside the pooled development range, with a standardized mean shift of -4.33. This is a genuine unseen scale regime.

Session-004 is also displaced rightward. Its box-center-x mean is 0.4417 versus 0.3102 for development (+1.77 pooled standard deviations), and tip-x mean is 0.5408 versus 0.4568 (+1.11). The tip is closer to an image edge (0.2533 versus 0.3532, -1.00). Boundary contact alone is not novel—most development boxes also touch the top—but session-004 combines top truncation with smaller scale and more rightward positions.

Box area is smaller on average (0.0439 versus 0.0788), but overlaps the wide development range. Dripper scale is the cleaner camera/domain indicator because it is non-overlapping and consistent across every session-004 positive.

## Cross-session image appearance

| Session | Luminance mean | Luminance SD | Local box contrast | Saturation mean | Highlight fraction | Dark fraction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 001 | 133.62 | 51.93 | 48.79 | 28.10 | 0.0003 | 0.0561 |
| 002 | 143.17 | 57.16 | 56.44 | 27.21 | 0.0108 | 0.0387 |
| 003 | 140.02 | 53.26 | 49.78 | 24.58 | 0.0034 | 0.0399 |
| 004 | 142.95 | 57.23 | **42.37** | **36.13** | 0.0100 | **0.0668** |

Session-004 saturation is the second strongest shift: its median 36.32 is outside the pooled development range except for a narrow range overlap at the extreme, and the standardized mean shift is +3.65. Local spout-box contrast falls to 42.37 from 51.54 (-1.80). Luminance variation, highlight fraction, and dark fraction are also elevated (+1.18, +1.16, and +1.13 standardized shifts). Visually, the test session combines reflective metal and water with a darker brewer/background structure; the spout is less locally distinct despite the globally brighter/high-variation image.

This supports a mixed appearance-domain shift rather than a simple brightness mismatch. It also explains why changing one cutoff would be unlikely to repair the full pipeline robustly.

## Detector and ROI failure association

The frozen detector accepts 8/14 session-004 positives and rejects 6/14. Accepted detections still have poor geometry: 0/14 reach IoU 0.50, and frozen 30% padding contains only 4/14 tips.

| Session-004 positive group | Count | Box center x mean | Tip x mean | Dripper radius / width mean |
| --- | ---: | ---: | ---: | ---: |
| Detector accepted | 8 | 0.3750 | 0.4692 | 0.2572 |
| Detector rejected | 6 | **0.5305** | **0.6364** | 0.2582 |

Within session-004, detector confidence is strongly negatively associated with rightward position (`r=-0.75` for box center x and `r=-0.86` for tip x). Rejected examples are visibly concentrated farther right. This supports **H1: detector domain shift / ROI propagation failure**. Scale is shifted for both accepted and rejected groups, so scale differentiates the whole session from development but does not alone explain which session-004 samples are rejected.

For the eight accepted detections, padding contains the tip in only four. The four contained R4 predictions still have normalized errors of 0.7615, 0.8262, 0.5111, and 0.7749 radii (mean 0.7184); none is close to the session-003 R4 mean of 0.0836. Thus containment is necessary but not sufficient, supporting **H2: crop-conditioned keypoint brittleness**. The predicted crops differ in object scale, truncation, and context from the development ROI distribution, and the local head does not recover even on contained tips.

## Presence representation audit

| Session | Positive probability mean / median | Positive recall | Negative probability mean / median | Negative specificity |
| --- | ---: | ---: | ---: | ---: |
| 001 | 0.9864 / 0.9997 | 100% | 0.0177 / 0.0051 | 100% |
| 002 | 0.9877 / 0.9990 | 100% | 0.0136 / 0.0026 | 100% |
| 003 | 0.9673 / 0.9915 | 100% | 0.2415 / 0.1733 | 80% |
| 004 | **0.0600 / 0.0090** | **0%** | 0.0048 / 0.0002 | 100% |

Session-004 positives score like development negatives: their median probability is 0.0090 versus 0.0082 for the 20 development negatives, and their mean 0.0600 is below the development-negative mean 0.0722. This is not a cluster of borderline 0.5 cases; the maximum positive score is only 0.3253.

Frozen MobileNetV3 global-average-pooled embeddings are 576-dimensional. Their norms vary strongly by session but do not separate positive from negative within a session—for example session-004 positive/negative mean norms are 13.23/13.41, and session-002 values are 11.84/11.84. An audit-only centered PCA explains 33.35% and 13.93% on its first two components. The plot forms strong session/domain clusters, especially for session-004, while same-session positive and negative examples overlap. This supports **H3: Gate B learned session/background shortcuts** from the tiny sessions 001–002 training set rather than a sufficiently invariant spout-presence representation.

PCA is visualization only. It was not used to select a threshold, fit a classifier, or revise the frozen system.

## Full-frame keypoint stability

| Session | Located | Miss rate | Normalized error mean / median | Min / max |
| --- | ---: | ---: | ---: | ---: |
| 001 | 19/19 | 0% | 0.6962 / 0.7001 | 0.1645 / 1.2111 |
| 002 | 13/15 | 13.33% | 0.4658 / 0.4543 | 0.2410 / 0.6833 |
| 003 | 12/12 | 0% | 0.3979 / 0.3720 | 0.1125 / 0.6243 |
| 004 | 12/14 | 14.29% | **0.3670 / 0.3575** | 0.0329 / 1.2120 |

Unlike the detector/ROI and presence paths, full-frame localization does not show a session-wide collapse on session-004. Its mean and median are slightly better than session-003, although it retains an unacceptable tail, two misses, and a 1.212-radii maximum. Across all positives, error has essentially no association with boundary-touch count (`r=-0.014`); apparent associations with area and photometrics are confounded by session and the small sample.

This supports **H4: full-frame keypoint robustness relative to the other semantic paths**, with an important qualification: the current head is a comparatively stable coarse cue, not an adequate final tip estimate.

## Hypothesis classification

| Hypothesis | Classification | Evidence |
| --- | --- | --- |
| H1 — detector domain shift → bad ROI propagation | **Supported, strong** | 6/14 acquisition failures, 0/14 IoU≥0.50, 4/14 padded containment; rightward position strongly tracks rejection |
| H2 — crop-conditioned keypoint brittleness | **Supported** | Even the four accepted-and-contained crops have mean normalized error 0.7184 versus 0.0836 on session-003 |
| H3 — presence shortcut learning | **Supported, strong** | 0/14 positive recall; session-004 positives have development-negative-like probabilities; frozen features cluster by session more than label |
| H4 — full-frame keypoint is relatively robust | **Supported with qualification** | Session-004 mean/median do not degrade versus session-003, but 14.29% miss and large tail remain |

## Recommended next experiments

1. **Primary: Option B — global keypoint → local refinement.** Use a global keypoint estimate as a coarse, detector-independent center; construct a deliberately jittered local crop around it; refine the outlet within that crop. Evaluate coarse recall, crop containment, and refined error separately. This directly targets the evidence that the global cue survives while detector-derived crops do not.
2. **Also justified: Option A — improve the global keypoint head.** Train/evaluate for coarse localization robustness across scale, background, reflection, truncation, and rightward position. The first goal is high crop-containment recall, not sub-pixel precision.
3. **Replace or redesign Gate B: Option D.** Presence should come from a semantic model demonstrated to generalize—potentially the global keypoint model's confidence plus geometric/temporal evidence, or a multi-task global model—not another tiny head over features that separate sessions. The current Gate B should not be repaired by lowering its threshold on session-004.
4. **Secondary: Option C — broader detector development** only if a detector remains necessary. Expand scale/right-edge/truncation coverage and measure ROI containment directly. Do not treat higher detection confidence alone as success.
5. **Required data action: Option E — targeted first-party capture.** Capture multiple new sessions spanning:
   - dripper effective radius around 0.25 image widths and intermediate scales up to the existing 0.29–0.33 regime;
   - right-side spout/tip positions through at least x≈0.70, plus left/center controls;
   - reflective spouts, visible water, dark brewer structures, high saturation/highlight scenes, and low local spout contrast;
   - top-edge truncation, partial hand interference, water-on and water-off positives;
   - paired positive and negative observations in each visual setup so background/session identity cannot predict presence.

Do not collect dense adjacent frames as a substitute for domain breadth. At least one newly captured first-party session must remain completely unseen for the next final test. If session-004 is used in any retraining, checkpoint selection, threshold selection, or architecture selection, it becomes development/analysis data and cannot be called held-out again.

## Visual evidence and artifacts

All generated files are ignored under `.vision-work/eval/task-9c5-1/`:

- `cross-session-domain-shift.json` — metrics, per-session distributions, model outputs, and descriptive associations
- `cross-session-frame-audit.csv` — one row per frozen first-party frame
- `01-development-representative-positives.jpg`
- `02-session004-all-positives.jpg`
- `03-session004-detector-failures.jpg`
- `04-session004-accepted-tip-not-contained.jpg`
- `05-highest-full-frame-errors.jpg`
- `06-lowest-full-frame-errors.jpg`
- `presence-feature-pca.jpg`

The contact sheets confirm the smaller session-004 brewer scale, darker/reflective visual domain, rightward failure concentration, and the fact that the largest full-frame errors are not unique to session-004.

## Scope discipline

| Check | Result |
| --- | --- |
| Model training or retraining | no |
| Threshold, padding, state-machine, or checkpoint change | no |
| Annotation modification | no |
| Session-004 used to tune the frozen system | no |
| Sessions 005–010 accessed | no |
| Production runtime modified | no |
| External benchmark started | no |

## Audit-tool technical notes

Three pre-result execution issues were corrected only in the new offline audit tool: its loader now explicitly permits the requested sessions 001–004 without weakening the older held-out guard; it points PyTorch at the existing local cache rather than a restricted default cache; and it accepts intentional-negative records with null dripper geometry. No model behavior, data label, or generated conclusion was altered by these fixes.

## Conclusion

**Dominant shift factors:** non-overlapping smaller visual scale, substantially higher saturation, reduced local spout contrast, more dark/highlight content, and a rightward/top-truncated target distribution.  
**Dominant architectural weakness:** two session-sensitive semantic gates in series—detector ROI generation and presence classification—prevent a comparatively stable global keypoint signal from ever helping the tracker.  
**Recommended next architecture experiment:** global coarse keypoint → robust jittered local refinement, paired with a redesigned presence source and targeted multi-session first-party data.  
**New data needed:** yes, targeted domain-balancing captures plus a separate never-observed first-party test session.  
**External benchmark:** do not proceed yet.
