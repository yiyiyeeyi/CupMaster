# Spout dataset tooling

Status: Task 9B-1 tooling ready; Pilot data not yet captured

## Local data boundary

Actual media and annotations stay local:

```text
data/vision/
  raw/           # original videos; ignored
  frames/        # extracted/selected JPEGs; ignored
  annotations/   # annotation-tool exports and normalized annotations; ignored
  exports/       # future trainer exports; ignored
  manifest.json  # actual local manifest; ignored
```

Git tracks only `manifest.schema.json`, `manifest.example.json`, `annotations.example.json`, scripts, and documentation. Do not force-add ignored media. The manifest forbids names, emails, GPS, and device identifiers by having no such schema fields.

Dataset versions:

- Pilot: `cupmaster-spout-pilot-v0`
- Expanded feasibility dataset: `cupmaster-spout-v0`

## Capture before tooling

Record 2–3 first-party videos of about 20–60 seconds for the Pilot. One available gooseneck is enough for this gate. Prioritize 90° and approximately 80°, while keeping every claimed angle in the v1 range 75–90°.

Capture static dripper negatives, spout entry without pouring, center/inner/middle/outer positions, small/large circles and spiral motion, water on/off, partial hand occlusion, exit, and re-entry. Include hard negatives such as hands/fingers, filter edges, dripper rims, spoons, handles, kettle body, and water without a locatable tip.

## Extract frames

The script requires an existing local `ffmpeg` executable but adds no npm or ML dependency. Output is restricted to the ignored `data/vision/frames` tree and does not overwrite by default.

```powershell
npm run vision:extract -- `
  --input data/vision/raw/capture-001/capture-001-a.mp4 `
  --output data/vision/frames/capture-001/capture-001-a `
  --start 00:05 `
  --end 00:12 `
  --fps 3 `
  --prefix capture-001-a
```

The script prints the source video's SHA-256 for the manifest. After extraction, manually select for tip position, orientation, apparent height/scale, motion, occlusion, pour state, and background relationship. Fixed-FPS output is a candidate pool, not the final dataset.

## Manifest workflow

1. Copy `data/vision/manifest.example.json` to ignored `data/vision/manifest.json`.
2. Add each capture session, source video, and selected frame.
3. Use the SHA-256 printed by the extraction script.
4. Assign split on each video; all frames inherit it.
5. Keep every capture session in one split. The validator also rejects identical source paths or hashes across splits.

Validate before annotation:

```powershell
npm run vision:validate -- --manifest data/vision/manifest.json
```

## Annotation workflow

Use CVAT or another established tool supporting rectangles, points/keypoints, visibility, and export. Do not build a CupMaster annotation UI.

For every positive frame:

- bbox: tightly enclose the visible narrow gooseneck/spout region, not the kettle body or water stream;
- `spout_tip`: center of the physical outlet where water leaves, whether water is on or off;
- `partially_occluded`: use only when the physical outlet remains locatable;
- `not_visible`: use when it would require guessing;
- optional Pilot audit only: `spout_neck_base` on 30–40 frames.
- QA reference only: annotate the dripper rim as a `dripper` ellipse. The normalizer uses the equal-area effective radius `sqrt(radiusX * radiusY)`, since an ellipse with radii `radiusX` and `radiusY` has the same area as a circle with that radius. This reference is not a model target.

Normalize the chosen annotation-tool export into the format in `annotations.example.json`. The normalized file deliberately preserves separate passes so 10–15 Pilot frames can be re-annotated blind and compared. Tool-specific conversion should be added only after the exact CVAT export flavor/version is selected; guessing that format now would create a brittle converter.

For a CVAT for images 1.1 export, normalize and retain a separate QA report with:

```powershell
npm run vision:normalize:cvat -- `
  --manifest data/vision/manifest.json `
  --pass data/vision/exports/pilot-v0/cvat-pilot-v0-pass1.zip `
  --pass data/vision/exports/pilot-v0/cvat-pilot-v0-pass2.zip `
  --output data/vision/annotations/pilot-v0.json `
  --qa-output data/vision/annotations/pilot-v0-cvat-qa.json
```

The importer reads `annotations.xml` directly from each ZIP, pairs passes by source image filename, and excludes CVAT job owner metadata. It refuses to emit normalized annotations if required shapes or dripper reference geometry are absent.

Validate manifest and normalized annotations together:

```powershell
npm run vision:validate -- `
  --manifest data/vision/manifest.json `
  --annotations data/vision/annotations/pilot.json
```

The JSON report includes:

- selected positive/negative and split counts;
- session/video leakage errors;
- double-annotated frame count;
- mean tip disagreement in pixels and normalized by dripper radius;
- mean bbox IoU;
- missing-tip count/rate;
- optional neck-base disagreement.

Metrics support review but do not automatically declare the Pilot passed. Review reflective/transparent frames and hard negatives visually, record the decision in `dataset-pilot-report.md`, and stop before expanding if the schema needs revision.

## Pilot gate checklist

- Select 30–50 diverse frames, approximately 70% positive and 30% negative.
- Blind double-annotate 10–15 frames.
- Audit neck base on 30–40 frames where possible.
- Run manifest, annotation, and leakage validation.
- Decide whether tip/bbox definitions are stable and whether neck base is retained.
- Only after PASS expand to 150–250 frames.
- Do not train a model in Task 9B.
