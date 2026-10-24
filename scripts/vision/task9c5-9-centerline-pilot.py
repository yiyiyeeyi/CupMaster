#!/usr/bin/env python3
"""Task 9C-5.9 session-aware visible-spout centerline pilot."""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import math
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from torch.utils.data import DataLoader, TensorDataset
from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large


SEED = 20260929
SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13))
FORBIDDEN = {"session-014"} | {f"session-{value:03d}" for value in range(5, 11)}
HEATMAP_SIZE = 56
CENTERLINE_SIGMA = 1.5
TIP_SIGMA = 1.5
PRESENCE_THRESHOLD = 0.50
LINE_THRESHOLD = 0.50
LINE_TOLERANCE_RADIUS = 0.10
ENDPOINT_TOLERANCE_RADIUS = 0.15
USABLE_TIP_ERROR = 0.50
PRIMARY_PRESET = "balanced"
FORMULATIONS = ("centerline_only", "centerline_tip")


@dataclass
class CenterlineExample:
    frame: dict[str, Any]
    annotation: dict[str, Any]
    tensor: torch.Tensor
    geometry: Any
    augmentation: str
    centerline: list[dict[str, float]] | None

    @property
    def positive(self) -> bool:
        return self.centerline is not None


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
    parser.add_argument("--epochs", type=int, default=60)
    return parser.parse_args()


class CenterlineHead(nn.Module):
    """Shared spatial adapter with independent structure and optional tip heads."""

    def __init__(self, input_channels: int, with_tip: bool) -> None:
        super().__init__()
        self.with_tip = with_tip
        self.adapter = nn.Sequential(
            nn.Conv2d(input_channels, 64, kernel_size=1), nn.BatchNorm2d(64), nn.ReLU(inplace=True),
        )
        self.presence = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(64, 1))
        self.decoder = nn.Sequential(
            nn.ConvTranspose2d(64, 48, kernel_size=4, stride=2, padding=1), nn.ReLU(inplace=True),
            nn.ConvTranspose2d(48, 32, kernel_size=4, stride=2, padding=1), nn.ReLU(inplace=True),
            nn.ConvTranspose2d(32, 16, kernel_size=4, stride=2, padding=1), nn.ReLU(inplace=True),
        )
        self.centerline = nn.Conv2d(16, 1, kernel_size=1)
        self.tip = nn.Conv2d(16, 1, kernel_size=1) if with_tip else None

    def forward(self, features: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor | None]:
        shared = self.adapter(features)
        spatial = self.decoder(shared)
        tip = self.tip(spatial).squeeze(1) if self.tip is not None else None
        return self.presence(shared).flatten(), self.centerline(spatial).squeeze(1), tip


def transform_points(baseline: Any, points: list[dict[str, float]], geometry: Any) -> list[tuple[float, float]]:
    return [baseline.point_to_input(point, geometry) for point in points]


def distance_to_polyline(
    points: list[tuple[float, float]], size: int = HEATMAP_SIZE,
) -> torch.Tensor:
    if len(points) < 2:
        raise ValueError("Centerline requires at least two points")
    coordinates = torch.tensor(points, dtype=torch.float32) * (size - 1)
    y, x = torch.meshgrid(torch.arange(size), torch.arange(size), indexing="ij")
    grid = torch.stack((x, y), dim=-1).to(torch.float32)
    minimum = torch.full((size, size), float("inf"))
    for start, end in zip(coordinates, coordinates[1:]):
        delta = end - start
        denominator = torch.dot(delta, delta)
        if denominator <= 1e-8:
            continue
        fraction = ((grid - start) * delta).sum(dim=-1) / denominator
        projection = start + fraction.clamp(0, 1).unsqueeze(-1) * delta
        minimum = torch.minimum(minimum, torch.linalg.vector_norm(grid - projection, dim=-1))
    if not torch.isfinite(minimum).all():
        raise ValueError("Degenerate centerline")
    return minimum


