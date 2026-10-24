# Task 9D-2 — Coaching Robustness & CV Error Budget

## Outcome

The current Task 9D-1 defaults are product-useful for coarse active-pour interpretation under moderate bounded jitter, sparse missing observations, isolated rejected outliers, and irregular timestamps. Sensitivity is not uniform:

- angular direction is the strongest dimension;
- radial trend and therefore spiral form need tighter localization;
- stationary detection is the most jitter-sensitive dimension;
- stable calibration offset is more dangerous than a short dropout because sufficiently large offset can produce a confidently wrong radial trend, whereas a long dropout resets to `UNKNOWN`;
- the engine's conservative reset and reacquisition behavior is preferable to coaching across an observation gap.

No production defaults, runtime code, CV model, UI, or coaching copy changed. This study uses only synthetic observations in normalized dripper coordinates.

## Experiment design

Each reference lasts approximately 4 seconds. Samples use the repeating interval sequence `67, 83, 101, 74, 92, 88, 111, 79 ms` (about 11.5 observations/second), rather than a fixed frame rate. An additional delayed-observation sequence uses `67, 83, 101, 74, 240, 52, 111, 79 ms`.

The first 1,000 ms are treated as establishment warm-up for observation-weighted outcome ratios. Every evaluated state is placed in exactly one semantic category:

- **correct**: every dimension in that experiment's expectation matches;
- **unknown**: no expected dimension is contradicted, but at least one is `UNKNOWN` or `UNDETERMINED`;
- **incorrect**: at least one expected dimension is contradicted by another concrete state.

The harness also records establishment time, reliability degradation, incorrect transitions, final outcome, and post-corruption recovery. The primary coaching proxy is behavior-state correctness; coordinate RMSE is intentionally not an objective.

## Reference trajectories

All geometry is generated directly in normalized dripper coordinates and then mapped through a non-circular manual calibration ellipse (`radiusX = 200`, `radiusY = 160`) before entering the normal 9D-1 normalization path.

| Reference | Normalized behavior | Expected final semantics |
| --- | --- | --- |
| stationary | radius 0.55, angle 0.35 | stationary, stable radius |
| clockwise / counterclockwise circle | radius 0.62, angular speed ±1.05 rad/s | matching direction, circular |
| clockwise / counterclockwise inward spiral | radial speed −0.17 radius/s, angular speed ±1.05 rad/s | inward, matching direction, inward spiral |
| clockwise / counterclockwise outward spiral | radial speed +0.17 radius/s, angular speed ±1.05 rad/s | outward, matching direction, outward spiral |
| radial inward / outward | radial speed ∓0.20 radius/s, fixed angle | matching radial trend, moving, no composite form |
| direction reversal | +1.05 then −1.05 rad/s at 2 seconds | final counterclockwise circle |
| radial-trend reversal | +0.20 then −0.20 radius/s at 2 seconds | final inward movement |

All 11 clean references reached their expected final state. There are no clean-trajectory behavior failures. With default hysteresis, worst establishment time among steady references was 1,311 ms; angular direction established by 616 ms in the clean circles/spirals. After the programmed reversal, angular direction changed in 1,031 ms and radial trend in 1,197 ms. These delays are expected consequences of the 900 ms rolling window plus 200 ms state hold, not CV corruption.

## Corruption methods and tested levels

| Dimension | Method | Tested values |
| --- | --- | --- |
| positional jitter | independent uniform zero-mean x/y offsets, bounded per axis; deterministic Mulberry32 seed `9002` | 0, 0.01, 0.02, 0.04, 0.06, 0.08, 0.10, 0.15, 0.20 |
| systematic offset | constant x/y bias in east, west, north, south, and diagonal directions | 0.04, 0.08, 0.12, 0.16, 0.20 |
| isolated outliers | deterministic golden-angle displacement at early/middle/late indices | magnitude 0.20, 0.40, 0.80, 1.20; 1, 3, or 5 events |
| missing observations | null tip/confidence zero | one frame, five sparse frames, nominal 200/300/350/650 ms contiguous intervals |
| low confidence | retain tip but set confidence to 0.20 | one frame and nominal 300/650 ms intervals |
| timestamp irregularity | variable valid intervals and occasional 240 ms delayed observation | baseline sequence and delayed sequence above |
| combined error | jitter 0.04 plus sparse missing, short dropout, one 0.80 outlier, or low-confidence interval | four targeted runtime-like cases |

Jitter magnitude is a **per-axis bound**, not an RMS radius. For example, level 0.04 permits a worst-case vector displacement of about 0.057 normalized radii. No timestamp was reordered.

