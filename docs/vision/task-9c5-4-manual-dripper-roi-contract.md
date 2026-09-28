# Task 9C-5.4 — Manual Dripper ROI + Spout Visibility Contract

Date: 2026-09-28  
Status: **v1 research contract frozen; UI and production runtime not implemented**

## Decision

CupMaster v1 does not automatically detect the dripper. Before brewing, the user supplies an approximate dripper-opening ellipse. That calibration defines the session's spatial reference and a bounded spout-search region.

The v1 vision path is:

> manual dripper calibration → dripper-relative search region → coarse spout-tip localization → local refinement → within-pour tracking → lost/reacquire

The physical outlet must be visible while active pouring is being measured, but it may leave the frame between pours. Detector-first full-frame acquisition is no longer the primary v1 path; the detector remains research-only.

## Manual calibration interaction

1. Open the camera preview in its intended brewing position.
2. Show a high-contrast ellipse overlay centered near the preview middle. The area outside the guide may be lightly dimmed without hiding the kettle-entry space.
3. Let the user drag the center and resize the horizontal and vertical radii. A circle is a valid special case. Rotation may be offered later, but is not required for v1.
4. Ask the user to align the guide approximately with the visible outer brewing-opening rim. Pixel-perfect tracing is explicitly unnecessary.
5. Preview the derived spout-search area and show non-blocking setup guidance.
6. On confirmation, store the calibration in canonical source-frame pixel coordinates for this brew session.

The interaction should favor a large touch target, a reset action, and a one-tap confirmation. The user can confirm whenever the center and radii are geometrically valid; size, clipping, and lighting observations are guidance rather than strict blockers.

The display-to-source transform must account for video rotation, CSS fitting/cropping, and mirroring. Stored coordinates always use the decoded frame after canonical orientation, never raw pointer or CSS coordinates.

### Stored geometry

Required:

- `centerX`, `centerY`
- `radiusX`, `radiusY`
- calibration frame width and height at the session/storage boundary
- calibration timestamp/version at the session/storage boundary

Optional:

- `rotationRadians`, when the interaction actually supports ellipse rotation; otherwise use zero/omit it

Derived:

```text
effectiveRadius = sqrt(radiusX × radiusY)
```

`src/domain/vision/manual-dripper-contract.ts` freezes the pure geometry contract. It deliberately does not write Brew persistence or connect the production UI.

## Fixed-camera assumption and recalibration

For v1, the phone and dripper are expected to remain substantially fixed throughout one brew. Minor table vibration and small mount settling are tolerated. CupMaster does not attempt full dripper tracking in this version.

Operational movement bands use the effective radius `R`:

| Condition | Center/rim change | Scale change | Behavior |
|---|---|---|---|
| Minor | apparent center shift ≤ 0.10R | radii change ≤ 5% | continue; no user interruption |
| Review band | 0.10R–0.25R | 5%–15% | show a subtle alignment suggestion when there is supporting runtime evidence |
| Recalibration required | > 0.25R, or rim clearly no longer follows the guide | > 15% | pause trajectory guidance and ask the user to realign |

These bands define future validation and UX behavior; they are not claims that v1 already detects dripper motion. Without a validated dripper tracker, runtime evidence such as persistent search-edge hits, broad optical flow, or repeated global/local disagreement may only suggest recalibration. It must not assert semantic dripper movement on its own.

## Spout visibility contract

CupMaster can measure an active pour only when the physical liquid-outlet center is visible and distinguishable.

Supported:

- kettle body partly or mostly outside the frame;
- spout entering from the top, left, or right;
- spout leaving between pours and returning later;
- hand interference that does not fully hide the outlet;
- water stream visible or absent;
- short partial visibility loss handled by tracking grace before confirmed loss.

Unsupported or warning condition:

