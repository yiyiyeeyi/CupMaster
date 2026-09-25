# Task 9C framework, license, and storage audit

Status: **research shortlist; no packages, checkpoints, or weights installed**

This is an engineering screen, not legal advice. Code license and checkpoint/data license are separate gates; a permissive framework does not make every published checkpoint commercially usable.

## Candidate audit

| Role / candidate | Code license | Checkpoint/license concern | ONNX and browser path | Windows / WSL and training complexity | Size / maturity | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Detector: RTMDet-tiny via MMDetection | Apache-2.0 | Verify the exact checkpoint/model card before use; custom CupMaster weights inherit dataset/code obligations separately | MMDeploy supports ONNX Runtime; browser viability still requires exported-op test in ORT Web | Mature but heavy OpenMMLab stack; WSL preferred if MMCV/MMDeploy native ops complicate Windows | Tiny config is suitable for first screen; mature ecosystem | **Primary detector candidate** |
| Detector: YOLOX-tiny/nano | Apache-2.0 | Verify exact pretrained weight provenance | Official repo supports ONNX/ONNX Runtime; browser op compatibility must be tested | Simpler standalone PyTorch repo, but official releases are relatively old and Windows may JIT-compile a custom op | Small variants, established but lower recent maintenance cadence | **Fallback detector** |
| Detector/keypoint: Ultralytics YOLO pose/detect | AGPL-3.0 or paid Enterprise | Ultralytics says its models/code use AGPL by default; production/commercial distribution requires an obligation review or Enterprise license | ONNX export is convenient, but export convenience does not remove license obligations | Easy tooling and broad community | Mature and compact options | **Not default; legal blocker for proprietary product path** |
| One-keypoint: RTMPose-tiny/small via MMPose | Apache-2.0 | Verify exact base checkpoint license; final custom one-keypoint weight needs its own provenance record | Official MMDeploy docs list RTMPose with ONNX Runtime; validate generated graph in ORT Web | Same OpenMMLab dependency/native-op burden; WSL training likely least friction | Strong real-time pose family; custom one-keypoint head/config work required | **Primary keypoint candidate** |
| One-keypoint: small custom heatmap/regression head in plain PyTorch | BSD-style PyTorch codebase; project code remains CupMaster-owned | Backbone pretrained checkpoint license must be recorded or train from permitted initialization | Best chance of a minimal standard-op ONNX graph | More model code and training responsibility, fewer framework-specific deploy ops | Can be smallest; maturity depends on our implementation | **Fallback if RTMPose export is too heavy** |
| Tracker: pyramidal Lucas–Kanade in OpenCV | Apache-2.0 for OpenCV 4.5+ | No learned checkpoint | OpenCV.js/WASM is plausible; browser bundle/feature availability must be verified in prototype | Mature on Windows, Linux, and browser builds | Lightweight classical tracker | **Primary tracker candidate** |
| Tracker: learned Siamese/deep tracker | Varies | Both repo and weights need independent review | Usually larger and less reliable across ORT Web operators | Adds training/runtime complexity unjustified at 88 frames | Potentially accurate but high integration cost | **Defer** |

## Recommended first experiment stack

1. Train/evaluate RTMDet-tiny for the one-class `gooseneck_spout` detector.
2. Train/evaluate RTMPose-tiny or the smallest supported RTMPose configuration for one `spout_tip` keypoint.
3. Use OpenCV pyramidal Lucas–Kanade only for Mode C propagation.
4. Export detector and keypoint networks to ONNX and test with ONNX Runtime on desktop first, then ONNX Runtime Web WebGPU with WASM fallback.
5. Keep YOLOX and a minimal custom PyTorch keypoint model as fallbacks if OpenMMLab export/operator complexity dominates.

The recommendation favors permissive licenses and a shared deployment runtime. ONNX Runtime is MIT-licensed; its web package supports WASM broadly and WebGPU on a narrower browser/device matrix. Therefore “exports to ONNX” is necessary but not sufficient: every candidate must pass an actual ORT Web load, numerical parity, bundle-size, memory, and latency check.

