# Spout-tip prototype evaluation

Status: Task 9A advance acceptance plan for Task 9C
Accessed: 2026-09-17

## Principle

The feasibility prototype passes by demonstrating useful, repeatable behavior and exposing failure modes—not by meeting an invented “95% accuracy” threshold. Report raw counts, distributions, confidence intervals where meaningful, and representative failure clips. Freeze numerical gates only after the first evidence-bearing run.

Evaluate the primary keypoint model and detection baseline on the same held-out, session-isolated frames/sequences. Never tune on test.

## Evaluation data

- Primary validation/test includes only the declared v1 top-down / near-top-down scene (75–90°, fixed camera, complete dripper/bed visible, gooseneck family).
- Report training-like validation, held-out session, and—where sample count permits—held-out kettle separately.
- More oblique, off-center, incomplete-dripper, and unsupported kettle scenes belong to a labeled stress set and cannot improve the primary result.
- Sequence metrics use full held-out video segments, not shuffled frames.

## Localization metrics

For visible and partially occluded tips, report:

- object detection precision/recall and false-positive count at documented thresholds;
- Euclidean tip error in source-image pixels;
- **normalized tip error = pixel error / aligned dripper radius in pixels**;
- distribution and tail of normalized error, not only an average;
- percentage of predictions falling inside the annotated visible-spout bbox;
- results stratified by visibility, angle, kettle/material, lighting, wet/dry bed, and hand presence.

The key visual review asks whether the point is on/near the physical outlet, not on the stream, hand, reflection, neck midpoint, or nearest bbox corner.

For the detection baseline, document each bbox-to-tip heuristic before evaluation—for example, point on the box boundary nearest the dripper center or endpoint selected using temporal entry direction. Do not select a heuristic after viewing test labels.

## Tracking metrics

On held-out sequences, report:

- track continuity: fraction of eligible timestamps with a valid tip;
- gap count and gap-duration distribution;
- frame-to-frame jitter during intentionally stationary/slow holds, normalized by dripper radius;
- implausible jump count under a documented velocity/displacement diagnostic threshold;
- recovery time after short hand, water, steam, and frame-edge occlusions;
- identity/false-recovery failures if multiple spout-like objects appear;
- trajectory overlays for raw model output and smoothed/tracked output.

Smoothing must not be scored only against itself. Preserve raw output and ensure perceptual smoothness does not hide systematic lag or bias.

## Material and scene slices

Report counts and outcomes separately for:

- black matte;
- silver/stainless;
- reflective metal;
- white/light color;
- transparent/semi-transparent if genuine examples exist; otherwise state “not evaluated”;
- light versus dark counters;
- wet versus dry bed;
- steam/reflection and hand-occlusion conditions.

Do not claim material robustness from a slice with too few independent capture sessions; show the sample/session count next to every slice.

## Negative scenes

Count false positives and show representative examples for:

- hand without spout;
- dripper/filter edge;
- coffee bed;
- kettle body with no visible neck;
- reflective utensils and non-gooseneck kitchen objects;
- empty setup.

A confident hand or dripper-edge tip is a high-severity failure even if aggregate localization looks good.

## Browser performance

Test Android Chrome, desktop Chrome/Edge, and at least one iOS Safari device. For each device/browser/runtime path/input resolution record:

- model and runtime transfer size;
- cold initialization/warm-up;
- preprocessing, inference, decode, geometry, smoothing, and render time distributions;
- effective model FPS and displayed tracking FPS;
- end-to-end camera timestamp to overlay latency;
- dropped/overwritten frames and maximum queue depth;
- WASM/WebGPU path selected and fallback events;
- CPU/GPU behavior proxies, peak memory where observable, thermal throttling, and perceptual lag over a brew-length run.

Use latest-frame-wins scheduling. A high throughput number with an accumulating stale-frame queue is a failure.

## Qualitative acceptance gate

Task 9C may recommend continuation only if all are true:

- the primary keypoint route learns a signal meaningfully better than chance/scene priors on held-out sessions;
- normalized tip error and overlays are useful for distinguishing center versus perimeter pouring at the observed setup scale;
- paths are perceptually continuous without unacceptable smoothing lag;
- short occlusions recover without long-lived false tracks;
- hard negatives do not trigger systematic high-confidence tips;
- at least one Android path and the iOS WASM fallback complete a sustained run without blocking the brew experience;
- every artifact has a production-compatible or explicitly experimental license classification;
- raw evidence and failure cases are sufficient to choose pose, detection, or stop/recollect.

If the keypoint model fails, distinguish data/annotation failure from task/architecture failure before moving to segmentation. Segmentation is not the automatic next step.

## Decision outputs from Task 9C

The prototype report must state:

1. primary versus baseline winner, with slice-level evidence;
2. whether one required keypoint remains sufficient;
3. whether the optional neck-base audit showed consistent labels and measurable tracking benefit;
4. chosen input resolution and model artifact size;
5. WebGPU and WASM device results;
6. smoothing-only versus optical-flow decision;
7. known unsupported materials/scenes;
8. data gaps and next collection plan;
9. licensing disposition for code, weights, and every dataset;
10. go/no-go recommendation for product integration, which remains a separate approved task.

## Canonical examples

```text
dripper center = (0, 0)
rim radius = 1.0
predicted tip = (0.3, -0.2)
r = sqrt(0.3^2 + -0.2^2) ≈ 0.36
```

The model emits image coordinates. Only the geometry layer performs this conversion. Evaluation must use the same versioned alignment and conversion code for labels and predictions.

## Sources

All accessed 2026-09-17:

- [Ultralytics pose result fields](https://docs.ultralytics.com/tasks/pose/) — AGPL-3.0/Enterprise; format/metric research only until license approved.
- [ONNX Runtime Web performance diagnosis](https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html) — MIT; commercial use allowed with notice.
- [MediaPipe Hand Landmarker tracking behavior](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) — MediaPipe code Apache-2.0; detector refresh precedent only.
- [OpenCV.js Lucas–Kanade](https://docs.opencv.org/4.x/db/d7f/tutorial_js_lucas_kanade.html) — OpenCV 4.5+ Apache-2.0; optional tracking precedent.
