# Browser spout-tip inference plan

Status: Task 9A deployment research; not an implementation
Accessed: 2026-09-17

## Recommendation

Export a compact, static-shape ONNX model. Load it with ONNX Runtime Web using **WebGPU when capability detection and model initialization succeed**, with **WASM as the required fallback**. Do not promise WebGPU on iOS. Keep preprocessing, inference, decoding, geometry, and tracking as measurable stages.

No model size or latency is claimed before Task 9C measures an actual exported artifact on representative devices.

## Option A — ONNX Runtime Web with WebGPU

```text
camera frame
→ crop/resize/letterbox
→ RGB tensor normalization
→ ONNX Runtime Web WebGPU EP
→ decode box/keypoint/confidence
→ undo letterbox/crop
→ canonical geometry
→ tracking/smoothing
```

Advantages:

- GPU acceleration without uploading camera frames;
- current ONNX Runtime documentation supports WebGPU imports and execution-provider selection;
- suited to heavier models than CPU WASM when browser/device support is present.

Risks:

- WebGPU requires a secure context and its ONNX operator coverage is a subset of WASM;
- the current ONNX Runtime support table lists WebGPU for desktop Chromium and Android Chrome/Edge, but not Safari macOS/iOS or Chrome/Edge on iOS;
- browser support does not guarantee a specific device/driver is stable or fast;
- tensor upload/readback can erase gains for small models, so end-to-end timing matters more than kernel timing.

## Option B — ONNX Runtime Web with WASM

Use the same model contract and decoding with the WASM execution provider.

Advantages:

- ONNX Runtime's current matrix supports WASM across Chromium, Firefox, macOS Safari, and iOS Safari;
- all ONNX operators are supported by WASM according to the official web tutorial;
- predictable fallback and a useful correctness reference.

Risks:

- CPU time, thermal throttling, and battery cost may be material on phones;
- multithreaded WASM/worker behavior depends on correct same-origin/CSP and cross-origin isolation deployment choices;
- a model acceptable on desktop may be unusable on older iPhones.

## Model artifact and pipeline contract

Task 9C must record, not assume:

- model family, task, training/checkpoint/data licenses, opset, precision, static input shape, and byte size;
- runtime JS/WASM asset sizes and whether assets are cached/offline-capable;
- exact resize/letterbox rule, color order, scale/mean/std, tensor layout, and input resolution;
- raw output tensor names/shapes, confidence computation, candidate filtering/NMS if needed, and keypoint decoding;
- crop-to-image and image-to-canonical transforms with test vectors;
- initialization/cold-load time separately from warm inference.

Start with static batch 1 and one fixed input resolution. Dynamic shapes complicate graph optimization and profiling. Compare at least two realistic resolutions only after the correctness path matches a reference export.

## Browser/device test matrix

| Target | Primary path | Required fallback / concern |
| --- | --- | --- |
| Android Chrome | WebGPU when exposed and initialization passes | WASM; measure GPU/driver variance and thermals |
| Desktop Chrome / Edge | WebGPU | WASM correctness baseline |
| iOS Safari and installed PWA | WASM | Treat WebGPU as unavailable for planning based on current ORT matrix; memory, heat, and main-thread stalls are high risk |
| Chrome / Edge on iOS | WASM | iOS browser engine constraints; do not infer desktop Chromium support |
| macOS Safari | WASM | Current ORT matrix does not list WebGPU support |
| Firefox | WASM | WebGPU not in current ORT support matrix |

Capability selection must be runtime-tested: create the WebGPU session, run a known warm-up input, and fall back cleanly on failure. User-agent sniffing alone is insufficient.

## Prototype measurements and targets

Task 9C records distributions (median and tail, plus sample count) for:

- input resolution;
- preprocessing latency;
- inference latency;
- output decoding latency;
- effective detector/keypoint FPS;
- tracking/render FPS;
- end-to-end camera-timestamp-to-overlay latency;
- dropped/overwritten frames and queue depth;
- cold model download/init and warm-up;
- model/runtime transfer size and peak memory where observable;
- CPU/GPU utilization proxies, thermal degradation during a full brew-length run, and battery impact where practical.

