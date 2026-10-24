# Task 9D-1 — Dripper-Normalized Trajectory & Coaching Engine

## Outcome

Task 9D-1 adds a deterministic, model-independent domain pipeline for converting spout-tip observations into coaching-ready motion state. It does not read private datasets, train or alter a vision model, connect tracking, or change production runtime/UI behavior.

The implementation is split into four layers:

1. `trajectory-normalization.ts` converts image-space points into calibrated dripper-relative geometry.
2. `trajectory-behavior.ts` contains pure motion-feature and coarse-behavior interpretation functions.
3. `trajectory-engine.ts` maintains robust temporal history, smooths valid observations, and applies configurable hysteresis.
4. `trajectory-types.ts` defines observations, history, features, behavior states, coaching output, configuration, and the CV injection seam.

## Input and injection contract

The engine consumes one observation at a time:

```ts
interface SpoutTipObservation {
  timestampMs: number;
  tip: { x: number; y: number } | null;
  confidence: number;
}
```

`DripperTrajectoryEngine` implements `SpoutTrajectoryObservationConsumer`, so a later CV runtime can inject observations through `acceptObservation()` without importing browser, camera, model, or UI concerns into the domain layer. Timestamps must be finite, non-negative, and strictly increasing. Confidence is bounded to `[0, 1]`.

## Dripper-normalized geometry

The engine uses the existing manual ellipse calibration:

- center `(centerX, centerY)`
- horizontal and vertical radii `(radiusX, radiusY)`
- optional ellipse rotation

For an image point, the engine:

1. translates it around the calibrated center;
2. rotates it by the negative ellipse rotation;
3. divides local x by `radiusX` and local y by `radiusY` independently;
4. derives `radius = hypot(x, y)` and `angleRadians = atan2(y, x)`.

This intentionally differs from scaling both axes by a single effective radius. It preserves ellipse/perspective calibration: a point on the calibrated rim has normalized radius 1 regardless of which ellipse axis it lies on. No camera resolution is fixed or assumed.

Image y increases downward. Therefore, a positive normalized angular velocity is visually clockwise; a negative velocity is counterclockwise. Angular increments use the smallest signed delta in `[-π, π]`, so crossing the `-π/π` boundary does not reverse direction or create a large jump.

## Observation history and robustness

Every input is retained in history with one of four explicit statuses:

- `observed`: confidence passed and the point was accepted;
- `uncertain`: a point was supplied below the confidence floor;
- `missing`: no point was supplied;
- `outlier`: implied speed from the previous accepted point exceeded the configured physical plausibility limit.

History stores observed normalized geometry separately from smoothed geometry. Uncertain, missing, and rejected outlier samples never invent a smoothed point.

A short dropout preserves the existing behavior state with degraded reliability but reports `position: null`. A gap beyond `maximumBridgeGapMs` clears temporal evidence and all behavior latches. The next valid observation starts a new segment; the engine never interpolates across the long gap.

Outlier rejection is causal and deterministic. A single implausible jump is ignored, while the following plausible point can recover against the last accepted point. The threshold is configuration, not hidden logic.

## Smoothing and features

Accepted points use a time-aware exponential smoother:

`alpha = 1 - exp(-elapsedMs / smoothingTimeConstantMs)`

This makes smoothing work with irregular sampling intervals and keeps latency bounded by an explicit time constant. A point after a long gap is not blended with the previous segment.

Within the configured rolling window the engine derives:

- normalized radial delta and velocity;
- wrapped angular delta and angular velocity;
- path-distance movement speed;
- accepted-observation continuity ratio;
- mean confidence;
- sample count and evidence duration.

## Behavior and coaching state

The coaching-facing result contains normalized position, radial trend, angular direction, movement state, trajectory form, reliability, evidence duration, and the supporting motion features. It contains no user-facing copy.

Behavior dimensions are deliberately independent:

- radial: `INWARD`, `OUTWARD`, `STABLE_RADIUS`, `UNKNOWN`;
- angular: `CLOCKWISE`, `COUNTERCLOCKWISE`, `UNKNOWN`;
- movement: `STATIONARY`, `MOVING`, `UNKNOWN`;
- composed form: `CIRCULAR`, `INWARD_SPIRAL`, `OUTWARD_SPIRAL`, `UNDETERMINED`.

This lets coaching logic distinguish a stable-radius circle from inward/outward spirals without forcing every frame into a pattern.

Each dimension has separate enter and exit thresholds plus a minimum hold duration. The exit threshold is lower than the enter threshold, creating a dead band. A proposed change must remain stable for `behaviorHoldMs` before it replaces the current state. This suppresses rapid instruction oscillation around a threshold or during a brief reversal.

## Frozen default parameters

Defaults are centralized in `DEFAULT_TRAJECTORY_ENGINE_CONFIG` and can be overridden explicitly at construction:

| Parameter | Default | Purpose |
| --- | ---: | --- |
| minimumConfidence | 0.50 | accept semantic observation |
| smoothingTimeConstantMs | 140 ms | causal smoothing/latency balance |
| maximumBridgeGapMs | 300 ms | largest gap that may preserve state |
| maximumNormalizedSpeedPerSecond | 5.0 | causal outlier guard |
| featureWindowMs | 900 ms | motion evidence horizon |
| minimumEvidenceDurationMs | 300 ms | minimum behavior evidence |
| minimumFeatureSamples | 4 | minimum accepted samples |
| behaviorHoldMs | 200 ms | state-change hysteresis |
| radial enter / exit | 0.16 / 0.07 radius/s | radial trend dead band |
| angular enter / exit | 0.45 / 0.20 rad/s | direction dead band |
| movement enter / exit | 0.18 / 0.08 radius/s | moving/stationary dead band |

These are domain defaults for the deterministic engine, not values tuned on session-014 or external benchmark data. Future changes must be evaluated and versioned rather than silently embedded in UI logic.

The timing defaults are intentionally short relative to a human pour: 140 ms removes frame-scale jitter without adding a visibly long lag, 300 ms tolerates a brief inference dropout but forces a new segment after a meaningful absence, and the 900 ms evidence window is long enough to establish coarse movement without averaging across a large portion of a pour. The 200 ms state hold rejects a single anomalous frame at common analysis rates. Velocity thresholds are expressed in dripper radii or radians per second so they remain resolution-independent; their conservative dead bands are starting product-domain values to be stress-tested by Task 9D-2, not claims of final user-optimal tuning.

## Verification coverage

Focused automated tests cover:

- non-circular and rotated ellipse normalization;
- clockwise and counterclockwise motion;
- stable-radius circular motion;
- inward and outward spirals;
- stationary motion and deterministic jitter;
- an isolated outlier and recovery;
- short missing gaps and long-gap segment reset;
- low-confidence observations;
- irregular timestamps;
- angular wraparound;
- sustained angular and radial reversals;
- anti-oscillation hysteresis;
- invalid timestamp ordering.

## Task boundary

- CV model/training changed: no
- Tracking added: no
- Production runtime/UI changed: no
- Session-014 accessed: no
- External sessions 005–010 accessed: no
- Private data accessed or uploaded: no

The next integration point is an adapter that maps the selected CV semantic output to `SpoutTipObservation` and consumes `TrajectoryCoachingState`. That integration is intentionally outside Task 9D-1.
