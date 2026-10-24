# Task 9C-5.11 Step 1 — New Session Integrity + Coverage Audit

## Decision

The four files are readable and contain useful critical-case material, but the set is **not ready for targeted training-frame extraction**.

Two independent gates remain open:

1. provenance/usage rights were not supplied, so all four sessions remain `rights_unknown` and are not training-eligible;
2. the recordings do not provide the planned visible-outlet water-on/water-off contrast, and the dark pair does not show the physical outlet at or truncated by the top image edge.

No model training or dataset extraction was performed. The audit used only sessions 015–018.

## Audit method

- Container and stream metadata were read with the local `ffprobe` executable.
- Each complete video and audio stream was decoded with `ffmpeg -v error -xerror`; no transcoding was performed.
- Visual coverage was reviewed from temporary audit contact sheets sampled every 2 seconds. Therefore all intervals below are approximate and are intended for coverage classification, not annotation timestamps.
- Editorial cuts, subtitles and transitions were treated as extraction exclusions, not as domain coverage.

## File integrity

| Session | Exact filename | Container / streams | Duration | Resolution | FPS | File size | Decode result |
|---|---|---|---:|---:|---:|---:|---|
| 015 | `data/vision/raw/session-015.mov` | QuickTime/MOV; HEVC/H.265 video; AAC audio | 126.990 s | 1086 × 1742 | 60 nominal; 60.020 average | 350,712,539 bytes (334.47 MiB) | Readable; full decode completed. Three non-monotonic audio DTS warnings; no codec/decode failure. |
| 016 | `data/vision/raw/session-016.mov` | QuickTime/MOV; HEVC/H.265 video; AAC audio | 182.147 s | 1286 × 1764 | 60 nominal; 60.008 average | 504,663,781 bytes (481.28 MiB) | Readable; full decode completed. Three non-monotonic audio DTS warnings; no codec/decode failure. |
| 017 | `data/vision/raw/session-017.mov` | QuickTime/MOV; HEVC/H.265 video; AAC audio | 37.908 s | 1030 × 1732 | 60 nominal; 59.248 average | 103,739,563 bytes (98.93 MiB) | Readable; full decode completed with no reported warning. |
| 018 | `data/vision/raw/session-018.mov` | QuickTime/MOV; HEVC/H.265 video; AAC audio | 76.627 s | 848 × 1668 | 60 nominal; 60.018 average | 213,407,129 bytes (203.52 MiB) | Readable; full decode completed. One non-monotonic audio DTS warning; no codec/decode failure. |

The DTS warnings affect timestamp monotonicity in the audio stream, not visual decodability. If these videos are later sampled, timestamps should be derived from decoded video presentation timestamps rather than audio DTS. No analysis transcode is currently required.

## Provenance

No user-provided provenance or license record was found in the supplied task context. Rights are therefore not inferred from filenames, visual appearance, or storage location.

| Session | Provenance status | Research training eligibility | Production training eligibility |
|---|---|---|---|
| 015 | `rights_unknown` | not established | not established |
| 016 | `rights_unknown` | not established | not established |
| 017 | `rights_unknown` | not established | not established |
| 018 | `rights_unknown` | not established | not established |

Before extraction for training, each session needs an explicit provenance record such as `first_party` or `licensed_for_training`. The audit does not classify any file as `external_reference`; that would also require supplied provenance.

## Session 015 — dark reflective / top-edge A

### Observed intervals and opportunities

- Spout visible: approximately 00:00–02:03, nearly continuous across the edited pour.
- Clear absence/negative opportunity: approximately 02:04–02:07 at the tail; very limited.
- Water on: approximately 00:00–02:03 whenever the outlet is visible.
- Water off with outlet visible: not observed in the 2-second audit.
- Hand/tool distractor: not observed as a useful absent-outlet negative.
- Kettle body/shaft distractor: the tube is visible during positives; no clean absent-outlet shaft-only negative was observed.
- Rim/reflection/wet-bed distractors: abundant, but mostly coexist with the visible outlet and therefore are not negatives.
- Edge interaction: the spout tube enters from the upper frame, but the physical outlet remains well inside the image above the dripper.
- Short-visible opportunity: not observed; outlet geometry is generally clear and sustained.
- Editorial exclusions: large burned-in subtitles and edited presentation content occur throughout.

### Intended-role coverage

| Condition | Rating | Match quality | Evidence |
|---|---|---|---|
| dark spout | strong | — | dark/black gooseneck is continuously visible |
| reflective spout | partial | — | specular highlights exist, but reflection severity is modest |
| top-edge / outlet truncation | absent | unmatched | tube enters from above; the outlet itself is not near or cut by the top edge |
| water on | strong | unmatched | long continuous pour |
| water off, outlet visible | absent | unmatched | no clear example observed |
| same-scene matched negatives | partial | approximate | only a short outlet-absent tail; insufficient state diversity |

