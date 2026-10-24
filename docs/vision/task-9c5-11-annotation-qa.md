# Task 9C-5.11 — Targeted Annotation Normalization and QA

## Gate

**PASS — 51/51 manifest-authorized target records are normalized and training-ready.**

The Task 9C-5.11 annotation manifest is the sole inclusion authority. The VIA export contains 142 records, but only the exact 51 filenames in `annotation-manifest.json` were admitted. The other 91 records belong to sessions 001–004 and 011–013 and were ignored; none were copied into the targeted annotation output.

Selection-time positive/negative hints were not treated as ground truth. Actual kind was derived only from the authoritative VIA regions:

- exactly one valid `gooseneck_spout` rectangle plus exactly one valid `spout_tip` point: positive;
- no spout rectangle and no tip: intentional negative;
- `dripper` alone or zero regions: intentional negative.

## Normalized result

| Measure | Result |
|---|---:|
| Manifest target frames | 51 |
| Exact target VIA records | 51 |
| Positive | 24 |
| Intentional negative | 27 |
| Dripper geometry | 48 / 51 (94.1%) |
| Zero-region negatives | 3 |
| VIA records ignored as unrelated | 91 |

The prior candidate estimate was 32 positive and 19 negative. It was intentionally not forced onto the annotations. The authoritative result is 24 positive and 27 negative.

## Per-session coverage

| Session | Total | Positive | Negative | Tip | BBox | Dripper |
|---|---:|---:|---:|---:|---:|---:|
| 015 | 8 | 7 | 1 | 7/7 positives | 7/7 positives | 8/8 |
| 016 | 12 | 3 | 9 | 3/3 positives | 3/3 positives | 11/12 |
| 017 | 10 | 3 | 7 | 3/3 positives | 3/3 positives | 9/10 |
| 018 | 12 | 7 | 5 | 7/7 positives | 7/7 positives | 11/12 |
| 019 | 9 | 4 | 5 | 4/4 positives | 4/4 positives | 9/9 |

Positive bbox coverage and tip coverage are both 24/24 (100%). Dripper is QA geometry, not a primary target.

## Geometry and schema validation

- Missing target records: 0
- Duplicate target records: 0
- Unsupported labels: 0
- Invalid coordinates: 0
- Duplicate shapes: 0
- Tip-only positives: 0
- BBox-only positives: 0
- Multiple tips: 0
- Multiple spout boxes: 0
- Missing/corrupt/hash-mismatched JPEGs: 0
- `spout_neck_base`: absent

Two negative frames contained a single ellipse with blank region attributes:

- `session-015-t123500`
- `session-017-t022000`

Because each shape was unambiguously an ellipse and the accepted geometric role for an ellipse is `dripper`, both were normalized to `dripper` under the existing auditable fallback policy. The original VIA export was not modified.

Both VIA circle and ellipse forms are supported. This export used ellipses. The common representation stores `centerX`, `centerY`, `radiusX`, `radiusY`, and `effectiveRadius = sqrt(radiusX * radiusY)`.

## Presence and domain coverage

Counts below combine authoritative positive/negative kind with selection metadata as non-ground-truth descriptive hints.

- Water-on positives: 24
- Water-off positives: 0
- Matched presence groups with both authoritative positive and negative examples: 5
  - `session-015-dark-pour`: 7 positive / 1 negative
  - `session-016-cycles`: 3 positive / 9 negative
  - `session-017-white-pours`: 3 positive / 7 negative
  - `session-018-white-pours`: 7 positive / 5 negative
  - `session-019-presence-a`: 4 positive / 5 negative

Non-exclusive distractor hints among the 27 authoritative negatives:

| Distractor | Frames |
|---|---:|
| reflection | 21 |
| wet bed | 16 |
| rim | 14 |
| foam | 12 |
| hand | 10 |
| kettle body | 5 |
| shaft/tool | 5 |
| server | 3 |

The two session-019 water-off outlet-visible candidates are authoritative negatives because the human VIA export contains no bbox/tip. They remain useful same-scene presence controls but are not relabeled as positives.

## Private outputs

- Normalized annotations: `.vision-work/datasets/task-9c5-11/annotations/task-9c5-11-targeted-v0.normalized.json`
- Machine-readable QA: `.vision-work/datasets/task-9c5-11/annotations/task-9c5-11-targeted-v0.qa.json`

Both outputs, source annotations, images, and evaluation payloads remain local under gitignored `.vision-work` paths.

## Scope

- Training performed: no
- Session-014 accessed: no
- External benchmark sessions 005–010 accessed: no
- Production runtime/UI modified: no
- Original VIA export modified: no
- Private artifact committed/uploaded: no

