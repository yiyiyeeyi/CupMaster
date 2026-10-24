#!/usr/bin/env python3
"""Task 9C-5.7 separate presence and heatmap tip localization experiment."""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import math
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from torch.utils.data import DataLoader, TensorDataset
from torchvision.models import (
    MobileNet_V3_Large_Weights,
    MobileNet_V3_Small_Weights,
    mobilenet_v3_large,
    mobilenet_v3_small,
)


SEED = 20260928
SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13))
PRESENCE_THRESHOLD = 0.50
HEATMAP_SIZE = 28
GAUSSIAN_SIGMA = 1.5
USABLE_NORMALIZED_ERROR = 0.50
PRIMARY_PRESET = "balanced"
BACKBONES = {
    "mobilenet_v3_small": {
        "constructor": mobilenet_v3_small,
        "weights": MobileNet_V3_Small_Weights.IMAGENET1K_V1,
        "featureChannels": 576,
        "source": "torchvision ImageNet-1K V1; BSD-3-Clause code and weight metadata documented by torchvision",
    },
    "mobilenet_v3_large": {
        "constructor": mobilenet_v3_large,
        "weights": MobileNet_V3_Large_Weights.IMAGENET1K_V2,
        "featureChannels": 960,
        "source": "torchvision ImageNet-1K V2; BSD-3-Clause code and weight metadata documented by torchvision",
    },
}