def soft_tube(points: list[tuple[float, float]], size: int = HEATMAP_SIZE, sigma: float = CENTERLINE_SIGMA) -> torch.Tensor:
    if sigma <= 0:
        raise ValueError("Centerline sigma must be positive")
    distance = distance_to_polyline(points, size)
    return torch.exp(-(distance ** 2) / (2 * sigma * sigma))


def tip_gaussian(point: tuple[float, float], size: int = HEATMAP_SIZE, sigma: float = TIP_SIGMA) -> torch.Tensor:
    if sigma <= 0:
        raise ValueError("Tip sigma must be positive")
    center_x, center_y = point[0] * (size - 1), point[1] * (size - 1)
    y, x = torch.meshgrid(torch.arange(size), torch.arange(size), indexing="ij")
    target = torch.exp(-((x - center_x) ** 2 + (y - center_y) ** 2) / (2 * sigma * sigma))
    return target / target.sum().clamp_min(1e-12)


def pilot_loss(
    presence_logits: torch.Tensor,
    centerline_logits: torch.Tensor,
    tip_logits: torch.Tensor | None,
    presence_targets: torch.Tensor,
    centerline_targets: torch.Tensor,
    tip_targets: torch.Tensor,
) -> tuple[torch.Tensor, dict[str, float]]:
    presence = F.binary_cross_entropy_with_logits(presence_logits, presence_targets)
    probabilities = torch.sigmoid(centerline_logits)
    positive = presence_targets > 0.5
    positive_loss = centerline_logits.sum() * 0
    if positive.any():
        predictions = probabilities[positive]
        targets = centerline_targets[positive]
        intersection = (predictions * targets).flatten(1).sum(dim=1)
        dice = 1 - ((2 * intersection + 1) / (
            predictions.flatten(1).sum(dim=1) + targets.flatten(1).sum(dim=1) + 1
        ))
        weights = 1 + 12 * targets
        weighted_bce = (F.binary_cross_entropy_with_logits(
            centerline_logits[positive], targets, reduction="none",
        ) * weights).mean(dim=(1, 2))
        positive_loss = (dice + 0.25 * weighted_bce).mean()
    negative_loss = centerline_logits.sum() * 0
    if (~positive).any():
        negative_loss = F.binary_cross_entropy_with_logits(
            centerline_logits[~positive], torch.zeros_like(centerline_logits[~positive]),
        )
    centerline = positive_loss + 0.5 * negative_loss
    tip = centerline_logits.sum() * 0
    if tip_logits is not None and positive.any():
        log_probabilities = F.log_softmax(tip_logits[positive].flatten(1), dim=1)
        tip = -(tip_targets[positive].flatten(1) * log_probabilities).sum(dim=1).mean()
    total = presence + 2 * centerline + tip
    return total, {
        "presenceBce": float(presence.detach()),
        "centerlineLoss": float(centerline.detach()),
        "tipSpatialCrossEntropy": float(tip.detach()),
    }


def build_examples(
    baseline: Any,
    manual: Any,
    data_module: Any,
    repo_root: Path,
    work_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    centerlines: dict[str, list[dict[str, float]]],
) -> list[CenterlineExample]:
    examples = []
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        image = data_module.open_development_image(repo_root, work_root, frame)
        crop = manual.crop_tuple(manual.search_region(annotation, frame, PRIMARY_PRESET))
        line = centerlines.get(frame["frameId"])
        for augmentation in baseline.AUGMENTATIONS:
            tensor, geometry = baseline.prepare_image(image, augmentation, crop)
            examples.append(CenterlineExample(frame, annotation, tensor, geometry, augmentation, line))
    return examples


def targets_for_examples(baseline: Any, examples: list[CenterlineExample]) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    presence = torch.tensor([example.positive for example in examples], dtype=torch.float32)
    tubes = []
    tips = []
    for example in examples:
        if example.centerline:
            transformed = transform_points(baseline, example.centerline, example.geometry)
            tubes.append(soft_tube(transformed))
            tips.append(tip_gaussian(transformed[0]))
        else:
            tubes.append(torch.zeros(HEATMAP_SIZE, HEATMAP_SIZE))
            tips.append(torch.zeros(HEATMAP_SIZE, HEATMAP_SIZE))
    return presence, torch.stack(tubes), torch.stack(tips)