Extraction readiness: **no** for the planned targeted set. It has many usable dark/water-on positives, but lacks water-off positives, true top-edge outlet cases and enough matched negatives. Provenance is also unresolved.

## Session 016 — dark reflective / top-edge B

### Observed intervals and opportunities

- Repeated spout-visible/water-on cycles occur approximately at 00:00–00:04, 00:10–00:12, 00:20–00:22, 00:30–00:32, 00:44–00:46, 00:54–00:56, 01:10–01:12, 01:24–01:26, 01:36–01:40, 01:50–01:52, 02:04–02:06, 02:16–02:20, 02:30–02:34, 02:46–02:48 and 02:56–03:00.
- The gaps between those cycles supply many same-setup absence opportunities with dripper, wet bed, foam and rim highlights.
- Water off with outlet visible: not clearly observed at the 2-second cadence; sub-second entry/exit transitions must not be assumed valid.
- Hand/tool distractors: strong near approximately 02:44–03:00.
- Kettle body/shaft distractors: strong; the glossy red/dark kettle body and metal tubing appear in several transitions.
- Rim/reflection/wet-bed distractors: strong and often present without the outlet.
- Edge interaction: kettle and shaft enter from the upper frame, but the physical outlet remains inside the frame rather than top-truncated.
- Short-visible opportunity: partial, limited to entry/exit transitions; do not select blurred transition frames.

### Intended-role coverage

| Condition | Rating | Match quality | Evidence |
|---|---|---|---|
| dark spout | partial | — | dark/red kettle body, but the outlet tube is bright metal rather than dark |
| reflective spout | strong | — | strong metal and body reflections |
| top-edge / outlet truncation | absent | unmatched | upper entry affects kettle/tube, not the physical outlet |
| water on | strong | approximate | many repeated pour cycles |
| water off, outlet visible | absent | unmatched | not clearly observed |
| same-scene matched negatives | strong | approximate | repeated outlet-absent wet-bed/rim/hand/body frames in the same setup |

Extraction readiness: **no** for the complete planned role, despite strong positive and negative opportunities. It lacks verified water-off positives and actual top-edge outlet truncation, and provenance is unresolved.

## Session 017 — white/highlight / right-edge A

### Observed intervals and opportunities

- Spout visible: approximately 00:02–00:05 and 00:18–00:23.
- Absence/negative opportunities: approximately 00:00–00:01, 00:06–00:17 and 00:24–00:37.
- Water on: both visible-spout sequences.
- Water off with outlet visible: not observed.
- Hand/tool distractors: strong around 00:00 and 00:10–00:16.
- Kettle body/shaft distractors: limited; the white shaft is predominantly coupled to a valid outlet.
- Rim/reflection/wet-bed distractors: strong during the outlet-absent preparation and post-pour scenes.
- Edge interaction: the white shaft enters/crops at the right image boundary, but the physical outlet remains well inside the image.
- Short-visible opportunity: partial; the visible assembly is short, although the outlet itself is clear.
- Editorial exclusions: frequent hard cuts and burned-in subtitles.

### Intended-role coverage

| Condition | Rating | Match quality | Evidence |
|---|---|---|---|
| white/light/highlight spout | strong | — | bright white assembly under high-key lighting |
| right-edge / truncation | partial | approximate | shaft crosses the right edge; outlet is not edge-truncated |
| short-visible segment | partial | — | short visible shaft, but not a severely shortened outlet view |
| water on | strong | approximate | both positive sequences pour visibly |
| water off, outlet visible | absent | unmatched | no clear example observed |
| same-scene matched negatives | strong | approximate | hand, wet bed, rim and empty/post-pour states share the overall setup |

Extraction readiness: **no** for the planned matched set. White/highlight positives and hard negatives are useful, but visible-outlet water-off is absent, right-edge severity is weaker than requested, and provenance is unresolved.

## Session 018 — white/highlight / right-edge B

### Observed intervals and opportunities

