# Task 9C-5.2 — Global-to-Local Keypoint Generalization Recovery

Status: **PARTIAL PASS — architecture direction retained; do not return to tracking yet**

Date: 2026-09-25  
Branch: `feature/camera-brew-runtime`  
Development sessions: `session-001`–`session-004`  
External sessions accessed: no

## Decision

Global coarse keypoint → local refinement materially improves localization over a full-frame keypoint alone and removes the catastrophic detector-ROI containment failure. It also gives substantially better cross-session robustness than the frozen detector → ROI → R4 baseline on the shifted session-004 domain.

The semantic localization gate does not fully pass. The selected 65%-image-width ROI contains the true tip for 59/60 positives, but the global confidence gate still misses five positives across four folds, and session-004 refined localization remains weak: normalized mean 0.4355, P90 0.7438, and max 1.0548 radii. Tracking must remain disconnected until targeted data and another cross-session development round reduce this tail.

## Protocol

Four leave-one-session-out folds were run. Each fold trains on three sessions and evaluates the fourth independently. Session-004 is now development/analysis data and is not described as a final held-out test.

- Frozen ImageNet MobileNetV3-small feature extractor and existing spatial keypoint-head family.
- Global input: full image letterboxed to 224×224.
- Global/local confidence threshold: fixed 0.50 in every fold.
- Training budget: fixed 80 epochs; final epoch used. Held-out-fold loss was not used for checkpoint selection.
- Augmentations: existing identity, horizontal flip, brightness 0.90, and contrast 1.10.
- Local candidates: square crops with side equal to 35%, 50%, or 65% of image width, centered on the global prediction and clamped to image bounds.
- Positive local training crops: GT-tip centered with independent x/y translation jitter up to ±30% of crop side and uniform scale jitter 0.85–1.15. Every sampled crop must retain the tip.
- Negative local training crops: centered on the fold's global prediction, so the local confidence head sees hard negative search regions.
- Candidate selection: maximize worst-session containment, then minimize worst-session normalized mean error, then maximize worst-session locate rate. This selected 65%.

The three ROI sizes are a deliberately small fixed set, not a broad hyperparameter search.

## Cross-session results

### Baseline A — leave-one-session-out full-frame keypoint

| Held-out session | Locate rate | Negative FPR | Normalized mean | Median | P90 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 001 | 94.74% | 0% | 0.2626 | 0.2667 | 0.4698 | 0.6140 |
| 002 | 86.67% | 0% | 0.2507 | 0.2375 | 0.3703 | 0.4832 |
| 003 | 100% | 40.00% | 0.1448 | 0.1350 | 0.2396 | 0.3091 |
| 004 | 85.71% | 0% | 0.6226 | 0.5834 | 0.9723 | 1.0256 |

The re-trained LOSO global model remains a useful coarse acquisition primitive, but session-004 still has a large localization shift. Its role should be safe crop generation rather than final guidance output.

### Baseline B — frozen detector → 30% padded ROI → R4 keypoint

This is the existing Task 9C-3 configuration, trained on sessions 001–002 and selected on session-003. It is shown for comparison and was not retrained into LOSO folds; sessions 001–002 therefore include in-sample results.

| Session | Locate rate | Negative FPR | ROI containment | Normalized mean | Median | P90 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 001 | 100% | 0% | 100% | 0.1367 | 0.1256 | 0.2206 | 0.2674 |
| 002 | 100% | 0% | 100% | 0.0536 | 0.0535 | 0.0833 | 0.1256 |
| 003 | 100% | 0% | 100% | 0.0836 | 0.0641 | 0.1927 | 0.2529 |
| 004 | **57.14%** | 0% | **28.57%** | **0.8594** | 0.7843 | 1.3831 | 1.3831 |

### Candidate C — global coarse keypoint → 65% local refinement

| Held-out session | Locate rate | Negative FPR | ROI containment | ROI failure | Normalized mean | Median | P90 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 001 | 94.74% | 0% | 94.74% | 5.26% | 0.0906 | 0.0794 | 0.1533 | 0.2235 |
| 002 | 86.67% | 0% | 100% | 0% | 0.0584 | 0.0518 | 0.1199 | 0.1295 |
| 003 | 100% | 0% | 100% | 0% | 0.0811 | 0.0884 | 0.1315 | 0.1523 |
| 004 | 85.71% | 0% | 100% | 0% | 0.4355 | 0.3520 | 0.7438 | 1.0548 |

Relative to A, C reduces normalized mean error by 65.5%, 76.7%, 44.0%, and 30.0% on sessions 001–004 respectively. Relative to B, it removes the session-004 ROI collapse and improves session-004 locate rate from 57.14% to 85.71%; error remains materially too high. C is slightly worse than B's in-sample session-002 mean, but similar in magnitude, and is better on sessions 001, 003, and 004.

The global misses are:

- session-001: `session-001-t196000`
- session-002: `session-002-t066000`, `session-002-t112000`
- session-003: none
- session-004: `session-004-t147000`, `session-004-t187000`

The only 65% ROI containment failure is `session-001-t196000`, the same global-confidence miss and a grossly displaced coarse prediction.

## ROI size audit

