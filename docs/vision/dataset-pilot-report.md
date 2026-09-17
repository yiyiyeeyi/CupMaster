# Spout annotation Pilot report

Status: revised annotation export QA complete; Pilot passed

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
Pass 1 export: cvat-pilot-v0-pass1.zip
Pass 1 SHA-256: 4c61bfd96c5f199c128fbb0443d4b96c26f87441b2f211802a8f0242e0309a20
Pass 2 export: cvat-pilot-v0-pass2.zip
Pass 2 SHA-256: a62fa14c3ae45387afd9c8623918b6ce217e4e1a965a0683d44ab0ef580ea6ab

Pass 1 image records: 42 (30 positive / 12 negative), all matched to manifest
Pass 1 shapes: gooseneck_spout bbox 30 / spout_tip point 30 / spout_neck_base point 0 / dripper ellipse 40
Pass 2 image records: 12, all paired to the same Pass 1 source frames by filename
Pass 2 shapes: gooseneck_spout bbox 12 / spout_tip point 12 / spout_neck_base point 0 / dripper ellipse 12
Invalid or duplicate shapes: 0

BBox definition: revise to tightly enclose the visible narrow spout assembly from the outlet back to the start of the narrow neck segment; exclude kettle body, water stream, and hands
Keypoint definition: center of the physical outlet where liquid exits; unchanged for water on/off

Double-annotation source pairs: 12
Comparable tip and bbox pairs: 12
Tip disagreement mean / median / max: 3.116 px / 3.164 px / 5.620 px
Normalized tip disagreement mean / median / max: 0.00975 / 0.00983 / 0.01740
Dripper radius definition: equal-area effective radius sqrt(radiusX * radiusY); paired normalization uses the mean of the two passes' effective radii
BBox IoU mean / median / min: 0.97779 / 0.98316 / 0.94887
Expected positive observations: 42 (30 Pass 1 + 12 Pass 2)
BBox missing: 0 / 42 (0%)
Tip missing: 0 / 42 (0%)
Tip visibility: visible 42 / partially_occluded 0 / not_visible 0 / missing 0

Transparent/reflective annotation: no disagreement issue observed in this single black-matte-kettle Pilot; material diversity remains untested

Neck-base audit:
Expected positive observations: 42
Exported points: 0
Missing rate: 100%
Comparable pairs: 0
Agreement: not computable
Recommendation: drop from the production schema and retain only as an optional future audit field. The neck-to-body transition is not genuinely visible in these top-down frames, so no repeatability evidence exists.

Dripper QA:
Pass 1 overall coverage: 40 / 42 (95.2%); the two missing ellipses are known negative server scenes
Pass 1 positive coverage: 30 / 30 (100%)
Pass 2 coverage: 12 / 12 (100%)
Center disagreement mean / median / max: 5.726 px / 3.868 px / 13.541 px
Effective-radius disagreement mean / median / max: 2.315 px / 1.668 px / 8.336 px
Relative effective-radius disagreement mean / median / max: 0.738% / 0.505% / 2.581%
Recommendation: sufficiently consistent as QA scale reference; keep QA-only and exclude from training targets

Hard negatives included: yes (hand without visible outlet, wet/dry coffee bed, empty filter, and server/cup scenes)
Negative frames with exported gooseneck_spout bbox or spout_tip: 0 / 12

Dataset leakage check: PASS (session-isolated split; manifest validator reports no errors or warnings)
Raw media committed to Git: no
Annotation exports committed to Git: no

Pilot Gate: PASS

Pass reasons:
1. All 42 expected positive observations have the required bbox and tip, with no invalid or duplicate shapes.
2. Tip disagreement is small relative to the dripper opening (mean 0.975%, maximum 1.740% of effective radius).
3. Bbox agreement is high (mean IoU 0.97779; minimum 0.94887).
4. All 12 Pass 2 source frames pair correctly with Pass 1, and all 12 known negatives are free of false spout targets.
5. Dripper ellipses are repeatable enough for QA normalization; the absence of a genuinely visible neck base supports excluding it from the production schema.

Final feasibility-dataset annotation schema:
- training target: gooseneck_spout, one required axis-aligned bbox around the visible narrow spout assembly;
- training target: spout_tip, one required point at the physical outlet, with visible / partially_occluded / not_visible state;
- production schema excludes spout_neck_base; it remains audit-only if a future capture genuinely shows the neck-to-body transition;
- QA-only: one dripper ellipse on positive and double-annotation audit frames, normalized with equal-area effective radius sqrt(radiusX * radiusY);
- negatives contain no gooseneck_spout bbox or spout_tip;
- dripper geometry is never exported as a model training target.
```

The Pilot passes annotation-schema stability. Dataset expansion and model training remain separate, explicitly gated tasks and were not started in this round.