def train_head(
    baseline: Any,
    formulation: str,
    features: torch.Tensor,
    presence: torch.Tensor,
    tubes: torch.Tensor,
    tips: torch.Tensor,
    epochs: int,
    seed: int,
    destination: Path,
) -> tuple[CenterlineHead, dict[str, Any]]:
    torch.manual_seed(seed)
    head = CenterlineHead(960, formulation == "centerline_tip")
    optimizer = torch.optim.AdamW(head.parameters(), lr=2e-3, weight_decay=1e-4)
    generator = torch.Generator().manual_seed(seed)
    loader = DataLoader(TensorDataset(features, presence, tubes, tips), batch_size=16, shuffle=True, generator=generator)
    history = []
    for epoch in range(1, epochs + 1):
        head.train()
        totals = []
        components: dict[str, list[float]] = {"presenceBce": [], "centerlineLoss": [], "tipSpatialCrossEntropy": []}
        for batch_features, batch_presence, batch_tubes, batch_tips in loader:
            optimizer.zero_grad(set_to_none=True)
            raw_presence, raw_tubes, raw_tips = head(batch_features)
            loss, values = pilot_loss(raw_presence, raw_tubes, raw_tips, batch_presence, batch_tubes, batch_tips)
            loss.backward()
            optimizer.step()
            totals.append(float(loss.detach()))
            for name, value in values.items():
                components[name].append(value)
        if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
            history.append({"epoch": epoch, "totalLoss": statistics.fmean(totals), **{
                name: statistics.fmean(values) for name, values in components.items()
            }})
    head.eval()
    destination.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "stateDict": copy.deepcopy(head.state_dict()), "formulation": formulation,
        "epoch": epochs, "seed": seed,
    }, destination)
    return head, {
        "selection": "fixed final epoch; held-out session excluded from training and selection",
        "epochs": epochs, "checkpoint": str(destination),
        "checkpointSha256": baseline.sha256_file(destination), "history": history,
    }


def largest_component(mask: np.ndarray) -> tuple[np.ndarray, float, int]:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if count <= 1:
        return np.zeros_like(mask, dtype=bool), 0.0, 0
    areas = stats[1:, cv2.CC_STAT_AREA]
    selected = int(np.argmax(areas)) + 1
    total = int(areas.sum())
    return labels == selected, float(areas[selected - 1] / total), count - 1


def heatmap_point_to_source(baseline: Any, row: float, column: float, geometry: Any) -> tuple[float, float]:
    return baseline.point_from_input((column / (HEATMAP_SIZE - 1), row / (HEATMAP_SIZE - 1)), geometry)


def line_endpoint_candidates(mask: np.ndarray) -> list[tuple[int, int]]:
    points = np.column_stack(np.nonzero(mask))
    if len(points) <= 1:
        return [tuple(map(int, point)) for point in points]
    xy = points[:, ::-1].astype(np.int32)
    hull = cv2.convexHull(xy).reshape(-1, 2)
    if len(hull) == 1:
        return [(int(hull[0, 1]), int(hull[0, 0]))]
    differences = hull[:, None, :] - hull[None, :, :]
    pair = np.unravel_index(np.argmax((differences ** 2).sum(axis=2)), (len(hull), len(hull)))
    return [(int(hull[index, 1]), int(hull[index, 0])) for index in pair]


