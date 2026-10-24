# Task 9C-5.12 — Pour Impact / Water Stream Feasibility Audit

## Decision

**CASE C — MULTI_SIGNAL.**

The pour-impact point is more directly aligned with where water reaches the coffee bed, but it is not consistently identifiable enough to replace the spout tip. Use impact when supported by visible stream/contact evidence; retain the spout tip as the stable fallback, with water-stream geometry providing the association between them.

This was an annotation/visual feasibility audit only. It did not train a model, change the production runtime, or freeze a new schema.

## Sample

The audit uses 20 authoritative water-on positives and 4 water-off/absence controls from the private Task 9C-5.11 package. It spans sessions 015–019 and includes dark/reflective, white/highlight, low-contrast, short-visible, edge-entry, dry-ish bed, wet bed, foam, bubbles, reflections, and turbulence. Adjacent near-duplicates were omitted.

The four controls are:

- `session-019-t000000` and `session-019-t000500`: same-scene outlet-visible candidates that are authoritative intentional negatives, with no visible stream or supportable impact;
- `session-015-t123500`: wet-bed/hand absence control;
- `session-018-t072000`: wet-bed/reflection absence control.

## Human identifiability

| Target | Clear | Approximate/partial | Ambiguous | Unavailable |
|---|---:|---:|---:|---:|
| Spout tip | 14 | 6 | 0 | 0 |
| Water stream | 15 | 4 | 0 | 1 |
| Pour impact | 7 | 8 | 4 | 1 |

Impact ambiguity was most often caused by reflection (9 frames) and foam (7), followed by turbulence (4), transparent stream/background blending (3 each), wet bed (3), high saturation (2), and bubbles (1). These causes overlap.

The water stream is usually visually supportable, but its width is transparency- and exposure-dependent. For a future audit label, a short polyline is preferable to a mask: it preserves slight curvature and endpoint association without requiring annotators to delineate unstable transparent edges. A two-point segment may be adequate in the constrained V1 view, but the schema is not frozen here.

## Repeatability pilot

Ten representative water-on frames were annotated twice. The second reading used the source image without displaying pass-1 overlays or coordinates. Spout-tip pass 1 is the authoritative VIA point; impact pass 1 and pass 2 are audit-only manual readings.

This is within-auditor repeatability, not inter-annotator agreement and not model accuracy.

| Target | Pixel median | Pixel P90 | Pixel max | Normalized median | Normalized P90 | Normalized max |
|---|---:|---:|---:|---:|---:|---:|
| Spout tip | 5.66 | 6.40 | 6.40 | 0.0151 | 0.0284 | 0.0295 |
| Pour impact | 15.62 | 19.10 | 19.21 | 0.0485 | 0.0827 | 0.0831 |

Normalized distance uses the dripper ellipse directly:

`sqrt((dx / radiusX)^2 + (dy / radiusY)^2)`

Impact-point disagreement is approximately three times the normalized tip disagreement at the median. It remains usable as a coarse region cue in clear cases, but it is weaker as a precise point target.

## Tip-to-impact geometry

Fifteen frames had a clear or approximate impact point and therefore support comparison.

| Measure | Median | P90 | Max |
|---|---:|---:|---:|
| Pixel displacement | 297.52 px | 465.84 px | 557.35 px |
| Ellipse-normalized displacement | 1.160 | 1.482 | 1.622 |

The displacement is predominantly from the elevated/outside-rim outlet toward the inner brewing surface. It is systematic and large enough that tip and impact are not interchangeable coordinates. Impact radii are generally much smaller because the selected pours target the inner bed, while the tip remains above or outside the dripper opening.

## Trajectory-level comparison

Sparse selected stills are not a continuous trajectory benchmark, so direction/circularity numbers must be treated as a diagnostic rather than ground truth. Using only frames with supportable impact:

- Direction agreed in only 2 of 5 session summaries, including one session where both were `UNKNOWN` from insufficient angular movement.
- Radial trend agreed in 1 of the 4 sessions with at least three comparable samples.
- Shape interpretation agreed in 1 of those 4 sessions.
- Near-center impacts make angular direction inherently unstable: a small impact-coordinate change can produce a large angle change even when the broad target region is unchanged.

This does not prove that a continuous impact trajectory reverses the physical pour direction. It shows that sparse spout-tip and impact observations can yield materially different circularity, radial-trend, and direction labels, especially near the dripper center. A future continuous audit must use temporally adjacent frames before freezing impact-based coaching rules.

Broad radial-region agreement is the most product-relevant result: the signals frequently disagree because tip radius describes kettle geometry, whereas impact radius describes water delivery. For bed-target coaching, impact is semantically superior when it is visible.

## Short-visible and edge cases

- Tip usable: yes, but 6/20 were approximate in white/highlight or short-visible cases.
- Stream usable: usually; 19/20 were clear or partial, including several short-visible/edge cases.
- Impact usable: conditionally; stream visibility sometimes preserved an approximate impact when the tip was weak, but foam/reflection/turbulence still made 5/20 impacts ambiguous or unavailable.

The stream therefore adds useful fallback evidence, but visible stream alone does not guarantee a precise impact point.

## Recommended observation strategy

Use a composable multi-signal observation contract:

1. `spout_tip`: stable fallback and trajectory proxy;
2. optional `water_stream`: short polyline/segment with visibility state;
3. optional `pour_impact_point`: only when contact is directly supportable, with clear/approximate/ambiguous visibility state;
4. do not infer a hidden impact location from the tip alone.

No blocking change is required to the current 51-frame targeted retraining schema. If an impact experiment proceeds, add optional audit-only `water_stream` and `pour_impact_point` labels to a small clear/approximate subset rather than reannotating all 51 frames. Do not make impact required on water-on frames.

## Gate and next steps

- Need annotation schema change: **yes for a separate optional multi-signal pilot; no blocking change to the current tip-target dataset**
- Proceed with current targeted retraining: **yes** — Task 9C-5.11 QA passed, and tip remains a necessary fallback
- Proceed toward Task 9D trajectory integration: **yes** — keep the observation interface replaceable and confidence-aware
- Recommended follow-up: a small temporally adjacent multi-signal clip audit before training an impact model

## Private artifacts

- Manual audit record: `.vision-work/datasets/task-9c5-12/manual-audit-v0.json`
- Computed metrics: `.vision-work/eval/task-9c5-12/pour-impact-feasibility-v0.json`

These artifacts are private and gitignored.

## Scope

- Training performed: no
- Session-014 accessed: no
- External benchmark sessions 005–010 accessed: no
- Production runtime/UI modified: no
- Private artifacts committed/uploaded: no