- outlet fully occluded during active pouring;
- outlet consistently outside the camera field/search area;
- motion blur severe enough that the physical outlet cannot be localized;
- underexposure, glare, or clipping that makes the outlet indistinguishable;
- only the kettle body or water stream visible while the physical outlet is not.

The system must not fabricate or extend trajectory points through confirmed absence. Visibility is required per active pour segment, not continuously for the entire brew.

## Spout-search region

The search region is an expanded rectangle around the calibrated ellipse. Let `R = sqrt(radiusX × radiusY)`.

### Balanced default

```text
left   = centerX - radiusX - 1.50R
right  = centerX + radiusX + 1.50R
top    = centerY - radiusY - 2.00R
bottom = centerY + radiusY + 0.75R
```

The larger top margin reflects normal kettle approach while the symmetric side margins allow left/right entry. The bottom margin retains reasonable bed-edge motion without defaulting back to the entire frame.

### Wide-entry experiment preset

```text
left/right margin = 2.00R
top margin        = 2.50R
bottom margin     = 1.00R
```

Both policies are experiment-safe starting points, not values tuned on session-014 or the external benchmark. The balanced policy is the v1 default for future development evaluation. The wide-entry policy is a predeclared comparison for development sessions only.

The rectangle is clamped to source-frame bounds. Record both the unclipped region and clipped region plus `retainedAreaRatio = clippedArea / unclippedArea`. If less than 80% remains, show setup guidance; do not silently expand to the full frame. A later experiment may fall back to full frame only as an explicitly reported comparison.

## Coordinate systems

### Screen/source pixels

`tipX`, `tipY`, calibration center, radii, and search bounds are expressed in canonical decoded-frame pixels with origin at the top-left, positive x rightward and positive y downward.

### Dripper-relative trajectory

```text
u = (tipX - centerX) / effectiveRadius
v = (tipY - centerY) / effectiveRadius

tipX = centerX + u × effectiveRadius
tipY = centerY + v × effectiveRadius
```

This isotropic coordinate system preserves trajectory shape in units of equivalent dripper radius and remains independent of ellipse rotation. For a non-circular opening, `effectiveRadius` is the equal-area circular radius. `rotationRadians` describes the overlay geometry but does not rotate `(u, v)` in the primary v1 trajectory contract.

An anisotropic, ellipse-aligned coordinate system using `radiusX`, `radiusY`, and rotation may be studied separately. It must not be silently substituted for the frozen `(u, v)` definition.

Manual calibration replaces automatically inferred dripper geometry for runtime normalization. Annotated dripper ellipses remain useful as research/evaluation references.

## Pre-brew camera setup guidance

Geometry checks are deterministic and non-blocking:

| Check | Provisional guidance threshold | Message |
|---|---|---|
| Dripper mostly inside frame | ellipse bounding region retains < 80% | “Keep the dripper inside the guide.” |
| Apparent dripper size | `R / min(frameWidth, frameHeight) < 0.10` | “Move the phone slightly closer.” |
| Search area clipping | retained search area < 80% | “Make sure the kettle spout can enter the highlighted area.” |

Lighting guidance may use simple, separately validated image statistics later. Until thresholds are validated, the UI may show general instructions such as “Increase lighting,” but must not claim that an outlet is absent or unrecognizable from an unvalidated brightness heuristic.

## Runtime states and segment rules

```text
CALIBRATION
  user confirms ellipse
      ↓
READY
  calibration and search region valid
      ↓ brew starts
SPOUT_ABSENT
  no active trajectory; low-frequency semantic search
      ↓ coarse candidate + local confirmation
SPOUT_ACQUIRED
  initialize tracker and a new pour segment
      ↓ confirmation stabilizes
POUR_TRACKING
  tracking + periodic semantic correction; emit pixel and (u,v) points
      ↓ tracking/semantic evidence confirms loss
SPOUT_LOST
  stop emitting points and close the current segment
      ↓ return to bounded search
SPOUT_ABSENT
      ↓ later candidate + local confirmation
SPOUT_REACQUIRED
  start a new segment; never append to the prior segment
      ↓
POUR_TRACKING
```