def line_geometry_metrics(
    predicted: np.ndarray,
    gt_distance: np.ndarray,
    radius_grid: float,
) -> dict[str, Any]:
    gt = gt_distance <= 0.75
    predicted_points = np.column_stack(np.nonzero(predicted))
    gt_points = np.column_stack(np.nonzero(gt))
    if not len(predicted_points):
        return {
            "meanGtToPredictionDistanceNormalized": None,
            "meanPredictionToGtDistanceNormalized": None,
            "symmetricDistanceNormalized": None,
            "predictedPrecisionWithinTolerance": 0.0,
            "gtCoverageWithinTolerance": 0.0,
        }
    distances = np.linalg.norm(gt_points[:, None, :] - predicted_points[None, :, :], axis=2)
    gt_to_prediction = distances.min(axis=1)
    prediction_to_gt = distances.min(axis=0)
    tolerance = LINE_TOLERANCE_RADIUS * radius_grid
    gt_mean = float(gt_to_prediction.mean() / radius_grid)
    prediction_mean = float(prediction_to_gt.mean() / radius_grid)
    return {
        "meanGtToPredictionDistanceNormalized": gt_mean,
        "meanPredictionToGtDistanceNormalized": prediction_mean,
        "symmetricDistanceNormalized": (gt_mean + prediction_mean) / 2,
        "predictedPrecisionWithinTolerance": float((prediction_to_gt <= tolerance).mean()),
        "gtCoverageWithinTolerance": float((gt_to_prediction <= tolerance).mean()),
    }


def choose_centerline_tip(baseline: Any, mask: np.ndarray, example: CenterlineExample) -> tuple[float, float] | None:
    endpoints = line_endpoint_candidates(mask)
    if not endpoints:
        return None
    dripper = example.annotation["dripper"]
    center = (dripper["centerX"], dripper["centerY"])
    candidates = [heatmap_point_to_source(baseline, row, column, example.geometry) for row, column in endpoints]
    return min(candidates, key=lambda point: math.hypot(point[0] - center[0], point[1] - center[1]))


def tip_metrics(
    predicted: tuple[float, float] | None, example: CenterlineExample, mask: np.ndarray, manual: Any,
) -> dict[str, Any]:
    if predicted is None:
        return {"point": None, "normalizedError": None, "usable": False, "tipToCenterlineNormalized": None, "nearEndpoint": False}
    target = example.annotation["objects"][0]["spoutTip"]
    radius = manual.effective_radius(example.annotation["dripper"])
    error = math.hypot(predicted[0] - target["x"], predicted[1] - target["y"])
    mask_points = np.column_stack(np.nonzero(mask))
    tip_grid = np.array([
        (predicted[1] - example.geometry.crop_y) * example.geometry.scale + example.geometry.pad_y,
        (predicted[0] - example.geometry.crop_x) * example.geometry.scale + example.geometry.pad_x,
    ]) / 224 * (HEATMAP_SIZE - 1)
    distance_grid = float(np.linalg.norm(mask_points - tip_grid, axis=1).min()) if len(mask_points) else float("inf")
    radius_grid = radius * example.geometry.scale / 224 * (HEATMAP_SIZE - 1)
    endpoints = line_endpoint_candidates(mask)
    endpoint_distance = min((float(np.linalg.norm(np.array(endpoint) - tip_grid)) for endpoint in endpoints), default=float("inf"))
    return {
        "point": {"x": predicted[0], "y": predicted[1]}, "errorPx": error,
        "normalizedError": error / radius, "usable": error / radius <= USABLE_TIP_ERROR,
        "tipToCenterlineNormalized": distance_grid / radius_grid,
        "tipToNearestPredictedEndpointNormalized": endpoint_distance / radius_grid,
        "nearEndpoint": endpoint_distance / radius_grid <= ENDPOINT_TOLERANCE_RADIUS,
    }


def distribution(baseline: Any, values: Iterable[float | None]) -> dict[str, Any]:
    return baseline.distribution(value for value in values if value is not None and math.isfinite(value))