## Current default configuration

The production defaults were evaluated unchanged:

| Parameter | Default |
| --- | ---: |
| minimum confidence | 0.50 |
| smoothing time constant | 140 ms |
| maximum bridge gap | 300 ms |
| maximum normalized speed | 5 radii/s |
| rolling feature window | 900 ms |
| minimum evidence duration | 300 ms |
| minimum feature samples | 4 |
| behavior hold | 200 ms |
| radial enter / exit | 0.16 / 0.07 radius/s |
| angular enter / exit | 0.45 / 0.20 rad/s |
| movement enter / exit | 0.18 / 0.08 radius/s |

## Positional-jitter results

The table reports observation-weighted averages after warm-up across the applicable steady references. `C/U/I` means correct / unknown / incorrect. “Final wrong” counts references whose last state was incorrect.

| Per-axis jitter | Angular C/U/I | Radial C/U/I | Movement C/U/I | Composite C/U/I | Final wrong, angular / radial / movement / composite |
| ---: | --- | --- | --- | --- | --- |
| 0 | 1.000 / 0 / 0 | 0.969 / 0.031 / 0 | 0.988 / 0.012 / 0 | 0.969 / 0.031 / 0 | 0 / 0 / 0 / 0 |
| 0.01 | 1.000 / 0 / 0 | 0.951 / 0.049 / 0 | 0.994 / 0.006 / 0 | 0.951 / 0.049 / 0 | 0 / 0 / 0 / 0 |
| 0.02 | 1.000 / 0 / 0 | 0.920 / 0.080 / 0 | 0.883 / 0.117 / 0 | 0.926 / 0.074 / 0 | 0 / 0 / 0 / 0 |
| 0.04 | 1.000 / 0 / 0 | 0.907 / 0.093 / 0 | 0.889 / 0.031 / 0.080 | 0.926 / 0.074 / 0 | 0 / 0 / 1 / 0 |
| 0.06 | 1.000 / 0 / 0 | 0.883 / 0.117 / 0 | 0.889 / 0 / 0.111 | 0.901 / 0.099 / 0 | 0 / 0 / 1 / 0 |
| 0.08 | 1.000 / 0 / 0 | 0.796 / 0.204 / 0 | 0.889 / 0 / 0.111 | 0.836 / 0.164 / 0 | 0 / 0 / 1 / 0 |
| 0.10 | 1.000 / 0 / 0 | 0.731 / 0.269 / 0 | 0.889 / 0 / 0.111 | 0.772 / 0.228 / 0 | 0 / 0 / 1 / 0 |
| 0.15 | 0.986 / 0.014 / 0 | 0.698 / 0.133 / 0.170 | 0.889 / 0 / 0.111 | 0.688 / 0.120 / 0.191 | 0 / 0 / 1 / 0 |
| 0.20 | 0.986 / 0.014 / 0 | 0.676 / 0.235 / 0.090 | 0.889 / 0 / 0.111 | 0.645 / 0.201 / 0.154 | 0 / 0 / 1 / 0 |

Angular direction never became confidently wrong through 0.20. Radial and composite interpretation degraded primarily to unknown through 0.10, then showed wrong transient states at 0.15. Stationary detection was the first hard failure: it was still correct at 0.01, was unable to establish at 0.02, and ended falsely `MOVING` at 0.04. Moving references themselves remained correctly moving.

Because jitter samples still have high confidence and plausible speed, reliability generally remained `RELIABLE`; at 0.20 only about 0.6–0.9% of states degraded due to rejected jumps. Reliability is therefore an observation-quality indicator, not an independent guarantee of semantic correctness.

## Systematic-offset results

Angular direction and movement were stable in every direction through offset 0.20. Radial interpretation was direction-dependent because shifting the assumed dripper center changes the measured radius over an otherwise circular path.

| Offset magnitude | Angular incorrect | Radial incorrect range by direction | Composite incorrect range | Boundary reading |
| ---: | ---: | ---: | ---: | --- |
| 0.04 | 0 | 0 | 0 | stable, with some radial UNKNOWN/latency |
| 0.08 | 0 | 0–0.043 | 0–0.062 | onset of transient confident error |
| 0.12 | 0 | 0.136–0.154 | 0.136–0.179 | clearly unsafe for radial coaching |
| 0.16 | 0 | 0.154–0.204 | 0.154–0.204 | incorrect radial/form states persist |
| 0.20 | 0 | 0.290–0.293 | 0.290–0.312 | materially wrong coaching proxy |

