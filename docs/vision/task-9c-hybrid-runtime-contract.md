# Task 9C-1 hybrid CV runtime contract

Status: **FROZEN for feasibility experiments**  
Scope: research runtime only; no production brew-runtime integration

## Decision

CupMaster will evaluate one modular runtime with three switchable modes. The runtime owns orchestration and state; detector, keypoint localizer, and tracker are replaceable adapters. Image payloads and model-framework objects do not cross the adapter boundary.

The frozen TypeScript reference contract is in `src/domain/vision/hybrid-runtime-contract.ts`. It is deliberately isolated from `src/domain/brew-runtime`.

## Coordinate and result contract

- Every observation has a stable `frameId`, monotonic capture `timestampMs`, image width/height, and opaque payload.
- All points and boxes crossing module boundaries use source-image pixel coordinates, after undoing any model letterboxing.
- A box is axis-aligned `{ x, y, width, height }`, with `(x, y)` at the top-left.
- Confidence and tracking quality are finite values in `[0, 1]`; adapters must calibrate or explicitly document proxies before comparison.
- Detection returns either one best `gooseneck_spout` box or `not_detected`.
- Keypoint localization returns one `spout_tip` point plus visibility, or `not_located`.
- The tracker returns a point and opaque tracker state, or `lost`. It never declares semantic presence by itself.

## Module responsibilities

| Module | Owns | Must not own |
| --- | --- | --- |
| Detector | Whole-frame spout search, one best bbox, confidence | Tip position, temporal segment truth |
| Keypoint localizer | Tip estimate in whole frame or detector ROI, confidence, visibility | Long-term tracking, segment lifecycle |
| Tracker | High-rate short-term point propagation and quality | Initial target identity, indefinite presence, recovery without model confirmation |
| Orchestrator | Scheduling, state machine, confirmations, anti-drift, segments, telemetry | Framework-specific tensors or model internals |

All methods are asynchronous so a browser worker, native process, or remote experiment harness can implement them without changing the domain contract. Dependency unions make invalid module combinations difficult to construct: Mode A requires only a keypoint localizer; Mode B requires detector plus keypoint; Mode C additionally requires a tracker.

## Runtime modes

| Mode | Active modules | Purpose |
| --- | --- | --- |
| A — `keypoint_only` | Whole-frame keypoint localizer | Establish whether direct one-point learning is sufficient on this dataset |
| B — `detection_keypoint` | Detector, then ROI keypoint localizer | Separate presence/ROI from precise outlet localization |
| C — `detection_keypoint_tracking` | Detector, ROI keypoint localizer, tracker | Reduce inference cost and improve temporal continuity without trusting tracker-only output |

These are configurations of the same evaluator and state machine, not separate products. Preprocessing, coordinate restoration, segment rules, telemetry, and metrics remain identical. A dependency-injected adapter is the only framework-specific layer.

## Experimental defaults

These values are starting hypotheses, not trained or validated thresholds:

| Parameter | Default |
| --- | ---: |
| Detector polling while searching | 2 Hz |
| Tracker target update rate | 30 Hz |
| Keypoint correction refresh | 5 Hz |
| Detector confidence threshold | 0.45 |
| Keypoint confidence threshold | 0.55 |
| Tracker quality threshold | 0.50 |
| Initial confirmation | 3 consecutive eligible observations |
| Reacquisition confirmation | 2 consecutive eligible observations |
| Tracker failure timeout | 400 ms |
| Local relocalization attempts | 2 |
| Maximum accepted correction jump | 0.20 × current bbox diagonal |

Configuration is created and validated by `createExperimentalRuntimeConfig`. Threshold selection and ablation may use only train sessions 001–002 and validation session 003. Session 004 is forbidden for tuning.

## Scheduling and correction policy

- Mode A runs keypoint localization on each evaluator-sampled frame and uses full-frame input.
- Mode B polls the detector at the configured search frequency; a valid bbox gates ROI keypoint localization. While confirmed, keypoint localization follows the last trusted ROI (with a configured margin) and the detector is normally inactive.
- Mode C updates the tracker at the highest available cadence, but refreshes the keypoint at least at `keypointRefreshHz`, sooner when tracker quality is below threshold, or immediately when the detector materially changes the ROI.
- A correction larger than the anti-drift bound is not silently applied. It moves the runtime to `UNCERTAIN` and requires model confirmation.
- Tracker failure first triggers bounded local keypoint relocalization in the latest trusted ROI. Exhaustion moves to `LOST`, clears tracker state, and restarts detector search.
- A full detector restart is required after local-attempt exhaustion, failure timeout, invalid/out-of-bounds trusted geometry, an explicit scene discontinuity/reset, or loss of a usable ROI. It is not a routine `TRACKING`-state poll.
- A detector result cannot directly initialize tracking: the keypoint must pass confidence and confirmation policy.
- A tracker cannot keep a segment alive beyond the failure timeout without keypoint or detector corroboration.

## Segment contract

- The first confirmed acquisition starts segment 1 at the timestamp of the first observation in its confirmation run.
- Entry to `LOST` ends the current segment at the last trusted point timestamp. `UNCERTAIN` alone does not end it.
- Successful reacquisition starts a new segment and emits `REACQUIRED`; gaps are never interpolated as observed truth.
- `STOP` ends any open segment, clears transient state, and enters `ABSENT`.
- Segment records retain start/end timestamps, end reason, observation count, module invocation counts, and state-transition events. Model tensors and image buffers are not retained.

## Artifact boundary

Task 9C-1 creates a contract only. It does not select a framework, install an ML dependency, train a model, export weights, alter external-benchmark data, or connect to the production camera/brew runtime.

## Entry gate to Task 9C-2

Task 9C-2 may begin only after this contract, state semantics, evaluation formulas, split discipline, framework/license shortlist, and D-drive artifact layout pass review. The next entry point is an offline baseline matrix on train/validation only, beginning with Mode A and Mode B; session 004 and the external benchmark remain sealed.
