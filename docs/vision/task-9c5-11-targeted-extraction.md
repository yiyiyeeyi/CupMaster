# Task 9C-5.11 Step 3 — Targeted Development Frame Extraction

## Result

A private, information-dense development annotation package has been prepared from training-eligible sessions 015–019.

- Total frames: **51**
- Positive candidates: **32 (62.7%)**
- Intentional-negative candidates: **19 (37.3%)**
- Status: **human annotation required; not training-ready**
- Training performed: **no**

Selection labels, appearance tags and distractor tags are review hints only. Human annotation remains authoritative.

## Private artifact locations

All generated data is under the gitignored local root:

`D:\Projects\CupMaster\.vision-work\datasets\task-9c5-11\`

| Artifact | Private local path |
|---|---|
| Selected JPEGs | `.vision-work/datasets/task-9c5-11/frames/` |
| Candidate selection manifest | `.vision-work/datasets/task-9c5-11/selection.json` |
| Enriched QA manifest | `.vision-work/datasets/task-9c5-11/review/enriched-selection.json` |
| QA summary | `.vision-work/datasets/task-9c5-11/review/qa-summary.json` |
| Review contact sheets | `.vision-work/datasets/task-9c5-11/review/contact-sheet-01.jpg` through `contact-sheet-04.jpg` |
| Annotation instructions | `.vision-work/datasets/task-9c5-11/annotation/README.md` |
| Annotation manifest | `.vision-work/datasets/task-9c5-11/annotation/annotation-manifest.json` |
| Annotation image ZIP | `.vision-work/datasets/task-9c5-11/annotation/task-9c5-11-images.zip` |
| Optional centerline nominations | `.vision-work/datasets/task-9c5-11/annotation/optional-centerline-candidates.json` |

The ZIP contains exactly 51 readable JPEG entries and passed archive integrity validation.

## Per-session distribution

| Session | Total | Positive candidates | Negative candidates | Primary contribution |
|---|---:|---:|---:|---|
| session-015 | 8 | 7 | 1 | dark/reflective/low-contrast outlet across a long pour; one same-scene hand/wet-bed negative |
| session-016 | 12 | 7 | 5 | reflective short-visible outlet across separate cycles; foam, hand, kettle/body and server negatives |
| session-017 | 10 | 5 | 5 | white/highlight/right-entry outlet; preparation, wet-bed and server-pour negatives |
| session-018 | 12 | 7 | 5 | white/highlight/low-contrast outlet; foam, hand/tool and server negatives |
| session-019 | 9 | 6 | 3 | exact outlet-visible water-off/water-on presence group and staged wet-bed negatives |

No session was forced to 16 frames. Counts reflect unique semantic contribution rather than equal quotas.

## Presence and water coverage

- Water-off visible-outlet positives: **2**
- Water-on visible-outlet positives: **30**
- Match groups: **5**
  - `session-015-dark-pour`
  - `session-016-cycles`
  - `session-017-white-pours`
  - `session-018-white-pours`
  - `session-019-presence-a`

`session-019-presence-a` is the strongest matched group:

- `00:00.000` and `00:00.500`: outlet visible, water off;
- `00:01.250`, `00:03.500`, `00:06.500`, `00:09.750`: outlet visible, water on;
- `00:13.000`, `00:25.000`, `00:42.000`: outlet absent with evolving wet-bed/rim/reflection state.

The two water-off frames are only 500 ms apart but were manually retained because the outlet position/scale changes visibly and this is the package's only exact water-off transition. No additional adjacent frames were taken from that interval.

## Semantic coverage

Counts below are non-exclusive selection hints on positive candidates:

| Appearance family | Candidate count |
|---|---:|
| dark or reflective | 20 |
| white or highlight | 12 |
| low contrast | 17 |
| short visible | 26 |

The package emphasizes semantic/presence diversity in the constrained V1 camera contract. Naturally available top/right boundary interactions are retained, but extreme physical-outlet truncation is not treated as a quota or blocking condition.

## Hard-negative coverage

Counts are non-exclusive selection hints on 19 intentional-negative candidates:

| Distractor | Candidate count |
|---|---:|
| hand | 10 |
| kettle body | 1 |
| shaft/tool-like structure | 1 |
| rim | 14 |
| wet bed | 15 |
| foam | 9 |
| reflection | 16 |
| server | 3 |

This includes matched or approximately matched examples with foam/rim reflections, hand interference, glass-server pours, kettle/body structure and outlet-absent wet beds. The candidate tags are not annotation truth.

## Duplicate and visual QA

Duplicate control combined timestamp spacing, 64-bit difference hashes and full contact-sheet review.

- Byte-identical duplicates: **0**
- Near-duplicate candidates removed: **2**
  - `session-015-t016000`: redundant continuous dark-pour state;
  - `session-018-t028000`: redundant white/foam pour state.
- Incorrect initial selection hints replaced after full-resolution review: **2**
  - `session-016-t176000` was hand/server without a valid outlet; replaced by clear positive `session-016-t162000`;
  - `session-018-t018000` was a powder whisk/tool, not a spout; replaced by clear positive `session-018-t019000`.

The difference-hash threshold still flags some deliberately retained frames because the camera is static. These were manually reviewed and retained only where one of the following materially changes:

- outlet presence versus absence;
- water-off versus water-on state;
- outlet pose or visible length;
- foam/wet-bed/reflection interference;
- separate pour cycle or distractor category.

MOV timestamp behavior was also checked explicitly. Frame extraction uses timestamp-addressed decoding, while the original sparse audit contact sheets were not used as frame identity authority because `fps/tile` presentation can be misleading around edits and non-monotonic timestamps.

## Human annotation contract

Human annotation required: **yes**.

For each confirmed positive:

- exactly one `gooseneck_spout` axis-aligned rectangle;
- exactly one `spout_tip` point at the physical liquid outlet center;
- one `dripper` ellipse/circle around the visible outer brewing-opening rim.

For each confirmed negative:

- no `gooseneck_spout`;
- no `spout_tip`;
- `dripper` where the opening is visible.

Do not add `spout_neck_base`. Centerline is not required for this package. Thirteen highest-value difficult positives are separately nominated for possible later centerline annotation, but that optional list does not change the initial annotation task.

No model-generated label proposal was inserted into the annotation package.

## Privacy and scope

- Raw media, extracted frames, manifests, annotation package, review sheets and QA artifacts remain under ignored local paths.
- Private dataset artifacts committed to GitHub: **no**
- Private dataset artifacts uploaded: **no**
- Training performed: **no**
- Session-014 accessed: **no**
- External benchmark sessions 005–010 accessed: **no**
- Production runtime/UI modified: **no**

