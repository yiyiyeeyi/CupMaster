# Task 9C-5.11 Step 2 — Session-019 Targeted Gap-Filling Audit

## Decision

Session-019 is **suitable for a small targeted extraction**, subject to frame-level review. It closes the outlet-visible water-off gap for one reflective top-entry setup and supplies an unusually short, top-boundary spout view plus same-shot water-on comparison and wet-bed negatives.

It does **not** create an additional independent white/light-spout domain, does not address right-edge truncation, and only partially closes the top-edge gap: the spout assembly is cut by the upper image boundary, but the physical outlet/opening remains visible and labelable rather than being severely truncated.

The user explicitly confirmed that session-019 is training-eligible. Its raw video and all generated audit artifacts remain local and gitignored.

## Scope and audit method

- Only `data/vision/raw/session-019.mov` was opened for new video inspection.
- Existing local contact sheets from the completed session-017/018 audit were used for the requested visual-independence comparison; their source videos were not reopened.
- Metadata was read with local `ffprobe`.
- The complete video and audio streams were decoded with `ffmpeg -v error -xerror`.
- Coverage was first inspected at one-second cadence, followed by a narrow 250 ms audit around the opening water transition. These are audit artifacts only, not dataset extraction.
- Session-014 and sessions 005–010 were not accessed.

## File audit

| Field | Result |
|---|---|
| Exact file | `data/vision/raw/session-019.mov` |
| Container | QuickTime/MOV |
| Video codec | HEVC/H.265 Main (`hvc1`) |
| Audio codec | AAC-LC, stereo, 44.1 kHz |
| Duration | 43.270 seconds |
| Resolution | 1036 × 1724 |
| Frame rate | 60 fps nominal; 59.649 fps average |
| Video frames | 2,581 |
| File size | 119,970,347 bytes (114.41 MiB) |
| Decode integrity | PASS — complete audio/video decode returned exit code 0; one non-monotonic DTS warning, no codec or frame decode failure |

The timestamp warning does not prevent visual sampling. Future extraction should use decoded video presentation timestamps rather than audio DTS. No transcode is required.

## Provenance and confidentiality

- Provenance/rights status: **user-confirmed training-eligible**.
- This audit does not infer whether the narrower administrative label should be `first_party` or `licensed_for_training`; the user confirmation is recorded without inventing a source class.
- Research training eligibility: **yes**, based on explicit user confirmation.
- Production training eligibility: **not inferred by this audit**.

The following are private local artifacts and must not be committed or uploaded: raw videos, extracted frames, annotations, datasets, checkpoints, predictions and evaluation artifacts.

Repository ignore verification:

- `/data/vision/raw/` ignores `session-019.mov`;
- `/.vision-work/` ignores generated audit contact sheets and detail frames.

No private dataset artifact was staged or committed.

## Visual timeline

| Approximate interval | Observation | Dataset role |
|---|---|---|
| 00:00.00–00:00.50 | reflective metal outlet is visible at the upper boundary; no water stream | rare water-off positive candidates; same-shot baseline |
| approximately 00:00.75–00:11.00 | outlet remains at/near the upper boundary with visible water stream | water-on positives; top-entry and short-visible cases |
| approximately 00:11.00–00:43.27 | outlet absent; white dripper, wet/expanded bed, foam/reflection and editorial graphics remain | same-scene/approximately matched negatives and wet-bed/rim hard negatives |

The video is edited and contains large burned-in Chinese text and instructional graphics. Candidate selection must avoid frames where overlays materially cover the target or create an artificial feature shortcut. The long negative section is visually repetitive; only a small number of diverse negatives should be selected.

## Coverage audit

| Gap / condition | Rating | Evidence and limitation |
|---|---|---|
| 1. Outlet-visible water-off positives | **strong** | clearly visible reflective outlet with no stream at approximately 00:00.00–00:00.50; brief but contains enough frames for one or two unique candidates |
| 2. Top-edge physical outlet truncation | **partial** | the spout assembly enters through and is cropped by the upper boundary; the outlet/opening remains visible and labelable, so severe outlet truncation is still absent |
| 3. Right-edge physical outlet truncation | **absent** | target is top-entry, not right-entry |
| 4. Independent white/light-spout domain | **absent** | highly reflective chrome/metal spout, not a white/light spout; it is a distinct visual domain but not the missing white-domain replicate |
| 5. Short-visible spout | **strong** | only a compact terminal section is visible near the top boundary |
| 6. Dark reflective spout | **partial** | reflection challenge is strong, but the physical outlet is bright chrome rather than dark/black |
| 7. Hard negatives | **strong** | outlet-absent wet bed, foam/highlights, dripper/rim and reflection dominate 00:11–00:43; no strong hand/tool or kettle-body negative |
| 8. Water-on/water-off matched opportunities | **strong** | exact continuous-shot transition from visible outlet/no water to visible outlet/water on; later absence negatives are approximate matches in the same composition |

