# Spout-tip vision research

Status: Task 9A decision record
Accessed: 2026-09-17
Scope: research only; no model, dependency, runtime, UI, persistence, or Supabase change

## Frozen v1 problem

CupMaster v1 supports **top-down / near-top-down pour-over brewing only**:

- the camera is above the dripper, points approximately downward, and remains relatively fixed during a brew;
- the complete dripper and coffee bed are visible;
- a gooseneck spout normally enters from outside the brew area;
- arbitrary camera placement, 45-degree live analysis, 3D reconstruction, arbitrary kettle types, arbitrary occlusion, and arbitrary backgrounds are out of scope.

The vision contract is deliberately small:

```text
Dripper reference + spout tip + time
spout_tip = (x, y, t)
```

The model predicts image coordinates. A separate geometry layer converts those coordinates relative to the user-aligned dripper center and radius. The model must not learn recipe geometry.

## Candidate tasks

### Option A — object detection

Train one class, `gooseneck_spout`, and return a bounding box around the visible narrow neck/spout region.

Benefits:

- simplest annotation and fastest baseline;
- a detector supplies a useful region of interest and a confidence score;
- mature lightweight ONNX-exportable families exist, including YOLOX Nano/Tiny and Ultralytics nano detection models.

Costs and risks:

- a box does not identify the physical outlet;
- choosing a box corner or the box point nearest the dripper is unstable when the spout rotates, crosses the dripper center, is foreshortened, or is partially occluded;
- boxes fitted to only the visible region change shape under occlusion, which moves any derived tip even when the physical tip barely moves;
- including the kettle body would make the box more visually stable but less spatially relevant and frequently push most of the object out of frame. The baseline therefore boxes only the visible narrow neck/spout.

Detection is valuable as a baseline and possible future coarse stage, but bbox-to-tip heuristics are not an acceptable final trajectory source without measured evidence.

### Option B — pose / semantic keypoint

Train the same object class and directly predict `spout_tip`. Pose heads normally associate keypoints with an instance box. Ultralytics documents custom pose labels with an arbitrary `kpt_shape`, optional visibility, pose ONNX export, and `(N, K, 2/3)` results. A one-keypoint dataset is representable by that format; the open question is learnability from CupMaster data, not file-format support.

Benefits:

- directly optimizes the product quantity of interest;
- avoids angle-dependent bbox-tip heuristics;
- produces a natural measurement for smoothing, tracking, normalized error, and trajectory comparison;
- can later add structural landmarks without changing the canonical trajectory contract.

Costs and risks:

- point placement needs stricter annotation QA than a box;
- a tiny reflective opening can be ambiguous under blur, steam, water, glare, or hand occlusion;
- pose tooling is often optimized and pretrained for people or animals, so transfer benefit to a kettle spout is uncertain;
- the model still needs a box or visual context large enough to distinguish the outlet from reflections and dripper edges.

#### One versus two keypoints

Schema A is `spout_tip`. Schema B adds `spout_neck_base`, allowing `orientation = tip - neck_base`. Orientation could reject impossible predictions, stabilize tracking, and help infer a temporarily obscured tip.

For the 150–250-frame feasibility set, **use Schema A: one required keypoint**. A gooseneck's physical neck base is often off-frame, hidden by the hand/body, or visually ambiguous, while the product needs only the outlet. Making it required would spend scarce labels on a less consistent target and could reduce usable frames. Retain the spout bbox as context. During Task 9B, double-annotate an optional 30–40-frame audit subset with `spout_neck_base`; promote it only if two annotators can place it consistently and it is visible in most claimed v1 scenes. This is an audit field, not part of the first training schema.

### Option C — segmentation (deferred)

A mask of the full visible spout/neck preserves contour and orientation and could support geometry beyond a point. It also has the highest annotation cost, larger output/decoding cost, and still needs a rule to turn a mask into the physical outlet under reflections, water, and occlusion. That is disproportionate to the current trajectory requirement. Keep segmentation as a later investigation if pose error is dominated by ambiguous outlet shape rather than data quality.