The product target is a trajectory that feels continuous and does not lag behind the kettle. Do not set a fabricated accuracy or millisecond gate before measurement. Use latest-frame-wins backpressure: never build an inference queue of stale camera frames.

## Tracking choices

### Every sampled frame

Run the model whenever the sampling pipeline produces a frame. This is the first correctness implementation and remains viable if measured performance is sufficient.

### Model refresh plus optical flow

Run the model, track a small local feature set around the tip with pyramidal Lucas–Kanade, and periodically refresh. OpenCV.js provides `calcOpticalFlowPyrLK` with per-point status/error. Failure conditions include lost status, excessive error, implausible displacement, leaving the ROI/image, disagreement with refreshed model output, and a maximum refresh interval.

This adds an OpenCV.js payload and state machine. A reflective aperture may not supply stable corners, so it is not the default until measured.

### Temporal smoothing only

Confidence-gated EMA reduces jitter without pretending to create missing observations. Reset after a long timestamp gap, visibility loss, or implausible jump. Preserve raw measurements for evaluation. A Kalman-style filter is a later option only if its motion assumptions and tuning outperform EMA on held-out sequences.

**Recommended Task 9C path:** model at a sustainable sampled cadence + confidence-gated EMA + maximum-gap reset. Compare raw versus smoothed continuity. Add periodic-model/optical-flow tracking only if detector cadence is the measured bottleneck.

## Dripper alignment and geometry

v1 does not train a dripper model. The user aligns the complete dripper to a guide circle, optionally adjusts it once, and supplies image-space center `(cx, cy)` and rim radius `R`. A future semi-automatic edge/circle suggestion may assist but does not change the stored reference without user confirmation.

```text
canonical_x = (tip_x - cx) / R
canonical_y = (tip_y - cy) / R
rim radius = 1.0
```

Automatic circle/ellipse detection, dripper keypoints, and full calibration are deferred. Preserve the coordinate-transform layer independently so a future dripper source can replace manual alignment.

## Failure and privacy behavior

- If no usable runtime initializes, disable vision guidance explicitly; brewing and saving must continue.
- Low-confidence/missing measurements create gaps, not invented points.
- Never interpret motion or a spout point alone as proof that water is flowing.
- Camera tensors stay local for browser inference unless a later separately approved product flow says otherwise.
- Model/runtime failures must not block Start Brew or Save Brew.

## Sources and license audit

All accessed 2026-09-17:

- [ONNX Runtime Web support matrix](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) — MIT; commercial/derivatives/redistribution allowed with license notice; loaded models are separately licensed.
- [ONNX Runtime WebGPU guide](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html) — MIT documentation/project; operator/device support must be validated.
- [ONNX Runtime Web deployment](https://onnxruntime.ai/docs/tutorials/web/deploy.html) — MIT; documents runtime assets, workers, CSP, and secure-context concerns.
- [OpenCV.js Lucas–Kanade](https://docs.opencv.org/4.x/db/d7f/tutorial_js_lucas_kanade.html) — OpenCV 4.5+ Apache-2.0; commercial/derivatives/redistribution allowed with notice; optional only.
- [MediaPipe Hand Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js) — MediaPipe code Apache-2.0; model assets separately audited; architectural precedent only.
- [Ultralytics pose/export docs](https://docs.ultralytics.com/tasks/pose/) — AGPL-3.0/Enterprise terms apply to Ultralytics artifacts; **DO NOT USE IN PRODUCTION UNTIL A COMPATIBLE LICENSE PATH IS APPROVED**.
- [MMPose deployment guide](https://github.com/open-mmlab/mmpose/blob/main/docs/en/user_guides/how_to_deploy.md) — Apache-2.0 code; checkpoint/data restrictions separately audited.
