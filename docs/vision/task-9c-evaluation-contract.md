# Task 9C evaluation contract

Status: **FROZEN before model experiments**

## Dataset discipline

| Use | Sessions | Frames | Positive / negative |
| --- | --- | ---: | ---: |
| Train | 001–002 | 49 | 34 / 15 |
| Validation and threshold selection | 003 | 17 | 12 / 5 |
| Final first-party test | 004 | 22 | 14 / 8 |
| External unseen benchmark | 005–010 | Separate | Never train or tune |

All preprocessing choices, architecture selection, checkpoint selection, confidence thresholds, confirmation counts, tracker timeouts, and correction policies are chosen with train plus validation only. Session 004 is run once after the architecture and policy are frozen. External sessions 005–010 are run only after that first-party result is recorded, and never feed back into this experiment round.

Every result records dataset manifest hash, annotation hash, source commit, configuration, checkpoint hash, runtime/provider, hardware, seed, and per-frame predictions.

## Static-frame metrics

### Detection

- A positive is matched when the single predicted box has IoU at or above a declared threshold. Report recall at IoU 0.50 as primary, plus IoU distribution for matched positives.
- Detection recall = matched positive frames / annotated positive frames.
- Negative false-positive rate = negative frames with any accepted spout detection / all negative frames.
- Bbox IoU = intersection area / union area. Invalid or zero-area boxes score 0 and are separately counted.
- Confidence threshold must be frozen on session 003 before session 004.

### Keypoint

- Pixel error = Euclidean distance between predicted and annotated `spout_tip` in restored source-image pixels.
- Normalized error = pixel error / `sqrt(radiusX * radiusY)`, using the frame's QA-only dripper geometry.
- Report count, mean, median, nearest-rank P90, and maximum for pixel and normalized error. Nearest-rank P90 is sorted value at one-based rank `ceil(0.90 × N)`.
- A positive frame with no accepted prediction is a miss, not an arbitrarily large coordinate error. Report miss rate separately and compute coordinate summaries only over located predictions, with the denominator printed.
- If dripper geometry is absent or either radius is non-finite/non-positive, retain the frame in pixel-error and miss metrics but exclude it from normalized-error aggregation. Report `normalizedEligible`, `normalizedExcludedMissingGeometry`, and `normalizedExcludedInvalidGeometry` explicitly. Never impute a radius.
- Dripper geometry is an evaluation scale reference only and is not a training target.

The shared pure metric definitions are in `src/domain/vision/vision-metrics.ts`.

## Later continuous-video metrics

These metrics require timestamped video ground truth or a separately approved annotation protocol; static 9B frames alone cannot produce them.

| Metric | Frozen definition |
| --- | --- |
| Jitter | For continuously visible, non-lost intervals, median and P90 of frame-to-frame predicted displacement after subtracting annotated displacement; report pixels and dripper radii per second |
| Miss rate | Visible annotated frames without a confirmed emitted tip / visible annotated frames |
| Reacquisition latency | Time from first visible ground-truth frame after a true absence/loss to `REACQUIRED`; report median, P90, max, and censored failures |
| False reacquisition rate | `REACQUIRED` events with no visible target in the confirmation window / all reacquisition events; also report events per minute |
| Drift | Distance from emitted tip to annotated tip while runtime remains `TRACKING`; report mean/median/P90 and longest threshold exceedance |
| Lost delay | Time from last visible ground-truth frame to `LOST`; negative values are premature losses and reported separately |
| Segment continuity | Per true visible interval: longest emitted segment duration / true interval duration, plus number of artificial breaks |
| Inference latency | Wall-clock completion minus module invocation time, per module; median/P90/P99, with warm-up reported separately |
| Effective FPS | Number of frames receiving a runtime update / elapsed wall-clock seconds, including preprocessing and orchestration |
| Module invocation rate | Detector, keypoint, and tracker calls per elapsed second and per processed frame |

Video evaluation must also record dropped input frames, queue depth, warm-up duration, and whether timing was synchronous or pipelined. Latency comparisons use the same device, resolution, provider, concurrency, and measurement window.

## Mode comparison

Modes A, B, and C use the same frame stream, preprocessing contract, confidence interpretation, state machine, and reporting format. Compare:

- static accuracy and negative behavior;
- video stability and recovery;
- per-module and end-to-end latency;
- effective FPS and invocation rates;
- model/checkpoint size and peak memory;
- failure cases by session and visual tag.

Mode C does not pass merely by being smoother: it must not materially worsen misses, false reacquisitions, drift, or lost delay.

## Gates

Before final test: all validation metrics generate deterministically, no split leakage, threshold/config file frozen, prediction artifacts reproducible, and license/checkpoint review recorded.

Before external benchmark: session-004 result immutable, architecture and runtime policy frozen, external data untouched by training/tuning, and external annotations evaluated only through a separate manifest.