## Decision matrix

No CupMaster benchmark exists yet; all entries are qualitative.

| Criteria | Detection | Keypoint / pose | Segmentation |
| --- | ---: | ---: | ---: |
| Annotation cost | Low | Medium | High |
| Direct tip precision | Low; derived heuristic | High potential; directly supervised | Medium–high potential; requires endpoint extraction |
| Browser speed | Best expected | Good expected | Highest expected cost |
| Transparent/reflective robustness | Unknown; box context helps | Unknown; exact outlet is hard | Unknown; boundaries are especially hard |
| Tracking usefulness | Medium; ROI and confidence | High; direct point measurement | High, but more state than needed |
| MVP implementation cost | Low | Medium | High |
| Long-term trajectory fit | Low | High | Medium |

```text
Recommended primary prototype: custom one-keypoint pose/localization
Recommended baseline: visible-spout object detection plus explicitly measured bbox-tip heuristics
Deferred option: spout/neck segmentation
```

## Architecture and implementation research

### Ultralytics YOLO

Ultralytics Pose supports custom keypoint layouts, visibility flags, bounding boxes, and ONNX export. That makes it a technically strong rapid experiment. Its current licensing is the blocker: Ultralytics states that its code, models, architecture, training pipeline, and trained/fine-tuned models require either an AGPL-3.0 project or an Enterprise license. CupMaster must not ship an Ultralytics-derived model in a proprietary commercial product without a reviewed compatible license.

### Apache-licensed path

- **MMPose / RTMPose** is Apache-2.0 and supports custom pose work and ONNX Runtime deployment via MMDeploy. A top-down configuration naturally follows detector → cropped landmark model.
- **YOLOX** is Apache-2.0, includes Nano/Tiny variants, and documents ONNX/ONNX Runtime deployment. It is a license-compatible detection baseline and possible coarse stage.
- This two-stage stack adds preprocessing and two model invocations, but cleanly separates a broad spout proposal from precise landmark regression and follows the MediaPipe detector/landmark precedent.

Task 9C should compare exported artifact size, supported ONNX operators, output decoding complexity, and actual browser latency. No framework is selected for production merely because its repository license is permissive: checkpoint and training-data licenses must be audited separately.

## Tracking research

1. Run the keypoint model on every sampled frame. It is simplest and should be the first correctness reference, but may not meet latency needs.
2. Run the model periodically, track between detections with pyramidal Lucas–Kanade, and re-detect on low confidence/status failure. OpenCV.js exposes `calcOpticalFlowPyrLK`, but a single specular tip is not always a stable corner; a small local feature set around the point may be required.
3. Run the detector at a sustainable rate and apply only temporal smoothing (EMA first, then a Kalman-style filter only if justified). This cannot recover missing observations but has less failure state than optical flow.

**Prototype recommendation:** first run model measurements at a sustainable sampled rate and apply confidence-gated EMA with a maximum-gap rule. Measure raw and smoothed results separately. Add optical flow only if measured detector cadence causes perceptual discontinuity. Periodically refresh from the model and immediately re-detect after low keypoint confidence, an excessive jump, leaving the ROI, or a flow failure. Motion remains an auxiliary quality/failure signal, never proof of pouring.

MediaPipe Hand Landmarker is an architectural precedent only: in video/live mode it skips the coarse detector while tracking succeeds and re-runs detection when tracking/presence confidence fails. It is not a spout detector and its hand model/weights are not proposed for CupMaster.

## External dataset survey

Approximate size means the publisher's stated count/size; `not stated` is intentionally not guessed.