### Match quality

- Water-off versus water-on: **exact** for the opening transition—same camera, dripper, lighting, background and nearly the same outlet pose.
- Positive versus wet-bed/rim negatives: **approximate**—same composition/source scene, but later coffee-bed state and editorial overlays change.
- Hand/tool/kettle-body matched negatives: **unmatched/absent**.

## Independence from sessions 017 and 018

Session-019 is visually different from both previous white/highlight candidates:

| Factor | Session-019 comparison |
|---|---|
| Kettle/spout appearance | compact reflective chrome outlet entering from the top; 017/018 use a longer white/light shaft entering from the right |
| Lighting | harder specular metal highlights and warmer tabletop tones |
| Background | gray/yellow close tabletop rather than the darker staged background seen in 017/018 |
| Dripper | large white paper-lined transparent brewer; materially different from the clear/white and blue-patterned setups |
| Camera position | tight overhead/top-entry composition rather than oblique right-entry framing |
| Composition | brewer fills most of the portrait frame; very short terminal spout view |
| Source style | still instructional/edit-heavy with Chinese overlays, so editorial-source correlation remains despite the different scene |

Independence conclusion:

- As a **general reflective top-entry domain**, session-019 is sufficiently different from 017/018 to add useful independent visual coverage.
- As an **additional independent white/light-spout domain**, it does not qualify because the spout is chrome/reflective rather than white/light.

## Gap-closing decision

### Does session-019 close the missing water-off gap?

**Yes, for one setup.** It provides an exact same-shot visible-outlet water-off to water-on transition. It does not replace the need for water-off examples in the other critical appearance families.

### Does it close the top-edge outlet gap?

**Partially.** It closes the top-entry/short-visible boundary interaction gap. A severe case where the physical outlet/opening itself is partly cut off remains missing.

### Does it improve white-domain independence?

**No.** It improves overall domain diversity, but is not a white/light-spout replicate.

### Is it suitable for targeted frame extraction?

**Yes.** Recommended later extraction scope is deliberately small:

- 1–2 unique water-off positives from approximately 00:00.00–00:00.50;
- 3–5 water-on positives spanning target position/stream variation within approximately 00:00.75–00:11.00;
- 2–4 diverse negatives from approximately 00:11.00–00:43.27, emphasizing wet-bed, foam/reflection and clean outlet absence;
- exclude near-duplicates, overlay-obscured frames and any frame where the physical outlet cannot be confidently localized.

This recommendation does not perform extraction. The short water-off interval must not be inflated into many adjacent duplicates.

## Gaps remaining after adding session-019

1. severe top-edge truncation where the physical outlet/opening itself is partially cropped but still labelable;
2. right-edge truncation of the physical outlet, rather than only the shaft;
3. a materially independent second white/light-spout setup relative to sessions 017/018;
4. visible-outlet water-off examples for white/right-edge and dark/reflective families beyond this one chrome top-entry setup;
5. stronger matched hand/tool, kettle-body/shaft and reflection-only negatives in the weak session-015-like dark setup;
6. clean examples without persistent editorial text/graphics, to reduce shortcut risk.

Session-019 need not cover every remaining gap to be useful. Its strongest contribution is the exact water-off/water-on contrast plus the short reflective top-boundary outlet.

## Scope confirmation

- Training performed: **no**
- Dataset frames extracted: **no**
- Audit-only local frames/contact sheets generated: **yes**, under gitignored `.vision-work/`
- Session-014 accessed: **no**
- External benchmark sessions 005–010 accessed: **no**
- Production runtime/UI modified: **no**
- Private dataset artifacts committed to GitHub: **no**
- Private dataset artifacts uploaded: **no**

