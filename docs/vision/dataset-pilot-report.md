# Spout annotation Pilot report

Status: annotation export QA complete; revision required

```text
Branch: feature/camera-brew-runtime
Tooling commit: a453426

Pilot dataset version: cupmaster-spout-pilot-v0

Capture sessions: 4 first-party videos (session-001 through session-004)
Kettles: 1 black matte gooseneck kettle
Approx camera angles: 90 degrees, top-down

Frames selected: 42
Positive: 30 (71.4%)
Negative: 12 (28.6%)
Split by capture session: train 24 / validation 11 / test 7

Annotation tool: CVAT for images 1.1
Pass 1 export: cvat-pilot-v0-pass1.zip.zip
Pass 1 SHA-256: 7587a8143e61f99f13a33ffb71bd3f0b918d8c8d9fa24fb9c5d5ae3e188a9e94
Pass 2 export: cvat-pilot-v0-pass2.zip.zip
Pass 2 SHA-256: bb380704512fba07032b0cc1cb5d4eee4d5b3a13d24479bf5f556cbd1f227321

Pass 1 image records: 42 (30 positive / 12 negative), all matched to manifest
Pass 1 annotation shapes: 0
Pass 2 image records: 12, all paired to the same Pass 1 source frames by filename
Pass 2 annotation shapes: 0

BBox definition: revise to tightly enclose the visible narrow spout assembly from the outlet back to the start of the narrow neck segment; exclude kettle body, water stream, and hands
Keypoint definition: center of the physical outlet where liquid exits; unchanged for water on/off

Double-annotation source pairs: 12
Comparable annotated pairs: 0
Tip disagreement mean / median / max: not computable (both exports contain zero shapes)
Normalized tip disagreement / dripper radius: not computable (zero tip shapes and no dripper reference label)
BBox IoU: not computable (zero gooseneck_spout boxes)
Tip missing / visibility: 42 expected positive observations are absent (30 Pass 1 + 12 Pass 2); no visibility attributes were exported

Transparent/reflective annotation: not assessable from the empty exports

Neck-base audit:
Expected positive observations: 42
Exported points: 0
Missing rate: 100%
Comparable pairs: 0
Agreement: not computable
Recommendation: do not retain as a production target yet; keep only as a Pilot audit field until a valid re-export demonstrates acceptable consistency

Hard negatives included: yes (hand without visible outlet, wet/dry coffee bed, empty filter, and server/cup scenes)
Negative frames with exported positive shapes: 0, but this is not evidence of correct negative labeling because the whole Pass 1 export is empty

Dataset leakage check: PASS (session-isolated split; manifest validator reports no errors or warnings)
Raw media committed to Git: no
Annotation exports committed to Git: no

Pilot Gate: REVISE

Revision reasons:
1. Both CVAT exports contain image records but zero rectangle or point shapes.
2. Pixel disagreement, normalized disagreement, bbox IoU, visibility QA, and neck-base consistency cannot be measured.
3. The exported label set has no dripper reference geometry, so normalization by dripper radius is unavailable even after spout shapes are restored.

Recommended final annotation schema after revision:
- retain spout_tip as the required primary point target;
- retain gooseneck_spout as a required axis-aligned bbox using the revised visible-spout definition above;
- do not retain spout_neck_base as a production target yet; collect it as an optional Pilot audit point and promote it only if repeatability is demonstrated;
- add a dripper ellipse as QA-only reference geometry for normalized disagreement, not as a model target.
```

The Pilot must be re-exported after saved shapes and dripper reference geometry are verified in CVAT. Do not train or expand the dataset while the Gate is REVISE.
