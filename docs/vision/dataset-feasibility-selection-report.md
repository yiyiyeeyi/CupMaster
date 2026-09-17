# Spout feasibility dataset selection report

Status: selected; awaiting human review before annotation

## Dataset summary

- Dataset version: `cupmaster-spout-v0`
- Source boundary: four existing first-party capture sessions only
- Selected frames: 190
- Positive frames: 145 (76.3%)
- Negative frames: 45 (23.7%)
- Existing Pilot frames reused: 42
- New frames selected: 148
- Annotation and model training: not started

The selected images and the authoritative local manifest remain under ignored `data/vision/` paths. No raw video, extracted frame, manifest, annotation, or normalized QA artifact is tracked by Git.

## Session-isolated split

| Session | Split | Positive | Negative | Total | Selected timestamp span |
| --- | --- | ---: | ---: | ---: | --- |
| `session-001` | train | 40 | 15 | 55 | 0–370 s |
| `session-002` | train | 34 | 11 | 45 | 0–220 s |
| `session-003` | validation | 30 | 7 | 37 | 0–80 s |
| `session-004` | test | 41 | 12 | 53 | 0–300 s |
| **Total** |  | **145** | **45** | **190** |  |

Split totals are train 100, validation 37, and test 53. Every session and source video occurs in exactly one split.

## Proposed final frame list

Timestamps below are seconds from the source video. Ranges are inclusive; comma-separated values are individually selected. The ignored local manifest contains the exact per-frame paths, millisecond timestamps, class, and inherited split.

### session-001 — train

- Positive: 71–77; 106–113; 146–153; 196–203; 285, 286, 287, 289, 290, 292, 294, 296, 297
- Negative: 0, 6, 20, 25, 45, 65, 70, 80, 125, 180, 240, 305, 345, 350, 370

### session-002 — train

- Positive: 66, 68–73, 75; 112–122, 124–125; 162–173, 175
- Negative: 0, 8, 20, 27, 40, 60, 80, 140, 190, 210, 220

### session-003 — validation

- Positive: 9, 10, 12–17, 19–22; 31, 33–43, 45; 62, 64–67
- Negative: 0, 7, 25, 28, 55, 75, 80

### session-004 — test

- Positive: 139–155; 180–187; 215, 217–219; 253–256, 258, 260, 262, 264, 266, 267, 269, 270
- Negative: 0, 10, 22, 50, 75, 100, 125, 165, 200, 280, 290, 300

Dense static intervals were not sampled. One-second spacing is used only inside short, actively moving pour windows where the spout position, orientation, water, coffee bed, or reflections change. A visually empty boundary candidate at session-004 138 s was rejected and replaced by the positive frame at 254 s.

## Diversity coverage

The four captures contribute multiple pour cycles and cover center, inner, middle, and outer positions; changing spout orientations; entry, active motion, exit, and re-entry; water-on and limited water-off/transition observations; dry and wet coffee beds; partial hand presence; reflective metal outlets; transparent dripper reflections; and the low/medium/high apparent positions available in the source footage.

Coverage remains constrained to the existing top-down, indoor, light-background, single-kettle capture domain. Steam is not reliably visible, water-off positives and true tip occlusions are limited, and there is no confirmed lighting or background domain shift. Those limitations should be reviewed after the feasibility result rather than filled with external media before this selection review.

## Hard-negative coverage

Negative selections include empty setup, dry and wet beds, hands/fingers, grinder or preparation activity, dripper/filter rims, server and cup handling, post-pour static scenes, and other reflective or circular non-spout structures. Kettle-body-only coverage is not clearly present in these captures.

## Duplicate and leakage checks

- Frame IDs and source timestamps are unique in the local manifest.
- SHA-256 comparison found no byte-identical selected JPEGs.
- Candidate sheets were reviewed at one-second resolution before selection; static adjacent frames were excluded and positive runs were retained only where active visual change occurs.
- All 42 Pilot source timestamps are present in the expanded manifest.
- Source hashes, source paths, and session IDs do not cross split boundaries.
- The local manifest validator reports zero errors and zero warnings.

## Review stop

This is the proposed pre-annotation frame set. Do not annotate or train until the frame list is reviewed. The production annotation schema remains `gooseneck_spout` rectangle plus required `spout_tip` point with visibility state for positives; `dripper` ellipse is QA-only; `spout_neck_base` is removed.
