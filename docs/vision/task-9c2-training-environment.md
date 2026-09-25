# Task 9C-2 training environment

Status: **verified — baseline execution complete**

## Host audit

- Host: Windows / PowerShell 7.6.5.
- GPU: no NVIDIA driver or `nvidia-smi` available; CPU execution only.
- System Python: not installed or available on `PATH`.
- WSL: executable exists, but distro enumeration is unavailable (`E_ACCESSDENIED`) in this environment.
- D: free space before setup: 246,226,092,032 bytes (approximately 229.3 GiB).

These constraints are implementation evidence against using the native-op-heavy MMDetection/MMPose stack for this first CPU baseline. Task 9C-2 therefore uses the permissive fallback already allowed by the 9C-1 audit: portable Python plus PyTorch/torchvision, a frozen MobileNetV3-small feature extractor, and small CupMaster-owned spatial heads. RTMDet/RTMPose remain the preferred GPU/WSL reproduction candidates; this run does not claim to evaluate them.

## Storage root and environment

Every Task 9C-2 dependency and generated artifact is rooted at:

`D:\Projects\CupMaster\.vision-work`

| Variable | Resolved path |
| --- | --- |
| `VISION_WORK_ROOT` | `D:\Projects\CupMaster\.vision-work` |
| `HF_HOME` | `D:\Projects\CupMaster\.vision-work\cache\huggingface` |
| `HF_HUB_CACHE` | `D:\Projects\CupMaster\.vision-work\cache\huggingface\hub` |
| `HF_DATASETS_CACHE` | `D:\Projects\CupMaster\.vision-work\cache\huggingface\datasets` |
| `TORCH_HOME` | `D:\Projects\CupMaster\.vision-work\cache\torch` |
| `PIP_CACHE_DIR` | `D:\Projects\CupMaster\.vision-work\cache\pip` |
| `MMENGINE_HOME` | `D:\Projects\CupMaster\.vision-work\cache\openmmlab` |
| `UV_CACHE_DIR` | `D:\Projects\CupMaster\.vision-work\cache\uv` |
| `UV_PYTHON_INSTALL_DIR` | `D:\Projects\CupMaster\.vision-work\python` |
| `TMP` / `TEMP` | `D:\Projects\CupMaster\.vision-work\tmp` |

Additional paths:

- Environment: `.vision-work\venv`
- Checkpoints: `.vision-work\checkpoints\task-9c2`
- Run artifacts: `.vision-work\runs\task-9c2-baseline`
- ONNX: `.vision-work\exports\onnx\task-9c2`
- Visual QA: `.vision-work\eval\task-9c2\validation-visuals`

All paths are process-scoped when commands run. The repository ignores `.vision-work/`; no dependency, cache, checkpoint, generated image, or prediction payload is tracked.

## Training budget

- Seed: `20260925` for Python, NumPy, and Torch.
- Input: letterboxed `224 × 224` RGB.
- Frozen feature extractor: MobileNetV3-small ImageNet-1K V1.
- Heads: one small spatial head per A1, B0, and B1.
- Optimizer: AdamW, head-only training.
- Augmentation: identity, horizontal flip, brightness `0.90`, contrast `1.10`; geometry is transformed exactly for horizontal flip.
- No synthetic labels and no validation augmentation/oversampling.
- Train media: sessions 001–002 only.
- Validation media: session 003 only.
- Session 004 and sessions 005–010 are rejected by the media loader.

Exact installed versions and resolved cache-write verification will be appended after setup.

## Resolved installation

| Component | Version / location |
| --- | --- |
| uv | 0.8.17, `.vision-work\tools\uv\uv.exe` |
| Python | 3.11.13, `.vision-work\venv\Scripts\python.exe` |
| PyTorch | 2.7.1+cpu |
| torchvision | 0.22.1+cpu |
| NumPy | 2.2.6 |
| Pillow | 11.2.1 |
| ONNX | 1.18.0 |
| ONNX Runtime | 1.22.0 |
| Device | CPU, four Torch threads, CUDA unavailable |

The portable Python installation briefly created a user-profile command shim at `C:\Users\Lenovo\.local\bin\python3.11.exe`. That single shim was removed immediately; the interpreter, virtual environment, packages, uv cache, Torch cache, temporary files, checkpoints, exports, and run artifacts all resolve under `.vision-work` on D:.

The successful run took 32.65 seconds after dependencies and the upstream checkpoint were cached. The first ONNX attempt exposed an unsupported non-factor adaptive pooling export (`7×7 → 4×4`). The head was minimally corrected to preserve and flatten the fixed `7×7` feature map; a later serialization-only `numpy.float32` boundary was converted to JSON numbers. The final run completed end to end with the original seed, augmentation set, and 100-epoch budget.