| Held-out session | 35% containment / mean | 50% containment / mean | 65% containment / mean |
| --- | ---: | ---: | ---: |
| 001 | 89.47% / 0.0755 | 94.74% / **0.0682** | 94.74% / 0.0906 |
| 002 | 100% / 0.0799 | 100% / 0.0678 | 100% / **0.0584** |
| 003 | 100% / **0.0427** | 100% / 0.0505 | 100% / 0.0811 |
| 004 | 64.29% / 0.4790 | 92.86% / **0.3604** | 100% / 0.4355 |

The 50% crop has better precision on three folds, including session-004, but fails containment on one session-001 and one session-004 positive. The 65% crop was selected because the experiment's primary local-search requirement is safe cross-session containment. Its cost is more background, higher edge-clipping frequency (35.3%–59.1% across sessions), and worse refinement precision than 50% on three folds.

This suggests the next iteration should not simply enlarge the crop further. It should improve global coarse accuracy/confidence and train the refiner across the missing domain, potentially using a staged large-search then tighter-refinement design only after data coverage improves.

## Known domain-shift sensitivity

Descriptive correlations use only 60 positives and are confounded by session. They indicate direction, not causality.

| Feature | B locate correlation | C locate correlation | B error correlation | C error correlation |
| --- | ---: | ---: | ---: | ---: |
| Dripper scale | +0.535 | **+0.050** | -0.818 | -0.737 |
| Tip x | -0.587 | **+0.001** | +0.082 | +0.408 |
| Top-edge contact | -0.149 | **+0.027** | +0.151 | +0.143 |
| Highlight fraction | -0.269 | **-0.038** | +0.298 | +0.292 |
| Saturation | -0.515 | **-0.260** | +0.756 | +0.664 |
| Local contrast | +0.417 | **+0.243** | -0.498 | -0.466 |
| Spout box area | +0.173 | +0.316 | -0.200 | **-0.129** |

Global→Local substantially reduces acquisition sensitivity to dripper scale, rightward tip position, top-edge contact, highlights, saturation, and contrast compared with detector→ROI. Residual localization error remains strongly associated with small dripper scale and high saturation because session-004 still dominates those regimes. The architecture fixes ROI availability more decisively than final precision.

## Keypoint-derived presence evidence

No new independent presence classifier was trained. The audit considers global confidence, local confidence, and global/local agreement.

| Evidence | Positives | Negatives |
| --- | ---: | ---: |
| Global confidence mean / median | 0.9136 / 1.0000 | 0.0855 / ~0.0000 |
| Local confidence mean / median | 0.9830 / 1.0000 | 0.0850 / 0.0017 |
| Global/local disagreement / image width mean / median | 0.0690 / 0.0585 | 0.2037 / 0.1903 |

Requiring both global and local confidence ≥0.50 gives, across independent LOSO predictions:

- positive recall: 91.67% (55/60)
- negative specificity: 100% (28/28)
- session recalls: 94.74%, 86.67%, 100%, 85.71%
- every session negative specificity: 100%

This is materially more plausible than Gate B because the evidence is tied directly to localization and generalizes to session-004. It is not ready to freeze: five positives are missed, individual negative local confidence reaches 0.995, and the sample is too small to choose an agreement threshold safely. Agreement and temporal persistence should be evaluated on new development sessions before defining a presence policy.

## Decision gate

1. **Does Global→Local materially improve over full-frame keypoint?** Yes. Mean normalized error improves in every fold by 30.0%–76.7%.
2. **Does it outperform detector→ROI across sessions?** Yes in cross-session robustness. It removes the session-004 containment collapse; it is not uniformly lower-error on the in-sample session-002 comparison.
3. **Does it reduce catastrophic per-session collapse?** Yes for acquisition and ROI containment. No for all localization tails: session-004 remains materially weaker.
4. **Is local ROI containment robust across sessions?** Mostly: 59/60 overall and 100% on three sessions, with one gross-coarse-error failure on session-001.
5. **Can keypoint-derived evidence plausibly replace the separate presence classifier?** Plausibly yes; evidence is promising but not yet a frozen policy.
6. **Is targeted data required before returning to tracking?** Yes.

**Return to tracking now: no.** First improve session-004-like localization precision and validate keypoint-derived presence on new development sessions. Then reserve a genuinely unseen first-party session for the next tracking gate.

## Artifacts

All generated artifacts remain ignored:

- Results: `.vision-work/runs/task-9c5-2-global-local/results.json`
- Global predictions: `.vision-work/runs/task-9c5-2-global-local/global-predictions.json`
- Candidate predictions: `.vision-work/runs/task-9c5-2-global-local/candidate-predictions.json`
- Fold checkpoints: `.vision-work/checkpoints/task-9c5-2/`
- Four selected-policy contact sheets: `.vision-work/eval/task-9c5-2/`

The contact sheets were visually checked. They confirm reliable crop coverage in sessions 002–004, the session-001 coarse outlier, and persistent session-004 refinement displacement despite valid search regions.

## Scope discipline

- External sessions 005–010 accessed: no
- Production runtime modified: no
- Tracking reconnected: no
- New independent presence classifier trained: no
- Session-004 status: development/analysis only

