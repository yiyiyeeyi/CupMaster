# Task 9C-5.3 Step 0 — Targeted Session Provenance and Coverage Audit

Status: **BLOCKED AT DATA-ELIGIBILITY GATE**

Date: 2026-09-26  
Branch: `feature/camera-brew-runtime`  
Scope: raw sessions 011–014 only

## Decision

Do **not** proceed to targeted frame extraction or model development from these files yet.

No repository metadata or user-provided declaration establishes ownership or a training license for sessions 011–014. All four containers identify their author as `ReplayKitRecording`, which establishes screen capture—not ownership of the underlying footage. The permitted visual audit of sessions 011–013 also shows burned-in captions, platform-style interface/watermark elements, speed labels, and edited transitions. These observations do not prove third-party ownership, but they make a silent first-party classification especially unsafe.

Pending explicit provenance, each file is classified as:

- `rightsStatus: rights_unknown`
- `sourceType: external_reference`
- `productionTrainingEligible: false`

Session-014 remains locked and was not visually inspected. Its file metadata is insufficient to establish that it is an independent natural first-party capture, so it is not currently eligible to serve as the final first-party holdout.

## File and integrity audit

| Session | Exact file | Container | Video codec | Audio | Duration | Resolution | Average FPS | Frames | Size |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 011 | `data/vision/raw/session-011.mov` | QuickTime/MOV | HEVC/H.265 | AAC | 113.460 s | 1034×1840 | 60.011 | 6,808 | 311,759,702 bytes / 297.32 MiB |
| 012 | `data/vision/raw/session-012.mov` | QuickTime/MOV | HEVC/H.265 | AAC | 53.945 s | 1032×1840 | 60.024 | 3,238 | 149,723,299 bytes / 142.79 MiB |
| 013 | `data/vision/raw/session-013.mov` | QuickTime/MOV | HEVC/H.265 | AAC | 144.693 s | 1034×1840 | 60.023 | 8,685 | 403,298,452 bytes / 384.62 MiB |
| 014 | `data/vision/raw/session-014.mov` | QuickTime/MOV | H.264/AVC | AAC | 90.938 s | 1032×1384 | 59.997 | 5,456 | 238,807,108 bytes / 227.74 MiB |

All four files pass full video-stream decode with exit code 0 and no pixel decode error. Each produces at least one non-monotonic DTS warning during null-output decoding. They are readable, but future timestamp-sensitive extraction must account for minor timestamp anomalies rather than assuming perfectly monotonic decode timestamps. No file was transcoded.

SHA-256 identities:

| Session | SHA-256 |
| --- | --- |
| 011 | `b280c6116a231765ffc72576ff63c465caf3e1bdd006174959b45e0c4da003d0` |
| 012 | `ccb6fef59f745111a6063b6b9d5d67f100f93184f4119691cea94f4625411ca7` |
| 013 | `82663402f13964b1c9ffda36278f5ed05225033a72590b1e223320148c224dfc` |
| 014 | `236be0739c7079dd35db990181d60d9874807c8fc01920c7e3f42cf142c61970` |

## Provenance and rights

| Session | Repository provenance | Container evidence | Classification | Training eligible |
| --- | --- | --- | --- | --- |
| 011 | none found | QuickTime author `ReplayKitRecording`; edited/platform-style visual content | `rights_unknown`; isolate as `external_reference` | **false** |
| 012 | none found | QuickTime author `ReplayKitRecording`; edited/platform-style visual content | `rights_unknown`; isolate as `external_reference` | **false** |
| 013 | none found | QuickTime author `ReplayKitRecording`; edited/platform-style visual content | `rights_unknown`; isolate as `external_reference` | **false** |
| 014 | none found | QuickTime author `ReplayKitRecording`; no visual inspection performed | `rights_unknown`; isolate as `external_reference` | **false** |

`ReplayKitRecording` means the MOV was captured from a device screen. It does not demonstrate that the underlying video was created by the recorder or licensed for model training. Filename, local possession, creation timestamp, and screen-recording authorship are not substitutes for rights provenance.

To change eligibility, record an explicit source statement for every session: original creator/recorder, whether the underlying footage is owned by the contributor, whether third-party platform content is involved, and the granted model-training/production rights. If these are screen captures of third-party posts, replace them with first-party or clearly licensed raw captures.