def load_module(path: Path, name: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--backbone", choices=tuple(BACKBONES), default="mobilenet_v3_small")
    return parser.parse_args()


class PresenceHeatmapHead(nn.Module):
    """Separate objectives over one compact spatial adapter."""

    def __init__(self, input_channels: int) -> None:
        super().__init__()
        self.adapter = nn.Sequential(
            nn.Conv2d(input_channels, 64, kernel_size=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
        )
        self.presence = nn.Sequential(
            nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(64, 1),
        )
        self.heatmap = nn.Sequential(
            nn.ConvTranspose2d(64, 32, kernel_size=4, stride=2, padding=1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(32, 16, kernel_size=4, stride=2, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(16, 1, kernel_size=1),
        )

    def forward(self, features: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        shared = self.adapter(features)
        return self.presence(shared).flatten(), self.heatmap(shared).squeeze(1)


def gaussian_heatmap(point: tuple[float, float], size: int = HEATMAP_SIZE, sigma: float = GAUSSIAN_SIGMA) -> torch.Tensor:
    if size < 2 or sigma <= 0:
        raise ValueError("Heatmap size and sigma must be positive")
    center_x = float(point[0]) * (size - 1)
    center_y = float(point[1]) * (size - 1)
    y, x = torch.meshgrid(torch.arange(size, dtype=torch.float32), torch.arange(size, dtype=torch.float32), indexing="ij")
    target = torch.exp(-((x - center_x) ** 2 + (y - center_y) ** 2) / (2 * sigma * sigma))
    total = target.sum()
    return target / total if total > 0 else target


def separate_loss(
    presence_logits: torch.Tensor,
    heatmap_logits: torch.Tensor,
    presence_targets: torch.Tensor,
    heatmap_targets: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    presence_loss = F.binary_cross_entropy_with_logits(presence_logits, presence_targets)
    positive = presence_targets > 0.5
    if positive.any():
        log_probabilities = F.log_softmax(heatmap_logits[positive].flatten(1), dim=1)
        localization_loss = -(heatmap_targets[positive].flatten(1) * log_probabilities).sum(dim=1).mean()
    else:
        localization_loss = heatmap_logits.sum() * 0
    return presence_loss + localization_loss, presence_loss, localization_loss


def decode_heatmap(logits: torch.Tensor) -> dict[str, Any]:
    size_y, size_x = logits.shape
    probabilities = F.softmax(logits.flatten(), dim=0).reshape(size_y, size_x)
    flat_index = int(torch.argmax(probabilities))
    argmax_y, argmax_x = divmod(flat_index, size_x)
    x_axis = torch.linspace(0.0, 1.0, size_x)
    y_axis = torch.linspace(0.0, 1.0, size_y)
    soft_x = float((probabilities.sum(dim=0) * x_axis).sum())
    soft_y = float((probabilities.sum(dim=1) * y_axis).sum())
    entropy = float(-(probabilities * torch.log(probabilities.clamp_min(1e-12))).sum())
    entropy /= math.log(size_x * size_y)
    return {
        "argmax": (argmax_x / (size_x - 1), argmax_y / (size_y - 1)),
        "softArgmax": (soft_x, soft_y),
        "peak": float(probabilities.max()),
        "normalizedEntropy": entropy,
    }


def binary_auc(labels: Iterable[bool], scores: Iterable[float]) -> float | None:
    pairs = sorted(zip(scores, labels, strict=True), key=lambda item: item[0])
    positive = sum(label for _, label in pairs)
    negative = len(pairs) - positive
    if not positive or not negative:
        return None
    rank_sum = 0.0
    index = 0
    while index < len(pairs):
        end = index + 1
        while end < len(pairs) and pairs[end][0] == pairs[index][0]:
            end += 1
        average_rank = ((index + 1) + end) / 2
        rank_sum += average_rank * sum(label for _, label in pairs[index:end])
        index = end
    return (rank_sum - positive * (positive + 1) / 2) / (positive * negative)


def average_precision(labels: Iterable[bool], scores: Iterable[float]) -> float | None:
    pairs = sorted(zip(scores, labels, strict=True), key=lambda item: item[0], reverse=True)
    positives = sum(label for _, label in pairs)
    if not positives:
        return None
    true_positive = 0
    precision_sum = 0.0
    for rank, (_, label) in enumerate(pairs, start=1):
        if label:
            true_positive += 1
            precision_sum += true_positive / rank
    return precision_sum / positives


def point_error(
    baseline: Any, manual: Any, example: Any, normalized_point: tuple[float, float], annotation: dict[str, Any],
) -> tuple[dict[str, float], float, float]:
    point_x, point_y = baseline.point_from_input(normalized_point, example.geometry)
    point = {"x": point_x, "y": point_y}
    target = annotation["objects"][0]["spoutTip"]
    pixel = math.hypot(point_x - target["x"], point_y - target["y"])
    return point, pixel, pixel / manual.effective_radius(annotation["dripper"])


def diagnostic_class(normalized_error: float, peak: float, entropy: float) -> str:
    if normalized_error <= 0.25:
        return "correctly_concentrated_near_gt"
    if peak < 0.003:
        return "effectively_absent"
    if entropy >= 0.80:
        return "diffuse"
    return "concentrated_on_wrong_structure"


def summarize_distribution(baseline: Any, values: Iterable[float]) -> dict[str, Any]:
    return baseline.distribution(list(values))


def evaluate_fold(
    baseline: Any,
    manual: Any,
    examples: list[Any],
    annotations: dict[str, dict[str, Any]],
    presence_logits: torch.Tensor,
    heatmap_logits: torch.Tensor,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    presence_probabilities = torch.sigmoid(presence_logits).tolist()
    records = []
    for example, presence_probability, logits in zip(examples, presence_probabilities, heatmap_logits, strict=True):
        annotation = annotations[example.frame["frameId"]]
        positive = bool(annotation["objects"])
        decoded = decode_heatmap(logits)
        record: dict[str, Any] = {
            "frameId": example.frame["frameId"], "session": example.frame["sessionId"],
            "timestampMs": example.frame["timestampMs"], "positive": positive,
            "presenceProbability": float(presence_probability),
            "presenceAccepted": presence_probability >= PRESENCE_THRESHOLD,
            "heatmapPeak": decoded["peak"], "heatmapNormalizedEntropy": decoded["normalizedEntropy"],
        }
        for method in ("argmax", "softArgmax"):
            point = baseline.point_from_input(decoded[method], example.geometry)
            record[method] = {"point": {"x": point[0], "y": point[1]}}
            if positive:
                source_point, error_px, normalized_error = point_error(
                    baseline, manual, example, decoded[method], annotation,
                )
                record[method].update({
                    "point": source_point, "errorPx": error_px, "normalizedError": normalized_error,
                    "usable": normalized_error <= USABLE_NORMALIZED_ERROR,
                })
        if positive:
            record["diagnostic"] = diagnostic_class(
                record["argmax"]["normalizedError"], decoded["peak"], decoded["normalizedEntropy"],
            )
        records.append(record)

    positives = [record for record in records if record["positive"]]
    negatives = [record for record in records if not record["positive"]]
    true_present = sum(record["presenceAccepted"] for record in positives)
    false_present = sum(record["presenceAccepted"] for record in negatives)
    precision_denominator = true_present + false_present
    labels = [record["positive"] for record in records]
    scores = [record["presenceProbability"] for record in records]
    localization = {}
    for method in ("argmax", "softArgmax"):
        normalized = [record[method]["normalizedError"] for record in positives]
        pixels = [record[method]["errorPx"] for record in positives]
        usable = sum(record[method]["usable"] for record in positives)
        overall_usable = sum(record["presenceAccepted"] and record[method]["usable"] for record in positives)
        localization[method] = {
            "predictionRateConditionedOnPositive": 1.0,
            "usableLocalizationRateConditionedOnPositive": usable / len(positives),
            "overallUsableLocateRate": overall_usable / len(positives),
            "pixelError": summarize_distribution(baseline, pixels),
            "normalizedError": summarize_distribution(baseline, normalized),
        }
    return {
        "counts": {"total": len(records), "positive": len(positives), "negative": len(negatives)},
        "presence": {
            "threshold": PRESENCE_THRESHOLD,
            "positiveRecall": true_present / len(positives),
            "negativeSpecificity": 1 - false_present / len(negatives),
            "precision": true_present / precision_denominator if precision_denominator else None,
            "falsePresent": false_present,
            "falseAbsent": len(positives) - true_present,
            "auroc": binary_auc(labels, scores), "prAucAveragePrecision": average_precision(labels, scores),
            "positiveProbability": summarize_distribution(baseline, (record["presenceProbability"] for record in positives)),
            "negativeProbability": summarize_distribution(baseline, (record["presenceProbability"] for record in negatives)),
        },
        "localization": localization,
        "diagnosticCounts": {
            name: sum(record.get("diagnostic") == name for record in positives)
            for name in (
                "correctly_concentrated_near_gt", "diffuse", "concentrated_on_wrong_structure", "effectively_absent",
            )
        },
    }, records


def train_fold(
    baseline: Any,
    head: PresenceHeatmapHead,
    features: torch.Tensor,
    examples: list[Any],
    epochs: int,
    seed: int,
    destination: Path,
) -> dict[str, Any]:
    presence = torch.tensor([example.presence for example in examples], dtype=torch.float32)
    heatmaps = torch.stack([
        gaussian_heatmap(example.point_target) if example.presence else torch.zeros(HEATMAP_SIZE, HEATMAP_SIZE)
        for example in examples
    ])
    generator = torch.Generator().manual_seed(seed)
    loader = DataLoader(TensorDataset(features, presence, heatmaps), batch_size=16, shuffle=True, generator=generator)
    torch.manual_seed(seed)
    optimizer = torch.optim.AdamW(head.parameters(), lr=2e-3, weight_decay=1e-4)
    history = []
    for epoch in range(1, epochs + 1):
        head.train()
        total_values: list[float] = []
        presence_values: list[float] = []
        localization_values: list[float] = []
        for batch_features, batch_presence, batch_heatmaps in loader:
            optimizer.zero_grad(set_to_none=True)
            presence_logits, heatmap_logits = head(batch_features)
            loss, presence_loss, localization_loss = separate_loss(
                presence_logits, heatmap_logits, batch_presence, batch_heatmaps,
            )
            loss.backward()
            optimizer.step()
            total_values.append(float(loss.detach()))
            presence_values.append(float(presence_loss.detach()))
            localization_values.append(float(localization_loss.detach()))
        if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
            history.append({
                "epoch": epoch,
                "totalLoss": statistics.fmean(total_values),
                "presenceBce": statistics.fmean(presence_values),
                "positiveOnlyHeatmapCrossEntropy": statistics.fmean(localization_values),
            })
    head.eval()
    destination.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"stateDict": copy.deepcopy(head.state_dict()), "epoch": epochs, "seed": seed}, destination)
    return {
        "selection": "fixed final epoch; held-out session excluded from training and selection",
        "epochs": epochs, "history": history, "checkpoint": str(destination),
        "checkpointSha256": baseline.sha256_file(destination),
    }


def count_parameters(module: nn.Module) -> int:
    return sum(parameter.numel() for parameter in module.parameters())


def benchmark_cpu(backbone: nn.Module, head: nn.Module, repeats: int = 30) -> dict[str, float]:
    inputs = torch.zeros(1, 3, 224, 224)
    with torch.inference_mode():
        for _ in range(5):
            head(backbone(inputs))
        started = time.perf_counter()
        for _ in range(repeats):
            head(backbone(inputs))
    elapsed = time.perf_counter() - started
    return {"repeats": repeats, "meanMilliseconds": elapsed * 1000 / repeats, "estimatedFps": repeats / elapsed}


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    baseline = load_module(repo_root / "scripts/vision/task9c2-baseline.py", "task9c2_baseline_957")
    experiment = load_module(repo_root / "scripts/vision/task9c5-2-global-local-keypoint.py", "task9c5_2_reused_957")
    data_module = load_module(repo_root / "scripts/vision/task9c5-3-targeted-retraining.py", "task9c5_3_data_957")
    manual = load_module(repo_root / "scripts/vision/task9c5-5-manual-roi-localization.py", "task9c5_5_manual_957")
    baseline.set_determinism()
    torch.hub.set_dir(str(work_root / "cache/torch/hub"))
    frames, annotations = data_module.load_records(repo_root, work_root)
    experiment.open_image = lambda root, frame: data_module.open_development_image(root, work_root, frame)
    eligible = [frame for frame in frames if annotations[frame["frameId"]].get("dripper")]
    if any(frame["sessionId"] not in SESSIONS for frame in eligible):
        raise RuntimeError("Forbidden session entered development data")

    configuration = BACKBONES[args.backbone]
    model = configuration["constructor"](weights=configuration["weights"])
    backbone = model.features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)
    run_dir = work_root / "runs/task-9c5-7" / args.backbone
    checkpoint_dir = work_root / "checkpoints/task-9c5-7" / args.backbone
    eval_dir = work_root / "eval/task-9c5-7" / args.backbone
    for directory in (run_dir, checkpoint_dir, eval_dir):
        directory.mkdir(parents=True, exist_ok=True)

    folds: dict[str, Any] = {}
    all_records: list[dict[str, Any]] = []
    started = time.time()
    for fold_index, heldout in enumerate(SESSIONS):
        train_frames = [frame for frame in eligible if frame["sessionId"] != heldout]
        test_frames = [frame for frame in eligible if frame["sessionId"] == heldout]
        train_examples = manual.manual_examples(
            baseline, experiment, repo_root, train_frames, annotations, baseline.AUGMENTATIONS, PRIMARY_PRESET,
        )
        test_examples = manual.manual_examples(
            baseline, experiment, repo_root, test_frames, annotations, ("identity",), PRIMARY_PRESET,
        )
        train_features = baseline.extract_features(backbone, train_examples)
        test_features = baseline.extract_features(backbone, test_examples)
        seed = SEED + fold_index * 100
        torch.manual_seed(seed)
        head = PresenceHeatmapHead(configuration["featureChannels"])
        training = train_fold(
            baseline, head, train_features, train_examples, args.epochs, seed,
            checkpoint_dir / "loso" / heldout / "presence-heatmap.head.pt",
        )
        with torch.inference_mode():
            presence_logits, heatmap_logits = head(test_features)
        metrics, records = evaluate_fold(
            baseline, manual, test_examples, annotations, presence_logits, heatmap_logits,
        )
        metrics["heldoutSession"] = heldout
        metrics["trainSessions"] = [session for session in SESSIONS if session != heldout]
        metrics["training"] = training
        folds[heldout] = metrics
        all_records.extend(records)
        print(f"completed {args.backbone} {heldout} fold", flush=True)

    probe_head = PresenceHeatmapHead(configuration["featureChannels"]).eval()
    results = {
        "status": "complete",
        "backbone": {
            "name": args.backbone,
            "backboneParameters": count_parameters(backbone),
            "headParameters": count_parameters(probe_head),
            "featureShape": [configuration["featureChannels"], 7, 7],
            "sourceAndLicense": configuration["source"],
            "cpuEstimate": benchmark_cpu(backbone, probe_head),
        },
        "protocol": {
            "sessions": SESSIONS, "method": "seven-fold leave-one-session-out",
            "manualSearchPreset": PRIMARY_PRESET, "presenceThreshold": PRESENCE_THRESHOLD,
            "heatmapResolution": [HEATMAP_SIZE, HEATMAP_SIZE], "gaussianSigmaHeatmapPixels": GAUSSIAN_SIGMA,
            "presenceLoss": "binary cross entropy with logits on positives and intentional negatives",
            "localizationLoss": "spatial cross entropy against normalized Gaussian, positives only; negatives masked",
            "primaryDecoder": "argmax", "secondaryDecoder": "soft-argmax",
            "usableLocalizationDefinition": f"normalized tip error <= {USABLE_NORMALIZED_ERROR}",
            "session014Accessed": False, "externalBenchmarkAccessed": False,
        },
        "folds": folds,
        "elapsedSeconds": time.time() - started,
        "onnx": {"exported": False, "reason": "export allowed only after experiment gate passes"},
    }
    (run_dir / "results.json").write_text(json.dumps(results, indent=2, default=float), encoding="utf-8")
    (eval_dir / "predictions.json").write_text(json.dumps(all_records, indent=2, default=float), encoding="utf-8")
    print(json.dumps({"results": str(run_dir / "results.json"), "predictions": str(eval_dir / "predictions.json")}, indent=2))


if __name__ == "__main__":
    main()
