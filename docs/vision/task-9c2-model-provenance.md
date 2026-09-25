# Task 9C-2 model provenance

Status: **verified after checkpoint download and export**

This record is an engineering provenance audit, not legal advice.

## Framework decision

The preferred RTMDet-tiny/MMDetection and RTMPose stack cannot be exercised responsibly in the current Windows CPU-only host without adding MMCV/MMDeploy native build risk. No system Python, usable WSL distro, CUDA driver, or NVIDIA GPU is available. The baseline therefore uses the 9C-1 fallback path with standard PyTorch/torchvision operators. No Ultralytics code or weights are used.

## Framework provenance

| Component | Planned version | Source | License | Product note |
| --- | --- | --- | --- | --- |
| PyTorch | 2.7.1 CPU | `https://download.pytorch.org/whl/cpu` | BSD-3-Clause | Permissive framework; retain notices |
| torchvision | 0.22.1 CPU | `https://download.pytorch.org/whl/cpu` | BSD-3-Clause | Permissive framework; retain notices |
| ONNX | 1.18.0 | PyPI | Apache-2.0 | Export tooling only |
| ONNX Runtime | 1.22.0 | PyPI | MIT | Offline parity check only |

## Checkpoint provenance

One upstream checkpoint is permitted for this internal feasibility run:

| Field | Value |
| --- | --- |
| Model | `MobileNet_V3_Small_Weights.IMAGENET1K_V1` |
| Architecture | torchvision MobileNetV3-small |
| Source URL | `https://download.pytorch.org/models/mobilenet_v3_small-047dcff4.pth` |
| Publisher | PyTorch / torchvision |
| Expected digest identifier | filename hash prefix `047dcff4` |
| Training data | ImageNet-1K, as identified by torchvision metadata |
| Code license | torchvision BSD-3-Clause |
| Standalone checkpoint license | No separate weight license is stated in the torchvision weight metadata |
| Commercial implication | Internal feasibility use only; do not ship or redistribute the upstream-derived weights until checkpoint and ImageNet training-data terms receive an explicit product/legal review |

The actual SHA-256, byte size, local cache path, package versions, and source commit metadata will be recorded immediately after download. If the URL or expected identity differs, training must stop.

Actual downloaded checkpoint:

| Field | Verified value |
| --- | --- |
| Local path | `.vision-work\cache\torch\hub\checkpoints\mobilenet_v3_small-047dcff4.pth` |
| Size | 10,306,551 bytes |
| SHA-256 | `047dcff4addef86ea5bc2eff13c9614dc11f47ab1160d0a71a25e7db994f4e1f` |
| Identity check | Full digest begins with published filename identifier `047dcff4` |

Installed framework versions are PyTorch `2.7.1+cpu` and torchvision `0.22.1+cpu`. The baseline uses the torchvision release implementation, not a floating repository checkout; the package version is the reproducibility identity. The requirements are pinned in `scripts/vision/task9c2-requirements.txt`.

## CupMaster checkpoints

The A1, B0, and B1 heads are CupMaster experiment artifacts trained only from sessions 001–002. They remain ignored under `.vision-work/checkpoints/task-9c2`. Because they depend on the upstream feature extractor, the same upstream checkpoint review applies before production distribution.

| Head | Best validation epoch | Checkpoint SHA-256 |
| --- | ---: | --- |
| A1 full-frame keypoint | 4 | `330109e305d4a72dfb3cfd84f9548988f7d12b62ffff28b69598c60417d0e6cc` |
| B0 detector | 100 | `c4f5485fef50b84767a94fa78573e444550fd70eb4c4cecba537f4e322716883` |
| B1 GT-ROI keypoint | 57 | `35ec188674a3c1b7e02965dd87d1f37f5be0e99a57bcd3641144882b53fcf5ab` |

The B0 head is a single-target objectness plus normalized bbox regressor; A1/B1 are objectness plus normalized point regressors. They are feasibility heads, not substitutes claimed equivalent to RTMDet or RTMPose.

## References

- [PyTorch license](https://github.com/pytorch/pytorch/blob/main/LICENSE)
- [torchvision license](https://github.com/pytorch/vision/blob/main/LICENSE)
- [torchvision MobileNetV3 source and weight metadata](https://github.com/pytorch/vision/blob/main/torchvision/models/mobilenetv3.py)
- [ONNX license](https://github.com/onnx/onnx/blob/main/LICENSE)
- [ONNX Runtime license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE)
