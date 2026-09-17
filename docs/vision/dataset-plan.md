# Spout-tip feasibility dataset plan

Status: Task 9A collection decision
Accessed: 2026-09-17

## Purpose and size

Create **150–250 annotated frames** to answer one question: can a compact model learn the physical gooseneck outlet in CupMaster's v1 scene? This is not a production data estimate and must not be reported as one.

The primary source is consented first-party CupMaster capture. External datasets surveyed in `spout-tip-research.md` do not match the required combination of gooseneck, top-down, coffee bed, outlet keypoint, and clear commercial terms.

## Capture matrix

Capture at least five sessions and at least three materially different kettles. Do not let one black kettle dominate every split.

Target diversity, subject to actually available equipment:

- black matte gooseneck;
- stainless/silver;
- white/light color;
- reflective metal;
- transparent/semi-transparent only if it is a real, reasonably common obtainable gooseneck; otherwise record it as an untested stretch material rather than staging an artificial proxy.

Each feasible kettle should appear against multiple conditions:

- 90°, 85°, 80°, and 75° camera angles;
- white and beige/brown filters;
- dry and wet coffee beds;
- light and dark countertops;
- hand visible and partly blocking;
- steam and reflections;
- diffuse, warm indoor, cool indoor, and difficult directional lighting;
- stationary hold, entering/leaving, center pour, perimeter pour, clockwise/counter-clockwise motion, and short pauses.

Training exploration may include a small number of more oblique frames. The **v1 validation and test sets contain only 75–90° top-down / near-top-down scenes that satisfy the frozen product claim**. A robustness-only slice must be reported separately and must not inflate the v1 result.

## Negatives

Reserve roughly 20–30% of selected frames for varied negatives; adjust after inspecting false positives rather than treating the range as a production truth. Include:

- dripper only;
- hand only;
- coffee bed only;
- kettle body with no visible spout;
- non-gooseneck kitchen object;
- empty setup;
- reflective utensil near the dripper;
- filter/dripper edge configurations that visually resemble a tip.

Negatives prevent the model from predicting a spout simply because it recognizes a pour-over setup.

## Video capture and frame selection

- Preserve original videos and an immutable capture manifest; do not recompress the only source copy.
- Record camera device, resolution, orientation, nominal angle, session, kettle, scene, lighting, and consent/provenance.
- Generate candidates at **2–5 FPS**, then manually select for position, rotation, material, blur, occlusion, and scene diversity.
- When motion is slow or paused, select by meaningful position change rather than the clock alone.
- Do not fill the quota with near-identical adjacent frames. Use perceptual-hash or embedding similarity only as a reviewer aid, not an automatic deletion oracle.
- Keep difficult and negative cases intentionally; do not curate only clean hero frames.

## Split strategy

Never randomly split adjacent frames. Every frame inherits a group key:

```text
capture_session_id + video_id + kettle_id + scene_id
```

All near-adjacent frames and alternate encodes of the same event stay in one split. Prefer:

```text
Train: capture sessions A/B/C
Validation: capture session D
Test: capture session E
```

With only 150–250 frames, fixed percentages may yield misleadingly tiny strata. Choose group assignments after capture to keep each evaluation set useful while maintaining hard session separation. Where possible, hold out a kettle in test to measure material/shape generalization; if that makes the set too small, report a session-held-out primary test and a separate kettle-held-out stress test.

Before training, produce a split audit showing counts by session, kettle, angle band, material, scene, visibility, positive/negative, and ambiguity. No source video may cross splits.

## Annotation workflow

1. Assign immutable frame IDs and split-group metadata before annotation.
2. Annotate `gooseneck_spout` visible-neck bbox and required `spout_tip` using `annotation-spec.md`.
3. Double-annotate at least 10% of positives across material/visibility strata.
4. On a separate 30–40-frame audit subset, add optional `spout_neck_base`; do not export it into first-model labels.
5. Adjudicate all disagreements, invisible tips, and skipped candidates.
6. Validate referential integrity, coordinate bounds, point-in-box, empty negatives, and split leakage.
7. Publish a dataset card/manifest containing provenance, consent, known bias, license, exclusions, and exact version hash before training.

## External-data policy

- Do not download a large dataset during Task 9A or Task 9B feasibility capture.
- External media enters a training split only after per-resource and, where necessary, per-asset license verification.
- Keep first-party and external provenance distinguishable in manifests and metrics.
- Google Brain Pouring (CC BY 4.0) and verified Open Images assets may be considered for general negatives/reference, but they are not substitutes for top-down gooseneck-tip labels.
- PourIt, UW-LPD, SPILL data/weights, TTD, and the unconfirmed WorldArena pour-over subset remain production-blocked as documented in `spout-tip-research.md`.

## Task 9B completion gate

Task 9B is complete only when:

- 150–250 diverse frames and required negatives exist;
- no session/video leaks across splits;
- annotations pass automated and manual QA;
- disagreement and optional neck-base audit results are reported;
- every item has provenance and commercial-use status;
- no model training has begun.

## Sources

All accessed 2026-09-17:

- [PourIt! paper](https://openaccess.thecvf.com/content/ICCV2023/html/Lin_PourIt_Weakly-Supervised_Liquid_Perception_from_a_Single_Image_for_Visual_ICCV_2023_paper.html) — paper; code Apache-2.0, data/weights terms unclear.
- [UW Liquid Pouring Dataset](https://rse-lab.cs.washington.edu/lpd/) — dataset license not stated on inspected page.
- [Google Brain Pouring Dataset](https://sites.google.com/site/brainrobotdata/home/pouring-dataset) — CC BY 4.0.
- [Open Images license detail](https://storage.googleapis.com/openimages/web/factsfigures_v4.html) — annotations CC BY 4.0, listed images CC BY 2.0 with per-image verification warning.
- [WorldArena Track 3](https://github.com/WorldArena2/WorldArena-2.0/blob/main/assets/track3_description.md) — repository MIT; linked HF dataset card Apache-2.0; exact pour-over subset unresolved.