At 0.12, north and diagonal bias left two references in the wrong final radial/composite state. This is the strongest evidence that manual dripper calibration quality belongs in the CV/runtime error budget even when spout tracking itself is temporally smooth.

## Outliers, availability, and timing

An outlier of 0.40–1.20 normalized units was normally rejected by the 5 radii/s speed guard. Across one, three, and five injected events, pattern references had no incorrect final interpretation. Reliability degradation scaled approximately with rejected frequency: 2.8% for one event, 8.3% for three, and 11.1% for five. Magnitude 0.20 was sometimes physically plausible enough to pass the guard; it did not reverse active-pour pattern interpretation but could inflate movement, reinforcing that stationary detection needs a tighter input contract.

| Availability case on a clockwise circle | Correct / unknown / incorrect | Degraded | Recovery after interval | Unreliable states |
| --- | --- | ---: | ---: | ---: |
| isolated missing | 1.000 / 0 / 0 | 0.028 | 106 ms | 0 |
| five sparse missing | 1.000 / 0 / 0 | 0.111 | 42 ms | 0 |
| nominal 200 ms dropout | 1.000 / 0 / 0 | 0.056 | 6 ms | 0 |
| nominal 300 ms dropout | 0.778 / 0.222 / 0 | 0.222 | 680 ms | 1 |
| nominal 350 ms dropout | 0.778 / 0.222 / 0 | 0.222 | 630 ms | 1 |
| nominal 650 ms dropout | 0.667 / 0.333 / 0 | 0.333 | 655 ms | 5 |

Low-confidence samples produced the same boundary as missing samples: an isolated sample recovered in 106 ms; nominal 300 and 650 ms intervals reset to unknown and recovered in about 680 and 655 ms respectively. This is correct because both are excluded from smoothing/evidence.

The bridge threshold applies to elapsed time since the **last accepted** sample. With irregular sampling, a nominal `[1800, 2100]` blackout included surrounding frame intervals and made the accepted-to-accepted gap exceed 300 ms. A nominal 200 ms blackout kept that gap below the threshold. Vision integration should measure actual accepted-observation age, not count dropped frames or use only the requested blackout duration.

The delayed timestamp sequence retained correct final semantics in all 11 references. Its worst steady establishment time was 1,372 ms, close to the baseline 1,311 ms. No timestamp reordering was tested beyond the existing 9D-1 invalid-input coverage.

## Combined-error results

These results cover the six circular/spiral references at jitter 0.04. All scenarios finished correct and produced no confidently incorrect state.

| Combination | Angular correct | Radial correct / unknown | Composite correct / unknown | Degraded |
| --- | ---: | --- | --- | ---: |
| jitter + sparse missing | 1.000 | 0.940 / 0.060 | 0.940 / 0.060 | 0.111 |
| jitter + short dropout | 1.000 | 0.917 / 0.083 | 0.917 / 0.083 | 0.056 |
| jitter + isolated 0.80 outlier | 1.000 | 0.889 / 0.111 | 0.889 / 0.111 | 0.028 |
| jitter + low-confidence interval | 1.000 | 0.917 / 0.083 | 0.917 / 0.083 | 0.056 |

## Failure boundaries

| Behavior dimension | Stable region observed | Primarily unknown/degraded | Confidently incorrect observed |
| --- | --- | --- | --- |
| angular direction | jitter ≤0.10; offset ≤0.20 | slight UNKNOWN at jitter 0.15–0.20 | not observed in tested range |
| radial trend | jitter ≤0.01; offset ≤0.04 | jitter 0.02–0.10 | jitter 0.15; offset begins at 0.08 and is clear by 0.12 |
| moving state | active motion through jitter 0.20 | stationary becomes UNKNOWN at jitter 0.02 | stationary becomes MOVING at jitter 0.04 |
| circle/spiral form | jitter ≤0.01 | jitter 0.02–0.10 | transient at jitter 0.15; offset from 0.08–0.12 depending direction |
| observation continuity | isolated/sparse loss and accepted gap below 300 ms | accepted gap above 300 ms resets and reacquires | no wrong state during tested dropout |

UNKNOWN behavior is conservative for radial jitter through 0.10 and for long availability gaps. It is not universally conservative: plausible jitter can falsely classify a stationary tip as moving, and stable center bias can create a concrete wrong radial trend without reducing reliability.

## Limited parameter sensitivity

Only smoothing was varied after jitter exposed radial/stationary weakness. At jitter 0.10:

| Smoothing constant | Radial correct / unknown / incorrect | Composite correct / unknown / incorrect | Interpretation |
| ---: | --- | --- | --- |
| 80 ms | 0.688 / 0.312 / 0 | 0.728 / 0.272 / 0 | less smoothing, more indecision |
| 140 ms default | 0.731 / 0.269 / 0 | 0.772 / 0.228 / 0 | conservative degradation |
| 220 ms | 0.815 / 0.117 / 0.068 | 0.846 / 0.102 / 0.052 | more correct states but introduces confident errors and likely more lag |

The 220 ms alternative improves the headline correct ratio but changes some safe unknowns into incorrect coaching states. That is not a material product improvement under the stated preference for conservative UNKNOWN. No default change is recommended or applied.

## Recommended practical CV error budget

There is no honest universal number. Use the following behavior-specific contract in normalized dripper units:

- **Active-pour angular coaching:** bounded per-axis frame jitter up to 0.10 remained fully correct here; use **≤0.06** as the practical target to retain margin for untested motion speeds and combinations.
- **Radial/spiral coaching:** target **≤0.02 per-axis jitter** for lower latency and high correct-state occupancy; **0.04 is a tolerable degraded ceiling** when occasional UNKNOWN is acceptable. Do not coach radial change from observations near 0.10 merely because angular direction remains good.
- **Stationary coaching:** target **≤0.01 per-axis jitter**. At 0.02 the state can remain UNKNOWN and at 0.04 it can become falsely moving. Alternatively, future coaching policy should avoid relying on CV-only stationarity until separately improved.
- **Stable localization/calibration bias:** keep dripper-center-relative bias **≤0.04** for radial coaching. Bias of 0.08 showed first transient radial errors; 0.12 was clearly unsafe. Direction-only interpretation tolerated the tested 0.20.
- **Availability:** sparse missing observations are acceptable. Keep the age since the last accepted observation **≤300 ms** to preserve state; beyond that, expect reset and approximately 0.63–0.68 seconds of reacquisition after observations resume.
- **Outliers:** retain the existing 5 radii/s rejection guard. Large isolated errors (0.40–1.20 displacement in these timings) degraded reliability rather than corrupting the pattern. The upstream CV adapter should still suppress smaller plausible jumps because they can inflate movement.

The most sensitive behavior dimension is stationary-vs-moving. Among corruptions, stable systematic center offset is the most damaging to coaching semantics because it can create confidently wrong radial and spiral states; contiguous dropout is more visibly disruptive but fails safely to UNKNOWN.

## Implications for Task 9C and future CV work

1. Report temporal observation age and contiguous-loss duration, not only per-frame detection rate.
2. Evaluate spout error in normalized dripper x/y coordinates and stratify per-axis jitter from stable calibration bias; a single pixel RMSE hides their different coaching effects.
3. Prioritize calibration-center accuracy and radial stability before pursuing finer angular localization. Direction has substantial measured margin.
4. Include a stationary false-motion rate in CV acceptance criteria. Mean localization error alone will miss this failure.
5. Permit direction-only coaching when radial evidence is unknown or exceeds the tighter radial budget; do not discard useful angular evidence.
6. Preserve the current long-gap reset. Reacquisition latency is preferable to confidently bridging absent evidence.
7. Pixel equivalents should be computed from the runtime calibration axes. For example only, 0.02 normalized per-axis equals 2 px on a 100 px dripper radius or 4 px on a 200 px radius; normalized units remain the contract.

## Artifacts and boundaries

- `trajectory-robustness.test-utils.ts` provides the deterministic references, seeded jitter, offsets, outliers, missing/low-confidence corruption, engine runner, and semantic metrics.
- `trajectory-robustness.test.ts` verifies clean behavior, determinism, the full jitter progression, offset directions, outlier magnitudes/frequencies, dropout and low-confidence behavior, delayed timestamps, and four combined scenarios.
- CV model modified: no.
- Private dataset accessed: no.
- Training performed: no.
- Production runtime modified: no.
- Production defaults changed: no.

## Known limitations

This is a controlled synthetic study, not a population estimate. It uses one calibration ellipse, one deterministic jitter seed, one primary angular speed, two radial speeds, bounded uniform noise, and a limited set of combinations. The results establish practical engineering boundaries for the coarse behavior engine; they do not claim robustness to arbitrary camera perspective, correlated tracker drift, a fully off-image outlet, or every human pouring cadence. Those remain future validation work under the manual-calibration and near-top-down product contract.

## Recommended next task

Define the Task 9C-to-9D observation-quality acceptance contract and runtime instrumentation around these separate budgets (jitter, calibration bias, accepted-observation age, outlier rate, and stationary false-motion rate) before integrating user-facing coaching policy.