## Authoritative references checked

- [MMDetection repository and Apache-2.0 license](https://github.com/open-mmlab/mmdetection)
- [RTMDet configurations and model-size table](https://github.com/open-mmlab/mmdetection/tree/main/configs/rtmdet)
- [MMPose repository and Apache-2.0 license](https://github.com/open-mmlab/mmpose)
- [MMPose deployment guide](https://github.com/open-mmlab/mmpose/blob/main/docs/en/user_guides/how_to_deploy.md)
- [MMDeploy MMPose support matrix](https://github.com/open-mmlab/mmdeploy/blob/main/docs/en/04-supported-codebases/mmpose.md)
- [YOLOX official repository, license, and deployment targets](https://github.com/Megvii-BaseDetection/YOLOX)
- [Ultralytics licensing options](https://docs.ultralytics.com/)
- [ONNX Runtime repository and MIT license](https://github.com/microsoft/onnxruntime)
- [ONNX Runtime Web execution providers](https://onnxruntime.ai/docs/tutorials/web/)
- [OpenCV license transition for 4.5+](https://github.com/opencv/opencv/wiki/OpenCV-Change-Logs)

Before downloading any checkpoint, record its direct URL, publisher, version/hash, license text, training-data statement, and permitted commercial/redistribution use. Ambiguous provenance fails the gate.

## D-drive artifact contract

All future ML artifacts must stay under `D:\Projects\CupMaster\.vision-work\`; this directory must remain gitignored. Do not allow framework defaults to write model data into `C:\Users\<user>\AppData`, the user profile cache, or the repository's tracked data tree.

```text
D:\Projects\CupMaster\.vision-work\
  cache\
    huggingface\
    torch\
    pip\
    openmmlab\
  checkpoints\
    imported\
    trained\
  runs\
    <run-id>\
      config\ metrics\ predictions\ logs\
  exports\
    onnx\
    browser\
  eval\
    first-party\
    external\
  tmp\
```

Required process-scoped environment variables before any future install/train/export command:

```powershell
$env:VISION_WORK_ROOT = 'D:\Projects\CupMaster\.vision-work'
$env:HF_HOME = "$env:VISION_WORK_ROOT\cache\huggingface"
$env:HF_HUB_CACHE = "$env:HF_HOME\hub"
$env:HF_DATASETS_CACHE = "$env:HF_HOME\datasets"
$env:TORCH_HOME = "$env:VISION_WORK_ROOT\cache\torch"
$env:PIP_CACHE_DIR = "$env:VISION_WORK_ROOT\cache\pip"
$env:MMENGINE_HOME = "$env:VISION_WORK_ROOT\cache\openmmlab"
$env:TMP = "$env:VISION_WORK_ROOT\tmp"
$env:TEMP = "$env:VISION_WORK_ROOT\tmp"
```

Command-line output directories must be explicit; environment variables are not a substitute for `work_dir`, checkpoint, export, and evaluation paths. Each run receives an immutable run ID and records source commit, data hashes, config, seed, dependency lock, hardware, and artifact hashes. Imported and trained checkpoints never overwrite one another.

The Hugging Face cache variables follow its documented cache contract. `MMENGINE_HOME` must be verified against the selected OpenMMLab release before use; if unsupported, pass explicit cache/checkpoint paths. No directory is created and no dependency is installed in Task 9C-1.

## Go/no-go gates

- License: framework and exact checkpoint provenance approved; AGPL or unclear weight terms are a no-go without explicit legal/product approval.
- Training: reproducible Windows or WSL environment and all writes proven to remain on D:.
- Export: standard-op ONNX produced with desktop numerical parity.
- Browser: ONNX Runtime Web loads on WebGPU and WASM fallback; unsupported operators are documented, not silently replaced.
- Runtime: size, memory, warm-up, P90 latency, and effective FPS meet a later device-specific budget.
- Evaluation: split discipline and immutable session-004/external gates pass before results are viewed.
