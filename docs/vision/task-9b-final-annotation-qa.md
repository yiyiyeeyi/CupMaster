# Task 9B final first-party annotation QA

Status: **PASS — training-ready annotation merge complete**

## Inputs and ground-truth policy

- Frozen frame manifest: `data/vision/frames/feasibility-v1/manifests/cupmaster-spout-first-party-v1.json`
- Reused Pilot annotations: `data/vision/annotations/feasibility-v1/pilot-reused.json`
- New VIA annotations: `data/vision/exports/feasibility-v1/via-first-party-new-v1.json`
- Final normalized annotations: `data/vision/annotations/feasibility-v1/first-party-v1.training-ready.json`
- Annotation-derived manifest: `data/vision/frames/feasibility-v1/manifests/cupmaster-spout-first-party-v1.training-ready.json`

VIA regions are authoritative for the 46 newly annotated frames. Candidate positive/negative values were selection-time estimates and were not used as annotation ground truth. A VIA frame with exactly one `gooseneck_spout` rectangle and one `spout_tip` point is positive. A dripper-only or zero-region frame is an intentional negative.

## VIA normalization

| Measure | Count |
| --- | ---: |
| Image records | 46 |
| Exact frozen-frame matches | 46 |
| Positives | 30 |
| Intentional negatives | 16 |
| Dripper-only negatives | 13 |
| Zero-region negatives | 3 |
| Spout rectangles | 30 |
| Spout-tip points | 30 |
| Dripper circles | 43 |
| Bbox-only / tip-only records | 0 / 0 |
| Invalid shapes | 0 |
| Duplicate shapes | 0 |
| Unsupported labels | 0 |

VIA circles are normalized as `radiusX = r`, `radiusY = r`, with effective radius `sqrt(radiusX * radiusY)`. They retain `geometrySource: via_circle`.

## Final merged dataset

The final merge contains 42 validated Pilot frames plus 46 VIA frames, for 88 unique first-party observations.

| Split | Sessions | Positive | Negative | Total |
| --- | --- | ---: | ---: | ---: |
| Train | session-001, session-002 | 34 | 15 | 49 |
| Validation | session-003 | 12 | 5 | 17 |
| Test | session-004 | 14 | 8 | 22 |
| **Total** |  | **60** | **28** | **88** |

The annotation-derived counts intentionally differ from the earlier 66/22 selection estimate.

## Selection estimates corrected by authoritative annotations

| Frame | Selection estimate | Authoritative annotation |
| --- | --- | --- |
| `session-001-t146000` | positive | negative |
| `session-002-t125000` | positive | negative |
| `session-002-t175000` | positive | negative |
| `session-003-t031000` | positive | negative |
| `session-004-t100000` | negative | positive |
| `session-004-t139000` | positive | negative |
| `session-004-t143000` | positive | negative |
| `session-004-t270000` | positive | negative |

No relabel request is required for these frames.

## Dripper QA geometry

- Coverage: 83/88 frames (94.32%).
- VIA circle-derived geometry: 43 frames.
- Pilot CVAT ellipse-derived geometry: 40 frames.
- Missing dripper geometry: 5 frames.
- Effective radius: `sqrt(radiusX * radiusY)`.
- Dripper remains QA/normalization-only and is not a training target.

The final merge recovers the original Pilot `radiusX` and `radiusY` values from the validated CVAT Pass 1 export. It does not reinterpret normalized radius placeholders as real geometry.

## Integrity and schema QA

- Exactly 88 unique annotations: pass.
- Exact frame identity matches: pass.
- Duplicate frame IDs or session/timestamp pairs: none.
- Missing/corrupt JPEGs: none.
- Capture-session split isolation: pass.
- External session-005 through session-010 contamination: none.
- Positive bbox coverage: 60/60.
- Positive tip coverage: 60/60.
- Negative spout false positives: 0.
- Invalid or duplicate shapes: 0.
- `gooseneck_spout` and `spout_tip` are the only training targets.
- Dripper is QA-only.
- Secondary neck-base keypoint is absent from final annotations.

## Task 9B gate

Task 9B is complete after lint, typecheck, tests, build, frozen dataset validation, and final annotation validation pass. Model training remains out of scope until Task 9C is explicitly started.
