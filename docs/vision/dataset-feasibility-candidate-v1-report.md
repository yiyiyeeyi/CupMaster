# Feasibility dataset candidate v1

Status: candidate list only; awaiting review before extraction or annotation

## Summary

- Candidate manifest: `data/vision/frames/_review/feasibility-candidate-v1.manifest.json`
- Candidate frames: 196 unique source timestamps
- Positive: 152 (77.55%)
- Negative: 44 (22.45%)
- First-party candidates: 88
- External-reference candidates: 108
- Validated Pilot frames reused: 42 of 42
- JPEGs materialized for this candidate set: no
- Annotation started: no
- Model training started: no

The candidate manifest is deliberately separate from the active validated Pilot manifest. It records raw-video timestamps only and does not assign train/validation/test splits yet.

## Source policy

| Sessions | `sourceType` | Candidate count | Production training default |
| --- | --- | ---: | --- |
| session-001–004 | `first_party` | 88 | eligible |
| session-005–010 | `external_reference` | 108 | **not eligible** |

Every session-005–010 entry has `productionTrainingEligible: false` and `rightsStatus: not_cleared_for_production_training`. These frames may support visual-diversity review and feasibility experiments, but must not silently enter a production-training export. Rights review or replacement with first-party captures is required first.

## Distribution

| Session | Source type | Positive | Negative | Total |
| --- | --- | ---: | ---: | ---: |
| session-001 | first_party | 20 | 7 | 27 |
| session-002 | first_party | 17 | 5 | 22 |
| session-003 | first_party | 13 | 4 | 17 |
| session-004 | first_party | 16 | 6 | 22 |
| session-005 | external_reference | 16 | 4 | 20 |
| session-006 | external_reference | 18 | 4 | 22 |
| session-007 | external_reference | 16 | 4 | 20 |
| session-008 | external_reference | 14 | 4 | 18 |
| session-009 | external_reference | 13 | 2 | 15 |
| session-010 | external_reference | 9 | 4 | 13 |
| **Total** |  | **152** | **44** | **196** |

First-party composition is 66 positive / 22 negative. External-reference composition is 86 positive / 22 negative.

## Diversity coverage

The proposed timestamps cover:

- black, white, and reflective stainless spout appearances;
- paper-lined glass, ceramic, transparent/fluted, and dark dripper presentations;
- light stone, wood, white, dark, and mixed backgrounds;
- wide setup views through close dripper crops;
- water-on, water-off, entry, exit, and re-entry observations;
- center, inner, middle, and outer pour positions;
- multiple outlet orientations and clockwise/counter-clockwise movement;
- dry beds, wet beds, bloom, late-pour foam, and post-pour states;
- reflection and transparency effects;
- hand, grinder, kettle body, server, cup, rim, filter, and empty-setup negatives.

External-reference sessions contribute most of the new kettle, dripper, background, scale, and lighting diversity. This is useful for deciding what first-party recapture is needed even if none of those frames is ultimately cleared for production training.

## Duplicate and cut controls

- Candidate identity is `(sessionId, timestampMs)`; all 196 IDs are unique.
- All timestamps are inside their source-video durations.
- Selection generally uses at least two-second spacing and longer gaps in static intervals.
- The only one-second cross-class boundary retained is session-008 5s negative to 6s positive, because it captures spout entry rather than a near-identical state.
- Known kettle insert/hard-cut regions in session-008 and session-010 are excluded from positive sampling.
- Frames with severe blur, indeterminate outlet location, or major dripper/spout cropping were not selected.

## Review questions before extraction

1. Should all 108 external-reference timestamps remain as a visual benchmark, or should the list be reduced to a smaller diversity reference set?
2. Which external visual domains should be recreated as first-party captures before production training?
3. Should the 88 currently production-eligible first-party candidates be expanded with new owned captures before freezing session-isolated splits?

No candidate JPEG should be extracted and no CVAT task should be created until this list and the external-reference policy are approved.