A short internal uncertainty/grace window may suppress flicker during momentary interference, but it emits no invented points. Once absence is confirmed, the segment closes. Normal between-pour absence never forces manual recalibration.

The earlier detector-first experimental state machine remains available for historical comparisons, but it is superseded as the v1 acquisition contract by these manual-calibration states.

## Failure and UX behavior

| Situation | Runtime behavior | User-visible behavior |
|---|---|---|
| Spout never found after brew start | remain `SPOUT_ABSENT`; brew timer and manual guidance continue | unobtrusive “Keep the kettle spout inside the highlighted area”; never block saving the Brew |
| Spout disappears mid-pour | stop emitting during uncertainty; on confirmed loss close segment and enter `SPOUT_LOST` | brief “Spout lost — guidance will resume when it returns” |
| Spout returns | require coarse + local confirmation; create a new segment | resume guidance without requiring a tap |
| Camera likely moved significantly | suspend trajectory guidance; retain Brew/timer state | “Camera may have moved. Realign the dripper guide.” |
| Dripper no longer aligned | require explicit recalibration before normalized guidance resumes | return to overlay while preserving elapsed brew time and prior closed segments |
| Search region too clipped | continue when geometry remains valid, at reduced expected coverage | show setup guidance before brew; offer recalibration, never silently broaden the region |
| Outlet not visually usable | do not emit guessed points | “Keep the physical spout opening visible” or lighting/blur guidance |

All failures degrade vision assistance only. They must not prevent starting, timing, completing, or saving a Brew.

## Validation implications

Future semantic experiments evaluate the same predeclared manual-calibration contract:

- containment of the annotated spout tip inside the dripper-derived search region;
- robustness to realistic manual calibration perturbations, declared before evaluation (for example center offsets up to 0.10R and radius perturbation up to 5%);
- coarse spout-tip locate rate and negative FPR inside the search region;
- local-refinement normalized mean, median, P90, max, and miss rate;
- spout-visible versus spout-absent behavior;
- tracking, lost delay, and reacquisition within continuous video;
- segment boundaries, with zero confirmed-absence crossings;
- sensitivity to search-region clipping and entry direction.

Development and threshold work remains restricted to authorized development sessions. Session-014 stays sealed until a new cross-session gate is frozen and passed. Sessions 005–010 remain the untouched external benchmark. Full-frame detector acquisition may be reported only as a research comparison, not selected as the primary v1 path.

## Data implications

Prior data remains valid and must not be discarded. Existing dripper ellipse annotations can simulate manual calibration, measure calibration perturbation sensitivity, and normalize errors. Future data still needs diversity in spout appearance, outlet orientation, reflection, visible water, lighting, hand interference, entry direction, partial occlusion, and positive/negative states from similar scenes.

Manual calibration mitigates:

- arbitrary full-frame dripper placement and scale;
- reliance on automatic dripper detection;
- much of the full-frame background/domain burden;
- inconsistent runtime normalization scale;
- search-space variation caused by camera framing;
- ambiguity about where a kettle is allowed to enter.

It does not resolve:

- unseen spout appearance and material;
- reflection or water-stream confusion;
- fully hidden or truncated physical outlets;
- blur, darkness, blown highlights, and low local contrast;
- semantic confidence calibration and false presence;
- local-refinement failure after a bad coarse point;
- tracking drift, loss timing, or false reacquisition;
- major camera/dripper movement after calibration.

## Frozen v1 role assignments

- manual dripper calibration: primary spatial initialization
- bounded coarse spout-tip search: primary semantic acquisition direction
- local refinement: confirmation and precise localization
- tracker: active-segment continuity only
- full-frame spout detector: **research-only**
- automatic dripper detector/tracker: out of scope for v1

