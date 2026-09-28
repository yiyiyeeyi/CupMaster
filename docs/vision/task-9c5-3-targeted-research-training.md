# Task 9C-5.3 — Targeted Research Training with Sessions 011–013

Status: **BLOCKED BEFORE TRAINING — manual annotation required**

Date: 2026-09-26  
Branch: `feature/camera-brew-runtime`  
Research data: sessions 001–004 plus proposed sessions 011–013  
Sealed external holdout: session-014

## Outcome

Targeted extraction and the annotation package are complete, but research training was not started because the existing model proposals fail visibly on the new domains. Treating those predictions as ground truth would train the model on incorrect outlet positions and make later cross-session evaluation circular.

This stop is required by the task's annotation rule: automated predictions may accelerate annotation only as proposals and must preserve manual review. No manually reviewed spout-tip coordinates currently exist for sessions 011–013.

## Data roles

| Sessions | Role | Research training eligible | Production training eligible |
| --- | --- | --- | --- |
| 001–004 | existing first-party development/analysis | yes | existing frozen status unchanged |
| 011–013 | external research material | **true** | **false** |
| 014 | sealed external holdout | no development access | false |

Session-014 was not opened, extracted, annotated, or passed through any model in this task. Sessions 005–010 were not accessed.

## Targeted extraction

Initial sparse candidates were selected from visually distinct preparation, pour, absence, lighting, scale, and interference windows. No active dataset manifest was modified.

| Session | Initial candidates | Positive-window hints | Negative-window hints | Exact/near-identical removals (dHash ≤1) | Annotation package |
| --- | ---: | ---: | ---: | ---: | ---: |
| 011 | 37 | 30 | 7 | 3 | **34** |
| 012 | 37 | 26 | 11 | 7 | **30** |
| 013 | 41 | 30 | 11 | 2 | **39** |
| Total | 115 | 86 | 29 | 12 | **103** |

The 30-frame session-012 package is below the approximate 35-frame target because the short edited source contains repeated/stationary imagery. Diversity was prioritized over quota filling. The selection hints are temporal triage only, not authoritative positive/negative labels; several broad active windows contain cuts where the physical outlet is not usable.

Coverage represented in the package includes small apparent brewer scale, rightward and edge-entering spouts, bright/reflective conditions, visible water, dark scenes, low-contrast regions, hands/preparation structures, and same-scene absence candidates.

All JPEGs and manifests remain under ignored `.vision-work` paths.

## Proposal audit and blocking evidence

The four Task 9C-5.2 LOSO Global→Local checkpoints were used as an ensemble proposal generator only. Median global and local coordinates were overlaid for visual review; no proposal was promoted to ground truth.

| Session | Positive-window hints | Global confidence ≥0.50 | Local confidence ≥0.50 | Joint ≥0.50 | Mean global confidence |
| --- | ---: | ---: | ---: | ---: | ---: |
| 011 | 30 | 5 | 29 | **5** | 0.270 |
| 012 | 26 | 0 | 21 | **0** | 0.033 |
| 013 | 30 | 1 | 3 | **1** | 0.044 |

These are not accuracy metrics because the window labels are not manual ground truth. They are proposal-triage evidence. Visual inspection confirms that most proposed tips lie in the upper background or another non-outlet region. Local confidence is sometimes high despite a semantically wrong crop/point, especially on sessions 011 and 012.

Consequences:

- Existing predictions cannot safely seed accepted annotations without point-by-point correction.
- Training on them would reinforce the current failure.
- Evaluating against the same predictions would create invalid self-agreement metrics.
- Bbox and dripper geometry cannot be fabricated from these failed proposals.

## Annotation package

Prepared artifacts:

- Upload ZIP: `.vision-work/datasets/task-9c5-3/task-9c5-3-annotation-images.zip`
- Package manifest: `.vision-work/datasets/task-9c5-3/annotation-package/annotation-package-manifest.json`
- Clean images: `.vision-work/datasets/task-9c5-3/annotation-package/images/`
- Proposal manifest: `.vision-work/datasets/task-9c5-3/proposal-manifest.json`
- Proposal contact sheets: `.vision-work/datasets/task-9c5-3/session-01{1,2,3}-proposal-contact-sheet.jpg`

The upload ZIP contains 103 clean images and the package manifest. Proposal points are not embedded in the clean images or encoded as annotations.

Required manual schema:

- usable positive: exactly one `spout_tip` point;
- analysis geometry where practical: one `gooseneck_spout` rectangle;
- normalization where practical: one `dripper` ellipse;
- intentional negative/unusable outlet: no `spout_tip` and no `gooseneck_spout`;
- `spout_neck_base` remains removed.

The reviewer must determine actual positive/negative status from the image and must not trust `selectionHintOnly` when a cut, occlusion, or off-frame outlet makes it wrong.

## Training and evaluation status

| Required output | Status |
| --- | --- |
| Training counts by authoritative positive/negative | unavailable until manual annotation |
| Global retraining | not started |
| Local refinement retraining | not started |
| Per-session 001–004/011–013 validation | not valid without 011–013 ground truth |
| Presence evidence evaluation | not valid without ground truth |
| Research checkpoint selection | not performed |
| Global ONNX export/parity | not performed |
| Local ONNX export/parity | not performed |
| Tracking reconnection | not performed |

## Next action

Annotate the 103-image ZIP in CVAT or VIA and export the result. CVAT for images 1.1 is preferred for compatibility with existing normalization tooling. After the reviewed export is supplied, the next run can:

1. normalize and validate the external-research annotations;
2. derive authoritative per-session positive/negative counts;
3. train session-aware Global→Local folds using 001–004 and 011–013;
4. select research checkpoints using worst-session criteria;
5. export and validate global/local ONNX models;
6. decide whether session-014 may be opened once, without tuning.

## Decision gate

1. Did targeted domain expansion improve robustness? **Not measurable yet.**
2. Did session-004 recover? **Not evaluated; no new model was trained.**
3. Do sessions 011–013 show catastrophic failures? **The old proposal system does, but authoritative post-training metrics require annotations.**
4. Is Global→Local still preferred? **Still the research architecture, but not revalidated here.**
5. Is keypoint-derived presence ready for temporal testing? **No.**
6. Ready to open session-014? **No.**

Proceed to session-014 holdout: **no**  
Session-014 accessed: **no**  
Sessions 005–010 accessed: **no**  
Production runtime modified: **no**