| Resource | URL | Type / approximate size | Scene, angle, annotation | License / commercial / redistribution | Potential use | Risks and decision |
| --- | --- | --- | --- | --- | --- | --- |
| CupMaster first-party captures | Internal, to be created in Task 9B | 150–250 annotated feasibility frames | v1 top-down coffee scenes; bbox + tip | CupMaster-owned subject to capture consent; commercial yes; redistribution by project policy | Primary training/validation source | Small and initially narrow; split by session/kettle |
| PourIt! | [paper](https://openaccess.thecvf.com/content/ICCV2023/html/Lin_PourIt_Weakly-Supervised_Liquid_Perception_from_a_Single_Image_for_Visual_ICCV_2023_paper.html), [code](https://github.com/hetolin/PourIt) | 3,354 train + 374 seen-test + 336 unseen-test images | robotic/human pours; water/no-water image labels and weak liquid masks/CAM, not spout tips; mostly side/oblique | Code Apache-2.0. Dataset and downloadable pretrained-weight terms are not separately explicit on the project page; commercial/derivatives/redistribution unknown. **DO NOT USE IN PRODUCTION UNTIL VERIFIED.** | Future water-stream signal and methodology reference | Not a spout-tip dataset; domain and angle mismatch |
| UW Liquid Pouring Dataset | [official page](https://rse-lab.cs.washington.edu/lpd/) | 4,554,900 simulated frames in 10,122 sequences; 648 real-robot sequences; paper reports about 2.5 TB total | cup/bottle/mug into bowl; side/oblique (up to 45°); pixel liquid labels, boxes, simulated lip location | No dataset license located on the official page; commercial/derivatives/redistribution/attribution unclear. **DO NOT USE IN PRODUCTION UNTIL VERIFIED.** | Liquid and temporal methodology; simulated lip labels may inform experiments | Huge, wrong vessel/angle, no gooseneck; do not download for Task 9A |
| SPILL / Glasses-in-the-Wild | [code](https://github.com/Louadria/SPILL), [dataset DOI](https://doi.org/10.5281/zenodo.17288314), [paper](https://ieeexplore.ieee.org/document/11207594) | Crowdsourced dataset; size not stated in inspected repository | transparent glassware in domestic scenes; bbox + five semantic keypoints; object detector → keypoint heatmaps → geometry | Repository code MIT. The repository does not establish separate dataset/checkpoint terms in the inspected text; commercial/derivatives/redistribution of data/weights unknown. **DO NOT USE DATA OR WEIGHTS IN PRODUCTION UNTIL VERIFIED.** | Strong semantic-keypoint and two-stage geometry precedent | Target is receiving glassware, not spout; pretrained labels do not transfer directly |
| WorldArena / pour-over reports | [current Track 3](https://github.com/WorldArena2/WorldArena-2.0/blob/main/assets/track3_description.md), [HF dataset](https://huggingface.co/datasets/WorldArena/WorldArena2.0) | Search-indexed material reported 83 pour-over demos; current Track 3 instead lists about 100 episodes per listed task and does not list `pour_over_coffee` | head/third-person and wrist robot video, normally oblique; no spout-tip annotation | HF dataset card says Apache-2.0; repository is MIT. The exact historical pour-over subset and its continuing availability/provenance could not be confirmed. **DO NOT USE THE POUR-OVER SUBSET UNTIL VERIFIED.** | Possible hard-negative/domain review if the exact subset resurfaces | Availability contradiction; robot viewpoint is not v1 top-down; no relevant labels |
| Google Brain Pouring Dataset | [official page](https://sites.google.com/site/brainrobotdata/home/pouring-dataset) | Size not stated on landing page | robot pouring videos/images; imitation-learning observations, not gooseneck-tip labels | Data CC BY 4.0; commercial/derivatives/redistribution allowed with attribution | Commercially usable general pouring reference or negatives after relevance review | Wrong task/view; attribution and source manifest required |
| Open Images V7 | [official site](https://storage.googleapis.com/openimages/web/index.html), [license detail](https://storage.googleapis.com/openimages/web/factsfigures_v4.html) | About 9M images overall; candidate kettle subset size not established | in-the-wild angles; labels/boxes/points vary by class; no gooseneck-tip annotation | Annotations CC BY 4.0; images listed CC BY 2.0, but publisher says each image's license must be verified. Commercial/derivatives/redistribution allowed per verified asset with attribution | Negative/background diversity and possible pretraining imagery | Kettle/gooseneck specificity and license must be checked per asset; not primary data |
| Transparent Tableware Dataset (TTD) | [Zenodo](https://zenodo.org/records/10580444) | 600 stereo images, 1.1 GB | table setting; five transparent objects; CAD pose + masks; occlusions | Zenodo record's Rights/License field is blank. Commercial/derivatives/redistribution/attribution unknown. **DO NOT USE IN PRODUCTION UNTIL VERIFIED.** | Reflective/transparent robustness reference | Receiving tableware, not spouts; angle/domain mismatch |

No public resource found in this search supplies top-down gooseneck-spout outlet keypoints under a clearly applicable commercial license. External datasets therefore do not replace first-party capture.

## Software, repository, paper, and weight license audit

Each row records all required audit fields. “Yes” always remains subject to preserving the named license/notice and auditing transitive dependencies.

| Resource | URL | License | Commercial use | Derivative work | Redistribution | Dataset restrictions | Model-weight restrictions | Attribution / notice | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ultralytics YOLO/Pose | [docs](https://docs.ultralytics.com/tasks/pose/), [license](https://www.ultralytics.com/license) | AGPL-3.0 or paid Enterprise | Only with AGPL compliance or Enterprise | AGPL terms | AGPL terms | Dataset-specific | Official site states trained/fine-tuned models are covered by AGPL by default | License/source obligations | Experiment only; **DO NOT USE IN PRODUCTION UNTIL LICENSE PATH IS APPROVED** |
| MMPose / RTMPose | [repo](https://github.com/open-mmlab/mmpose), [deployment](https://github.com/open-mmlab/mmpose/blob/main/docs/en/user_guides/how_to_deploy.md) | Apache-2.0 | Yes | Yes | Yes | Each dataset separately | Each checkpoint separately | Preserve license/NOTICE and changes | Production candidate; audit chosen checkpoint/data |
| YOLOX | [repo](https://github.com/Megvii-BaseDetection/YOLOX), [license](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/LICENSE) | Apache-2.0 | Yes | Yes | Yes | Each dataset separately | Each checkpoint separately | Preserve license/NOTICE and changes | Detection baseline candidate |
| ONNX Runtime Web | [web docs](https://onnxruntime.ai/docs/get-started/with-javascript/web.html), [license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE) | MIT | Yes | Yes | Yes | N/A | Does not license loaded models | Preserve copyright/license | Recommended runtime |
| OpenCV / OpenCV.js 4.5+ | [optical flow docs](https://docs.opencv.org/4.x/db/d7f/tutorial_js_lucas_kanade.html), [license notice](https://github.com/opencv/opencv/blob/4.x/doc/LICENSE_CHANGE_NOTICE.txt) | Apache-2.0 (4.5-pre onward) | Yes | Yes | Yes | N/A | N/A | Preserve license/NOTICE and changes | Optional tracker candidate, not Task 9A dependency |
| MediaPipe code | [repo](https://github.com/google-ai-edge/mediapipe), [Hand Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) | Apache-2.0 | Yes | Yes | Yes | N/A | Model cards/weights separately | Preserve license/NOTICE and changes | Architecture precedent only |
| PourIt! code | [repo](https://github.com/hetolin/PourIt) | Apache-2.0 | Yes | Yes | Yes | Dataset unclear | Downloaded weight terms unclear | Preserve license/NOTICE and changes | Code/paper reference; data/weights restricted pending verification |
| SPILL code | [repo](https://github.com/Louadria/SPILL) | MIT | Yes | Yes | Yes | Glasses-in-the-Wild separately unclear | Included checkpoints not separately licensed in inspected text | Preserve copyright/license | Architecture/code reference; data/weights restricted pending verification |
| WorldArena2 code | [repo](https://github.com/WorldArena2/WorldArena-2.0) | MIT | Yes | Yes | Yes | HF card says Apache-2.0; exact subset unresolved | Each external model separately | Preserve notices | Code usable; exact pour-over data rejected pending verification |

This audit is an engineering screen, not legal advice. A public GitHub repository is not evidence that its datasets or weights share the repository license.

## Research precedents

- **PourIt!:** weak water/no-water classification produces a CAM and liquid segmentation/3D pipeline. It is a future water-signal reference, not a spout-tip source.
- **SPILL:** coarse object boxes feed semantic keypoint heatmaps, then a geometry layer. CupMaster should borrow the separation of learned image localization from deterministic geometry, without borrowing glass-specific labels.
- **MediaPipe Hand Landmarker:** detector → landmark → temporal tracking → re-detect on confidence failure is suitable as a system pattern.
- **Lucas–Kanade:** browser-available sparse flow is a possible bridge between model refreshes, subject to tests on reflective tips and explicit failure recovery.

## Final Task 9A decisions

1. **Primary model task:** one-class pose/keypoint localization that directly predicts `spout_tip` with an associated visible-spout bbox.
2. **Baseline:** one-class visible-spout object detector; evaluate multiple documented bbox-to-tip heuristics but do not treat them as truth.
3. **Annotation schema:** `gooseneck_spout` bbox + `spout_tip` + visibility/ambiguity metadata; negatives contain no fabricated object.
4. **One vs two keypoints:** one required keypoint for feasibility; audit `spout_neck_base` on 30–40 frames before any promotion.
5. **Initial dataset size:** 150–250 selected and annotated frames, explicitly a feasibility set rather than a production estimate.
6. **Dataset sources:** first-party CupMaster captures are primary. External data is reference, hard-negative, or future water-signal material only after relevance and license checks.
7. **Commercially usable resources:** self-captured consented data; Google Brain Pouring under CC BY 4.0; individually verified Open Images assets under CC BY; ONNX Runtime Web (MIT), MMPose/RTMPose, YOLOX, OpenCV 4.5+, and MediaPipe code (Apache-2.0). Checkpoints and upstream training data remain separate audits.
8. **Rejected/restricted:** PourIt data/weights, UW-LPD, SPILL data/weights, TTD, and the unconfirmed WorldArena pour-over subset are production-blocked until explicit terms/provenance are verified. Ultralytics artifacts require AGPL compliance or Enterprise approval.
9. **Browser stack:** static-shape ONNX, ONNX Runtime Web WebGPU first and WASM fallback; profile both, especially iOS Safari.
10. **Prototype tracking:** confidence-gated EMA and periodic model measurements first; add optical flow only after measured need, with refresh/failure rules.
11. **Supported scene:** the frozen top-down / near-top-down gooseneck pour-over scene at the start of this document.
12. **Exact Task 9B next step:** capture five or more consented sessions spanning at least three materially different kettles and multiple v1-valid backgrounds/lighting conditions; select 150–250 diverse frames plus negatives at 2–5 FPS or event-based intervals; assign session-level split IDs; annotate bbox + one tip keypoint under `annotation-spec.md`; double-annotate 10% plus a 30–40-frame optional neck-base audit; run annotation QA and publish only the dataset manifest/split/QA report. Do not train until that gate passes.

## Open questions for Task 9B/9C

- Can two annotators place the outlet consistently under flowing water, glare, and motion blur?
- Is a full-frame one-stage pose model better than detector → cropped landmark at 150–250 frames?
- What model/input size keeps iOS WASM usable without unacceptable normalized tip error?
- Does optional neck orientation improve recovery enough to justify the annotation cost?
- Do first-party captures include a genuinely common transparent/semi-transparent gooseneck, or should that material stay an observed stretch category?