def evaluate(
    baseline: Any,
    manual: Any,
    formulation: str,
    examples: list[CenterlineExample],
    presence_logits: torch.Tensor,
    centerline_logits: torch.Tensor,
    tip_logits: torch.Tensor | None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    presence_probabilities = torch.sigmoid(presence_logits).cpu().numpy()
    line_probabilities = torch.sigmoid(centerline_logits).cpu().numpy()
    records = []
    for index, (example, presence_probability, line_probability) in enumerate(zip(
        examples, presence_probabilities, line_probabilities, strict=True,
    )):
        raw_mask = line_probability >= LINE_THRESHOLD
        mask, coherence, components = largest_component(raw_mask)
        accepted = bool(presence_probability >= PRESENCE_THRESHOLD and mask.any())
        record: dict[str, Any] = {
            "frameId": example.frame["frameId"], "session": example.frame["sessionId"],
            "timestampMs": example.frame["timestampMs"], "positive": example.positive,
            "presenceProbability": float(presence_probability), "presenceAccepted": accepted,
            "linePeak": float(line_probability.max()), "componentCount": components,
            "largestComponentFraction": coherence,
        }
        if example.positive:
            transformed = transform_points(baseline, example.centerline or [], example.geometry)
            gt_distance = distance_to_polyline(transformed).numpy()
            radius = manual.effective_radius(example.annotation["dripper"])
            radius_grid = radius * example.geometry.scale / 224 * (HEATMAP_SIZE - 1)
            record["centerline"] = line_geometry_metrics(mask, gt_distance, radius_grid)
            if formulation == "centerline_tip" and tip_logits is not None:
                flat = int(torch.argmax(tip_logits[index]))
                row, column = divmod(flat, HEATMAP_SIZE)
                predicted_tip = heatmap_point_to_source(baseline, row, column, example.geometry)
            else:
                predicted_tip = choose_centerline_tip(baseline, mask, example)
            record["tip"] = tip_metrics(predicted_tip, example, mask, manual)
        records.append(record)

    positives = [record for record in records if record["positive"]]
    negatives = [record for record in records if not record["positive"]]
    accepted_positives = [record for record in positives if record["presenceAccepted"]]
    false_present = sum(record["presenceAccepted"] for record in negatives)
    return {
        "counts": {"total": len(records), "positive": len(positives), "negative": len(negatives)},
        "presence": {
            "threshold": PRESENCE_THRESHOLD,
            "positiveRecall": len(accepted_positives) / len(positives),
            "negativeSpecificity": 1 - false_present / len(negatives),
            "negativeFalsePositiveRate": false_present / len(negatives),
            "falsePresent": false_present, "falseAbsent": len(positives) - len(accepted_positives),
            "positiveProbability": distribution(baseline, (record["presenceProbability"] for record in positives)),
            "negativeProbability": distribution(baseline, (record["presenceProbability"] for record in negatives)),
        },
        "centerline": {
            "evaluated": len(positives),
            "symmetricDistanceNormalized": distribution(baseline, (record["centerline"]["symmetricDistanceNormalized"] for record in positives)),
            "predictedPrecisionWithinTolerance": distribution(baseline, (record["centerline"]["predictedPrecisionWithinTolerance"] for record in positives)),
            "gtCoverageWithinTolerance": distribution(baseline, (record["centerline"]["gtCoverageWithinTolerance"] for record in positives)),
            "largestComponentFraction": distribution(baseline, (record["largestComponentFraction"] for record in positives)),
            "coherentSingleComponentRate": sum(record["componentCount"] == 1 for record in positives) / len(positives),
        },
        "tip": {
            "normalizedError": distribution(baseline, (record["tip"]["normalizedError"] for record in positives)),
            "usableLocateRate": sum(record["presenceAccepted"] and record["tip"]["usable"] for record in positives) / len(positives),
            "tipToCenterlineNormalized": distribution(baseline, (record["tip"]["tipToCenterlineNormalized"] for record in positives)),
            "nearPredictedEndpointRate": sum(record["tip"]["nearEndpoint"] for record in positives) / len(positives),
        },
    }, records


def count_parameters(module: nn.Module) -> int:
    return sum(parameter.numel() for parameter in module.parameters())


def baseline_comparisons(work_root: Path, frame_ids: set[str], eligible_ids: set[str]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    bbox_path = work_root / "eval/task-9c5-8/predictions.json"
    if bbox_path.exists():
        records = json.loads(bbox_path.read_text(encoding="utf-8"))["mobilenet_v3_large"]
        records = [record for record in records if record["frameId"] in eligible_ids]
        output["bboxOnlyTask9c5_8MobileNetV3Large"] = {
            session: {
                "pilotPositiveRecall": sum(record["accepted"] for record in records if record["session"] == session and record["frameId"] in frame_ids) /
                sum(record["frameId"] in frame_ids for record in records if record["session"] == session),
                "negativeSpecificity": 1 - sum(record["accepted"] for record in records if record["session"] == session and record["frameId"] not in frame_ids) /
                sum(record["frameId"] not in frame_ids for record in records if record["session"] == session),
            } for session in SESSIONS
        }
    tip_path = work_root / "eval/task-9c5-7/mobilenet_v3_large/predictions.json"
    if tip_path.exists():
        records = [record for record in json.loads(tip_path.read_text(encoding="utf-8")) if record["frameId"] in frame_ids]
        output["directTipTask9c5_7MobileNetV3Large"] = {
            session: {
                "normalizedError": {
                    "mean": statistics.fmean(record["argmax"]["normalizedError"] for record in records if record["session"] == session),
                    "median": statistics.median(record["argmax"]["normalizedError"] for record in records if record["session"] == session),
                },
                "usableLocateRate": sum(
                    record["presenceAccepted"] and record["argmax"]["usable"] for record in records if record["session"] == session
                ) / sum(record["session"] == session for record in records),
            } for session in SESSIONS
        }
    return output


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    baseline = load_module(repo_root / "scripts/vision/task9c2-baseline.py", "task9c2_baseline_959")
    data_module = load_module(repo_root / "scripts/vision/task9c5-3-targeted-retraining.py", "task9c5_3_data_959_pilot")
    manual = load_module(repo_root / "scripts/vision/task9c5-5-manual-roi-localization.py", "task9c5_5_manual_959_pilot")
    baseline.set_determinism()
    torch.hub.set_dir(str(work_root / "cache/torch/hub"))

    merged_path = work_root / "datasets/task-9c5-9/annotations/centerline-pilot-v0.training-ready.json"
    merged = json.loads(merged_path.read_text(encoding="utf-8"))
    if merged.get("status") != "training_ready" or len(merged.get("annotations", [])) != 62:
        raise RuntimeError("Centerline annotations are not training-ready 62/62")
    centerlines = {
        record["frameId"]: record["gooseneckSpoutCenterline"]["points"] for record in merged["annotations"]
    }
    frames, annotations = data_module.load_records(repo_root, work_root)
    frames_by_id = {frame["frameId"]: frame for frame in frames}
    if set(centerlines) - set(frames_by_id):
        raise RuntimeError("Centerline frame missing from development source")
    negatives = [frame for frame in frames if not annotations[frame["frameId"]]["objects"] and annotations[frame["frameId"]].get("dripper")]
    selected = [frames_by_id[frame_id] for frame_id in centerlines]
    eligible = selected + negatives
    if set(frame["sessionId"] for frame in eligible) != set(SESSIONS):
        raise RuntimeError("Pilot session coverage mismatch")
    if any(frame["sessionId"] in FORBIDDEN for frame in eligible):
        raise RuntimeError("Forbidden session entered centerline pilot")

    examples = build_examples(baseline, manual, data_module, repo_root, work_root, eligible, annotations, centerlines)
    model = mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.IMAGENET1K_V2)
    backbone = model.features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)
    features = baseline.extract_features(backbone, examples)
    presence, tubes, tips = targets_for_examples(baseline, examples)

    run_dir = work_root / "runs/task-9c5-9"
    eval_dir = work_root / "eval/task-9c5-9"
    checkpoint_dir = work_root / "checkpoints/task-9c5-9"
    for directory in (run_dir, eval_dir, checkpoint_dir):
        directory.mkdir(parents=True, exist_ok=True)
    folds: dict[str, dict[str, Any]] = {formulation: {} for formulation in FORMULATIONS}
    predictions: dict[str, list[dict[str, Any]]] = {formulation: [] for formulation in FORMULATIONS}
    started = time.time()
    for fold_index, heldout in enumerate(SESSIONS):
        train_indexes = [index for index, example in enumerate(examples) if example.frame["sessionId"] != heldout]
        test_indexes = [index for index, example in enumerate(examples) if example.frame["sessionId"] == heldout and example.augmentation == "identity"]
        for formulation_index, formulation in enumerate(FORMULATIONS):
            seed = SEED + fold_index * 100 + formulation_index * 1000
            head, training = train_head(
                baseline, formulation, features[train_indexes], presence[train_indexes], tubes[train_indexes], tips[train_indexes],
                args.epochs, seed, checkpoint_dir / formulation / "loso" / heldout / "head.pt",
            )
            with torch.inference_mode():
                raw_presence, raw_lines, raw_tips = head(features[test_indexes])
            metrics, records = evaluate(
                baseline, manual, formulation, [examples[index] for index in test_indexes], raw_presence, raw_lines, raw_tips,
            )
            metrics["training"] = training
            folds[formulation][heldout] = metrics
            predictions[formulation].extend(records)
            print(f"completed {formulation} {heldout}", flush=True)

    selected_ids = set(centerlines)
    eligible_ids = {frame["frameId"] for frame in eligible}
    probe_only = CenterlineHead(960, False)
    probe_joint = CenterlineHead(960, True)
    result = {
        "status": "complete",
        "dataset": {
            "pilotPositiveCount": len(selected), "negativeCount": len(negatives),
            "perSessionPositive": {session: sum(frame["sessionId"] == session for frame in selected) for session in SESSIONS},
            "perSessionNegative": {session: sum(frame["sessionId"] == session for frame in negatives) for session in SESSIONS},
        },
        "protocol": {
            "method": "seven-fold leave-one-session-out", "sessions": SESSIONS,
            "backbone": "torchvision MobileNetV3-large ImageNet-1K V2, frozen",
            "manualSearchPreset": PRIMARY_PRESET,
            "target": {
                "resolution": [HEATMAP_SIZE, HEATMAP_SIZE],
                "centerline": "Euclidean distance-to-polyline Gaussian soft tube",
                "centerlineSigmaHeatmapPixels": CENTERLINE_SIGMA,
                "tip": "separate normalized 2D Gaussian",
                "tipSigmaHeatmapPixels": TIP_SIGMA,
                "presenceThreshold": PRESENCE_THRESHOLD, "lineThreshold": LINE_THRESHOLD,
                "lineToleranceEffectiveRadius": LINE_TOLERANCE_RADIUS,
                "endpointToleranceEffectiveRadius": ENDPOINT_TOLERANCE_RADIUS,
            },
            "loss": {
                "presence": "binary cross entropy",
                "centerline": "positive soft Dice + weighted BCE; negative BCE suppression",
                "tip": "positive-only spatial cross entropy; absent in centerline-only",
            },
            "session014Accessed": False, "externalBenchmarkAccessed": False,
        },
        "model": {
            "backboneParameters": count_parameters(backbone),
            "centerlineOnlyHeadParameters": count_parameters(probe_only),
            "centerlineTipHeadParameters": count_parameters(probe_joint),
        },
        "baselines": baseline_comparisons(work_root, selected_ids, eligible_ids),
        "folds": folds,
        "elapsedSeconds": time.time() - started,
        "onnx": {"exported": False, "reason": "Task explicitly forbids ONNX export"},
    }
    (run_dir / "results.json").write_text(json.dumps(result, indent=2, default=float), encoding="utf-8")
    (eval_dir / "predictions.json").write_text(json.dumps(predictions, indent=2, default=float), encoding="utf-8")
    print(json.dumps({"results": str(run_dir / "results.json"), "predictions": str(eval_dir / "predictions.json")}, indent=2))


if __name__ == "__main__":
    main()