- Spout-visible/water-on sequences occur approximately at 00:18–00:22, 00:28–00:40 and 00:44–01:03, separated by editorial cuts.
- Absence/negative opportunities occur approximately at 00:00–00:17, 00:23–00:27, 00:41–00:43 and 01:04–01:16.
- Water off with outlet visible: not observed.
- Hand/tool distractors: strong in the preparation section and approximately 01:08–01:14.
- Kettle body/shaft distractors: limited; the white shaft usually appears with the valid outlet.
- Rim/reflection/wet-bed distractors: strong; foam/highlight and wet-bed states are prominent.
- Additional hard negatives: server/container pours around 01:10–01:14 provide water-like and vessel/reflection confusion without a gooseneck outlet.
- Edge interaction: the white shaft is cropped by the right image edge throughout many positives; the physical outlet remains inside the frame.
- Short-visible opportunity: partial to strong because only a short terminal assembly is visible in several crops.
- Editorial exclusions: hard cuts and burned-in subtitles occur throughout.

### Intended-role coverage

| Condition | Rating | Match quality | Evidence |
|---|---|---|---|
| white/light/highlight spout | strong | — | white/highlighted spout under bright lighting |
| right-edge / truncation | partial | approximate | shaft is right-cropped, but the outlet is not at the boundary |
| short-visible segment | strong | — | several positives expose only a short terminal section |
| water on | strong | approximate | several pour sequences |
| water off, outlet visible | absent | unmatched | no clear example observed |
| same-scene matched negatives | strong | approximate | preparation, foam/rim, hand and server-pour negatives occur in the same overall scene |

Extraction readiness: **no** for the planned matched set. It contains useful white/highlight short-visible positives and hard negatives, but no verified water-off positive, only partial right-edge outlet severity, and unresolved provenance.

## Cross-session independence

### Session 015 versus 016

**Sufficiently independent visually: yes.** They differ materially in kettle/spout appearance, dripper/server, background, lighting, resolution/framing and temporal pour pattern. Session 015 uses a dark continuous gooseneck scene with persistent subtitles; session 016 uses a glossy red/dark kettle body and bright metal outlet in repeated cycles. This is adequate visual independence for session-aware evaluation if rights are later established.

It does not solve the target-family gap: neither session contains true top-edge truncation of the physical outlet, and neither supplies verified outlet-visible water-off frames.

### Session 017 versus 018

**Sufficiently independent for a strict domain holdout: no.** The dripper and framing differ, but the pair appears highly correlated in tabletop/background, bright lighting, white spout style, editorial overlays and capture/presentation style. It is useful as two clips or scene variants, but should not be treated as two fully independent white-spout domains without provenance/setup metadata showing otherwise.

## Combined coverage

| Required condition | Combined rating | Sessions | Remaining issue |
|---|---|---|---|
| dark reflective | strong | 015, 016 | 016 outlet is bright metal; nevertheless the pair provides two reflective appearances |
| top-edge outlet interaction | absent | none | upper-frame tube/kettle entry is not physical-outlet truncation |
| white/highlight | strong | 017, 018 | pair is highly correlated |
| right-edge outlet interaction | partial | 017, 018 | shaft is cropped; outlet remains inside the image |
| short-visible | partial | 016, 017, 018 | strongest in 018; few deliberately graded visibility levels |
| water on | strong | all four | ample examples |
| water off with outlet visible | absent | none verified | mandatory matched-positive state is missing |
| same-scene hard negatives | strong overall | 016, 017, 018; weak in 015 | match is approximate, not exact; 015 has too few negatives |

The videos contain useful distractor classes: hand/tool, kettle body, shaft-like geometry, rim highlights, wet bed/foam, server reflection and empty/neutral dripper states. Session 018 additionally contains a non-gooseneck server pour that may be a valuable water-like hard negative after annotation-policy review.

## Extraction-readiness gate

| Session | Enough positives | Enough negatives | Water-on/off variation | Suitable now |
|---|---|---|---|---|
| 015 | yes for water-on only | no | no | no |
| 016 | yes for water-on | yes | no verified water-off | no |
| 017 | yes for water-on | yes | no | no |
| 018 | yes for water-on | yes | no | no |

Proceed to targeted frame extraction: **no**.

Minimum actions before extraction:

1. record explicit provenance/rights for each of sessions 015–018;
2. add dark-spout, physical-outlet top-edge/truncation clips with the outlet visibly identifiable, including water-off, in two independent setups;
3. add visible-outlet water-off clips for the white/right-edge family;
4. make the second white/highlight setup materially independent from the first, preferably changing kettle/spout plus lighting or background;
5. strengthen session 015 with same-setup outlet-absent/hand/reflection negatives.

Only these missing states need supplemental capture. A broad dataset collection is not required. Existing water-on sequences and the strong negatives in 016–018 need not be repeated.

## Safety and scope record

- Training performed: **no**
- Session-014 accessed: **no**
- External benchmark sessions 005–010 accessed: **no**
- Production runtime/UI modified: **no**
- Frames materialized for dataset/annotation: **no**
- Transcoding performed: **no**