## Session-011 — development candidate A

### Lightweight visual timeline

The timeline is approximate to the five-second contact-sheet cadence and is intended only for coverage triage.

| Approximate time | Observation |
| --- | --- |
| 00:00–00:10 | Intro/preparation; brief hand interaction and target-absent opportunities |
| 00:10–00:50 | First active-pour sequence; spout visible from upper/right region, water visible |
| 00:50–00:58 | Edited transition / target absence |
| 00:58–01:43 | Second active-pour sequence; varied pour positions and visible water |
| 01:43–01:53 | Serving/hand interaction; kettle spout absent |
| 01:53–01:53.46 | Empty/end scene |

Coverage assessment:

| Intended/observed item | Coverage | Notes |
| --- | --- | --- |
| Active spout visibility | strong | two long edited pour sequences |
| Absence / negative intervals | strong | preparation, inter-part transition, serving/end |
| Smaller apparent dripper scale | strong | brewer opening is materially smaller in-frame than the earlier close overhead sessions |
| Rightward tip positions | strong | outlet frequently occupies center-right/right region |
| Top-edge entry/truncation | partial | kettle/spout assembly enters from upper/right edge; physical outlet is usually still visible |
| Reflection/highlight | partial | metallic outlet/highlight present; main kettle/spout is dark |
| Visible water | strong | clear stream across both pour sequences |
| Dark background/brewer | strong | dark upper background and black kettle/spout |
| Low local contrast | partial | dark spout neck overlaps dark background in some views, while outlet remains relatively distinct |
| Hand/interference | partial | preparation/serving hands; limited obstruction during active tip localization |
| Paired positive/negative opportunity | strong | same overall visual setup includes pour and absence states, though edited |

Operational note: burned-in captions, interface/watermark elements, speed labels, and a `PART 01`/`PART 02` transition are present. This is not raw continuous capture.

## Session-012 — development candidate B

### Lightweight visual timeline

| Approximate time | Observation |
| --- | --- |
| 00:00–00:10 | Product/preparation views; useful absence/negative opportunities |
| 00:10–00:21 | Active pour; bright white spout and clearly visible water |
| 00:21–00:25 | Brief absence/edited transition |
| 00:25–00:40 | Second active-pour sequence; closer scale and high highlights |
| 00:40–00:53.95 | Late bed/end views and hand interaction; target mostly absent |

Coverage assessment:

| Intended/observed item | Coverage | Notes |
| --- | --- | --- |
| Active spout visibility | strong | two clear pour windows |
| Absence / negative intervals | strong | opening and ending segments |
| Dripper apparent scale | large/close | useful scale diversity, but not the targeted small-scale regime |
| Tip position range | partial | mainly right-side entry with limited full-frame travel |
| Top-edge interaction | absent/weak | entry is predominantly from the right rather than top |
| Reflection/highlight | strong | very bright kettle/spout and bright background regions |
| Visible water | strong | distinct water stream |
| Dark background/brewer | partial | dark background objects contrast with bright brewer/spout |
| Low local contrast | absent/weak | bright spout is generally distinct from the scene |
| Hand/interference | partial | preparation/end interaction, little active-pour occlusion |
| Paired positive/negative opportunity | strong | present and absent states in the same edited scene |

Operational note: captions and platform-style overlays are burned in, with multiple camera-scale/cut changes.

## Session-013 — development candidate C

### Lightweight visual timeline

| Approximate time | Observation |
| --- | --- |
| 00:00–00:35 | Grinder, dosing, filter, and hand preparation; strong negative/hard-negative opportunity |
| 00:35–02:05 | Repeated active-pour views with white spout/water; edited changes in side, scale, and pour phase |
| 02:05–02:24.69 | Server/cup handling and end scene; target absent, hands present |

Short target absences and cut transitions occur inside the broad active interval; it must not be treated as one continuous tracking sequence.

Coverage assessment:

| Intended/observed item | Coverage | Notes |
| --- | --- | --- |
| Active spout visibility | strong | many pour views across an extended edited interval |
| Absence / negative intervals | strong | long preparation and serving/end phases |
| Dripper apparent scale | large/close | mainly close framing, not small-scale coverage |
| Tip position range | strong | entry alternates across side/top regions due edited views |
| Top-edge interaction | partial | some upper/side entry; not a stable top-truncation sequence |
| Reflection/highlight | partial | white/bright spout and water highlights, limited metallic reflection |
| Visible water | strong | stream visible in many views |
| Dark background/brewer | strong | dark tabletop and dark brewer body |
| Low local contrast | partial | some white-on-filter/foam regions reduce local separation; other views are high contrast |
| Hand/interference | partial | strong during preparation/end, limited evidence of sustained tip occlusion during pour |
| Paired positive/negative opportunity | strong | same broad setup contains many present/absent views, with edit caveat |

Operational note: captions, platform-style overlays, and many edited cuts are present. It is unsuitable for continuous temporal evaluation.

## Session-014 — final holdout candidate D

Only non-visual file/integrity checks were performed.

- File exists and is readable.
- Duration: 90.938 seconds.
- Resolution: 1032×1384.
- Average FPS: 59.997.
- Video/audio: H.264 + AAC in QuickTime/MOV.
- Container author: `ReplayKitRecording`.
- Repository provenance: none found.
- Rights: `rights_unknown`.
- `sourceType: external_reference` pending proof.
- `productionTrainingEligible: false`.
- Final first-party holdout eligible: **no, not currently established**.
- Independence/natural-scene status: **unknown; not visually audited**.
- `holdoutLocked: true`.
- Model access: none.
- Extracted frames/contact sheets: none.

Session-014 must remain locked. Even if a later provenance statement clears training/evaluation rights, its first-party and independence status must be established before it can be designated the final holdout. Prefer replacing it with a new raw camera recording that was never published, edited, screen-recorded, or viewed during development.

## Combined 011–013 coverage

| Required gap | Combined coverage | Primary source |
| --- | --- | --- |
| Small dripper scale | **strong** | 011 |
| Rightward tip | **strong** | 011, 012 |
| Top-edge truncation | **partial** | 011, 013 |
| Reflection | **partial** | bright/highlight coverage is strong; true reflective-metal variation is limited |
| Visible water | **strong** | all three |
| Dark background/brewer | **strong** | 011, 013 |
| Low local contrast | **partial** | 011 dark-on-dark neck; some 013 white-on-light regions |
| Hand interference | **partial** | mostly preparation/end rather than active-tip obstruction |
| Paired positive/negative opportunity | **strong, with edit caveat** | all three |

The candidate pool visually addresses much of the requested appearance diversity, but top-edge truncation, true reflective-metal variation, low-contrast outlet localization, and active-pour hand occlusion remain incomplete. More importantly, coverage cannot override rights ineligibility.

## Data-eligibility gate

1. **Are sessions 011–013 eligible for model development?** No. Rights and original-source provenance are unknown; they must remain external references.
2. **Do they collectively cover the targeted gaps?** Partially. Small scale, rightward positions, visible water, dark scenes, and paired-state opportunities are present; several harder conditions are only partial.
3. **Is session-014 eligible as a future final first-party holdout?** No, not currently. Rights, first-party origin, and independence are unestablished.
4. **Are any sessions external/reference material?** All four must be treated as external/reference unless explicit provenance proves otherwise.

**Proceed to targeted frame extraction: no.**

Minimum resolution:

- provide explicit underlying-footage ownership/training-license provenance for each file; or
- replace sessions 011–013 with raw first-party camera captures covering the same conditions;
- replace session-014 with a genuinely unseen raw first-party session and keep it sealed.

## Artifacts and discipline

Only sessions 011–013 have ignored visual-review artifacts:

- `.vision-work/eval/task-9c5-3/session-011-contact-sheet.jpg`
- `.vision-work/eval/task-9c5-3/session-012-contact-sheet.jpg`
- `.vision-work/eval/task-9c5-3/session-013-contact-sheet.jpg`

No visual artifact was generated for session-014.

- Training performed: no
- Session-014 model access: no
- Session-014 visual/domain inspection: no
- Sessions 005–010 accessed: no
- Dense annotations created: no
- Production runtime modified: no
