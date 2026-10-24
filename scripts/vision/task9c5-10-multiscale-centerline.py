#!/usr/bin/env python3
"""Task 9C-5.10 multi-scale centerline and endpoint-on-curve pilot."""

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
from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large


SEED = 20260929
SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13))
FORBIDDEN = {"session-014"} | {f"session-{value:03d}" for value in range(5, 11)}
PRESENCE_THRESHOLD = 0.50
LINE_THRESHOLD = 0.50
LINE_TOLERANCE_RADIUS = 0.10
ENDPOINT_TOLERANCE_RADIUS = 0.15
USABLE_ENDPOINT_ERROR = 0.50
INTERMEDIATE_INDEX = 6
INTERMEDIATE_CHANNELS = 40
FINAL_CHANNELS = 960
CANDIDATES = {
    "high_res_112": {"multiScale": False, "resolution": 112, "sigma": 3.0},
    "multi_scale_56": {"multiScale": True, "resolution": 56, "sigma": 1.5},
    "multi_scale_high_res_112": {"multiScale": True, "resolution": 112, "sigma": 3.0},
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
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--evaluate-existing", action="store_true")
    return parser.parse_args()


class FrozenMultiScaleBackbone(nn.Module):
    def __init__(self, features: nn.Sequential) -> None:
        super().__init__()
        self.features = features

    def forward(self, inputs: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        intermediate = None
        output = inputs
        for index, layer in enumerate(self.features):
            output = layer(output)
            if index == INTERMEDIATE_INDEX:
                intermediate = output
        if intermediate is None:
            raise RuntimeError("Intermediate feature was not captured")
        return intermediate, output


class MultiScaleCenterlineHead(nn.Module):
    """Minimal final-only or skip-fused dense head with curve-gated endpoint."""

    def __init__(self, multi_scale: bool, resolution: int) -> None:
        super().__init__()
        if resolution not in (56, 112):
            raise ValueError("Only the frozen 56 and 112 resolutions are supported")
        self.multi_scale = multi_scale
        self.resolution = resolution
        self.final_adapter = nn.Sequential(
            nn.Conv2d(FINAL_CHANNELS, 64, kernel_size=1), nn.BatchNorm2d(64), nn.ReLU(inplace=True),
        )
        self.presence = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(64, 1))
        if multi_scale:
            self.intermediate_adapter = nn.Sequential(
                nn.Conv2d(INTERMEDIATE_CHANNELS, 32, kernel_size=1),
                nn.BatchNorm2d(32), nn.ReLU(inplace=True),
            )
            self.fusion = nn.Sequential(
                nn.Conv2d(96, 64, kernel_size=3, padding=1), nn.BatchNorm2d(64), nn.ReLU(inplace=True),
            )
            stages = 1 if resolution == 56 else 2
        else:
            self.intermediate_adapter = None
            self.fusion = None
            stages = 4
        layers: list[nn.Module] = []
        channels = 64
        for _ in range(stages):
            output_channels = max(16, channels // 2)
            layers.extend((
                nn.ConvTranspose2d(channels, output_channels, kernel_size=4, stride=2, padding=1),
                nn.ReLU(inplace=True),
            ))
            channels = output_channels
        self.decoder = nn.Sequential(*layers)
        self.centerline = nn.Conv2d(channels, 1, kernel_size=1)
        self.endpoint = nn.Conv2d(channels, 1, kernel_size=1)

    def forward(
        self, intermediate: torch.Tensor, final: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        final_features = self.final_adapter(final)
        presence = self.presence(final_features).flatten()
        if self.multi_scale:
            assert self.intermediate_adapter is not None and self.fusion is not None
            upsampled = F.interpolate(final_features, size=intermediate.shape[-2:], mode="bilinear", align_corners=False)
            spatial = self.fusion(torch.cat((self.intermediate_adapter(intermediate), upsampled), dim=1))
        else:
            spatial = final_features
        decoded = self.decoder(spatial)
        centerline = self.centerline(decoded).squeeze(1)
        endpoint_raw = self.endpoint(decoded).squeeze(1)
        endpoint_gated = endpoint_raw + F.logsigmoid(centerline)
        return presence, centerline, endpoint_raw, endpoint_gated


def target_tensors(
    pilot: Any, baseline: Any, examples: list[Any], size: int, sigma: float,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    presence = torch.tensor([example.positive for example in examples], dtype=torch.float32)
    tubes = []
    endpoints = []
    for example in examples:
        if example.centerline:
            points = pilot.transform_points(baseline, example.centerline, example.geometry)
            tubes.append(pilot.soft_tube(points, size=size, sigma=sigma))
            endpoints.append(pilot.tip_gaussian(points[0], size=size, sigma=sigma))
        else:
            tubes.append(torch.zeros(size, size))
            endpoints.append(torch.zeros(size, size))
    return presence, torch.stack(tubes), torch.stack(endpoints)


def candidate_loss(
    presence_logits: torch.Tensor,
    centerline_logits: torch.Tensor,
    endpoint_gated_logits: torch.Tensor,
    presence_targets: torch.Tensor,
    centerline_targets: torch.Tensor,
    endpoint_targets: torch.Tensor,
) -> tuple[torch.Tensor, dict[str, float]]:
    presence = F.binary_cross_entropy_with_logits(presence_logits, presence_targets)
    probabilities = torch.sigmoid(centerline_logits)
    positive = presence_targets > 0.5
    positive_line = centerline_logits.sum() * 0
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
        positive_line = (dice + 0.25 * weighted_bce).mean()
    negative_line = centerline_logits.sum() * 0
    if (~positive).any():
        negative_line = F.binary_cross_entropy_with_logits(
            centerline_logits[~positive], torch.zeros_like(centerline_logits[~positive]),
        )
    centerline = positive_line + 0.5 * negative_line
    endpoint = endpoint_gated_logits.sum() * 0
    if positive.any():
        log_probabilities = F.log_softmax(endpoint_gated_logits[positive].flatten(1), dim=1)
        endpoint = -(endpoint_targets[positive].flatten(1) * log_probabilities).sum(dim=1).mean()
    total = presence + 2 * centerline + endpoint
    return total, {
        "presenceBce": float(presence.detach()),
        "centerlineLoss": float(centerline.detach()),
        "curveGatedEndpointCrossEntropy": float(endpoint.detach()),
    }


def extract_features(
    backbone: FrozenMultiScaleBackbone, examples: list[Any], batch_size: int = 16,
) -> tuple[torch.Tensor, torch.Tensor]:
    intermediate_batches = []
    final_batches = []
    with torch.inference_mode():
        for offset in range(0, len(examples), batch_size):
            inputs = torch.stack([example.tensor for example in examples[offset:offset + batch_size]])
            intermediate, final = backbone(inputs)
            intermediate_batches.append(intermediate.cpu())
            final_batches.append(final.cpu())
    return torch.cat(intermediate_batches), torch.cat(final_batches)


def train_candidate(
    baseline: Any,
    name: str,
    configuration: dict[str, Any],
    intermediate: torch.Tensor,
    final: torch.Tensor,
    presence: torch.Tensor,
    tubes: torch.Tensor,
    endpoints: torch.Tensor,
    epochs: int,
    seed: int,
    destination: Path,
) -> tuple[MultiScaleCenterlineHead, dict[str, Any]]:
    torch.manual_seed(seed)
    head = MultiScaleCenterlineHead(configuration["multiScale"], configuration["resolution"])
    optimizer = torch.optim.AdamW(head.parameters(), lr=2e-3, weight_decay=1e-4)
    generator = torch.Generator().manual_seed(seed)
    loader = DataLoader(
        TensorDataset(intermediate, final, presence, tubes, endpoints),
        batch_size=16, shuffle=True, generator=generator,
    )
    history = []
    for epoch in range(1, epochs + 1):
        head.train()
        totals = []
        components: dict[str, list[float]] = {
            "presenceBce": [], "centerlineLoss": [], "curveGatedEndpointCrossEntropy": [],
        }
        for batch_intermediate, batch_final, batch_presence, batch_tubes, batch_endpoints in loader:
            optimizer.zero_grad(set_to_none=True)
            raw_presence, raw_lines, _, gated_endpoints = head(batch_intermediate, batch_final)
            loss, values = candidate_loss(
                raw_presence, raw_lines, gated_endpoints,
                batch_presence, batch_tubes, batch_endpoints,
            )
            loss.backward()
            optimizer.step()
            totals.append(float(loss.detach()))
            for key, value in values.items():
                components[key].append(value)
        if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
            history.append({"epoch": epoch, "totalLoss": statistics.fmean(totals), **{
                key: statistics.fmean(values) for key, values in components.items()
            }})
    head.eval()
    destination.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "stateDict": copy.deepcopy(head.state_dict()), "candidate": name,
        "configuration": configuration, "epoch": epochs, "seed": seed,
    }, destination)
    return head, {
        "selection": "fixed final epoch; held-out session excluded from training and selection",
        "checkpoint": str(destination), "checkpointSha256": baseline.sha256_file(destination),
        "epochs": epochs, "history": history,
    }


def heatmap_to_source(
    baseline: Any, row: int, column: int, size: int, geometry: Any,
) -> tuple[float, float]:
    return baseline.point_from_input((column / (size - 1), row / (size - 1)), geometry)


def endpoint_record(
    pilot: Any,
    baseline: Any,
    manual: Any,
    example: Any,
    mask: np.ndarray,
    gated_logits: torch.Tensor,
) -> dict[str, Any]:
    size = gated_logits.shape[-1]
    flat = int(torch.argmax(gated_logits))
    row, column = divmod(flat, size)
    predicted = heatmap_to_source(baseline, row, column, size, example.geometry)
    target = example.annotation["objects"][0]["spoutTip"]
    radius = manual.effective_radius(example.annotation["dripper"])
    error = math.hypot(predicted[0] - target["x"], predicted[1] - target["y"])
    mask_points = np.column_stack(np.nonzero(mask))
    radius_grid = radius * example.geometry.scale / 224 * (size - 1)
    endpoint_grid = np.array((row, column), dtype=float)
    curve_distance = float(np.linalg.norm(mask_points - endpoint_grid, axis=1).min()) if len(mask_points) else float("inf")
    gt_points = pilot.transform_points(baseline, example.centerline, example.geometry)
    gt_tip_grid = np.array((gt_points[0][1], gt_points[0][0])) * (size - 1)
    gt_other_grid = np.array((gt_points[-1][1], gt_points[-1][0])) * (size - 1)
    correct_side = np.linalg.norm(endpoint_grid - gt_tip_grid) < np.linalg.norm(endpoint_grid - gt_other_grid)
    predicted_extremities = pilot.line_endpoint_candidates(mask)
    extremity_distance = min(
        (float(np.linalg.norm(endpoint_grid - np.array(point))) for point in predicted_extremities),
        default=float("inf"),
    )
    return {
        "point": {"x": predicted[0], "y": predicted[1]}, "errorPx": error,
        "normalizedError": error / radius, "usable": error / radius <= USABLE_ENDPOINT_ERROR,
        "endpointToCenterlineNormalized": curve_distance / radius_grid,
        "endpointToPredictedExtremityNormalized": extremity_distance / radius_grid,
        "nearPredictedExtremity": extremity_distance / radius_grid <= ENDPOINT_TOLERANCE_RADIUS,
        "correctEndpointSide": bool(correct_side),
    }


def distribution(baseline: Any, values: Iterable[float | None]) -> dict[str, Any]:
    return baseline.distribution(value for value in values if value is not None and math.isfinite(value))


def evaluate_candidate(
    pilot: Any,
    baseline: Any,
    manual: Any,
    examples: list[Any],
    presence_logits: torch.Tensor,
    centerline_logits: torch.Tensor,
    endpoint_gated_logits: torch.Tensor,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    presence_probabilities = torch.sigmoid(presence_logits).cpu().numpy()
    line_probabilities = torch.sigmoid(centerline_logits).cpu().numpy()
    records = []
    for index, (example, presence_probability, line_probability) in enumerate(zip(
        examples, presence_probabilities, line_probabilities, strict=True,
    )):
        mask, coherence, components = pilot.largest_component(line_probability >= LINE_THRESHOLD)
        accepted = bool(presence_probability >= PRESENCE_THRESHOLD and mask.any())
        record: dict[str, Any] = {
            "frameId": example.frame["frameId"], "session": example.frame["sessionId"],
            "timestampMs": example.frame["timestampMs"], "positive": example.positive,
            "presenceProbability": float(presence_probability), "presenceAccepted": accepted,
            "linePeak": float(line_probability.max()), "componentCount": components,
            "largestComponentFraction": coherence,
        }
        if example.positive:
            size = line_probability.shape[-1]
            transformed = pilot.transform_points(baseline, example.centerline, example.geometry)
            gt_distance = pilot.distance_to_polyline(transformed, size=size).numpy()
            radius = manual.effective_radius(example.annotation["dripper"])
            radius_grid = radius * example.geometry.scale / 224 * (size - 1)
            record["centerline"] = pilot.line_geometry_metrics(mask, gt_distance, radius_grid)
            record["endpoint"] = endpoint_record(
                pilot, baseline, manual, example, mask, endpoint_gated_logits[index],
            )
        records.append(record)
    positives = [record for record in records if record["positive"]]
    negatives = [record for record in records if not record["positive"]]
    accepted_positives = [record for record in positives if record["presenceAccepted"]]
    false_present = sum(record["presenceAccepted"] for record in negatives)
    return {
        "counts": {"total": len(records), "positive": len(positives), "negative": len(negatives)},
        "presence": {
            "positiveRecall": len(accepted_positives) / len(positives),
            "negativeSpecificity": 1 - false_present / len(negatives),
            "falsePresent": false_present, "falseAbsent": len(positives) - len(accepted_positives),
        },
        "centerline": {
            "symmetricDistanceNormalized": distribution(baseline, (record["centerline"]["symmetricDistanceNormalized"] for record in positives)),
            "gtCoverageWithinTolerance": distribution(baseline, (record["centerline"]["gtCoverageWithinTolerance"] for record in positives)),
            "predictedPrecisionWithinTolerance": distribution(baseline, (record["centerline"]["predictedPrecisionWithinTolerance"] for record in positives)),
            "largestComponentFraction": distribution(baseline, (record["largestComponentFraction"] for record in positives)),
        },
        "endpoint": {
            "normalizedError": distribution(baseline, (record["endpoint"]["normalizedError"] for record in positives)),
            "usableLocateRate": sum(record["presenceAccepted"] and record["endpoint"]["usable"] for record in positives) / len(positives),
            "endpointToCenterlineNormalized": distribution(baseline, (record["endpoint"]["endpointToCenterlineNormalized"] for record in positives)),
            "nearPredictedExtremityRate": sum(record["endpoint"]["nearPredictedExtremity"] for record in positives) / len(positives),
            "correctEndpointSideRate": sum(record["endpoint"]["correctEndpointSide"] for record in positives) / len(positives),
        },
    }, records


def group_metrics(records: list[dict[str, Any]], frame_ids: set[str]) -> dict[str, Any]:
    group = [record for record in records if record["positive"] and record["frameId"] in frame_ids]
    if not group:
        return {"count": 0}
    def endpoint_for(record: dict[str, Any]) -> dict[str, Any]:
        return record.get("endpoint", record.get("tip", {}))

    return {
        "count": len(group),
        "presenceRecall": sum(record["presenceAccepted"] for record in group) / len(group),
        "gtCoverageMean": statistics.fmean(record["centerline"]["gtCoverageWithinTolerance"] for record in group),
        "predictionPrecisionMean": statistics.fmean(record["centerline"]["predictedPrecisionWithinTolerance"] for record in group),
        "endpointUsableLocateRate": sum(
            record["presenceAccepted"] and bool(endpoint_for(record).get("usable")) for record in group
        ) / len(group),
    }


def stratified_metrics(
    records: list[dict[str, Any]], merged_records: dict[str, dict[str, Any]], manifest_records: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    lengths = sorted(record["qa"]["lengthNormalized"] for record in merged_records.values())
    first = lengths[len(lengths) // 3]
    second = lengths[2 * len(lengths) // 3]
    groups: dict[str, set[str]] = {
        "length_short": {frame_id for frame_id, record in merged_records.items() if record["qa"]["lengthNormalized"] <= first},
        "length_medium": {frame_id for frame_id, record in merged_records.items() if first < record["qa"]["lengthNormalized"] <= second},
        "length_long": {frame_id for frame_id, record in merged_records.items() if record["qa"]["lengthNormalized"] > second},
    }
    tags = {frame_id: set(record["domainTags"]) for frame_id, record in manifest_records.items()}
    for tag in ("dark_spout", "reflective_spout", "white_spout", "low_contrast", "water_overlap", "short_visible_segment", "edge_truncation"):
        groups[tag] = {frame_id for frame_id, values in tags.items() if tag in values}
    groups["top_edge_truncated"] = {
        frame_id for frame_id, values in tags.items() if "edge_truncation" in values and "top_entry" in values
    }
    groups["side_edge_truncated"] = {
        frame_id for frame_id, values in tags.items() if "edge_truncation" in values and "top_entry" not in values
    }
    groups["non_truncated"] = {frame_id for frame_id, values in tags.items() if "edge_truncation" not in values}
    return {
        "lengthThresholdsEffectiveRadius": {"shortMax": first, "mediumMax": second},
        "groups": {name: group_metrics(records, frame_ids) for name, frame_ids in groups.items()},
    }


def benchmark_head(head: MultiScaleCenterlineHead, repeats: int = 20) -> dict[str, Any]:
    intermediate = torch.zeros(1, INTERMEDIATE_CHANNELS, 28, 28)
    final = torch.zeros(1, FINAL_CHANNELS, 7, 7)
    with torch.inference_mode():
        for _ in range(3):
            head(intermediate, final)
        started = time.perf_counter()
        for _ in range(repeats):
            head(intermediate, final)
    milliseconds = (time.perf_counter() - started) * 1000 / repeats
    output_bytes = 3 * head.resolution * head.resolution * 4
    feature_bytes = (INTERMEDIATE_CHANNELS * 28 * 28 + FINAL_CHANNELS * 7 * 7) * 4
    return {
        "headMeanMilliseconds": milliseconds,
        "headEstimatedFps": 1000 / milliseconds,
        "threeOutputMapsBytesPerSample": output_bytes,
        "retainedFeatureBytesPerSample": feature_bytes if head.multi_scale else FINAL_CHANNELS * 7 * 7 * 4,
    }


def count_parameters(module: nn.Module) -> int:
    return sum(parameter.numel() for parameter in module.parameters())


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    baseline = load_module(repo_root / "scripts/vision/task9c2-baseline.py", "task9c2_baseline_9510")
    pilot = load_module(repo_root / "scripts/vision/task9c5-9-centerline-pilot.py", "task9c5_9_pilot_9510")
    data_module = load_module(repo_root / "scripts/vision/task9c5-3-targeted-retraining.py", "task9c5_3_data_9510")
    manual = load_module(repo_root / "scripts/vision/task9c5-5-manual-roi-localization.py", "task9c5_5_manual_9510")
    baseline.set_determinism()
    torch.hub.set_dir(str(work_root / "cache/torch/hub"))

    merged_path = work_root / "datasets/task-9c5-9/annotations/centerline-pilot-v0.training-ready.json"
    merged = json.loads(merged_path.read_text(encoding="utf-8"))
    if merged.get("status") != "training_ready" or len(merged.get("annotations", [])) != 62:
        raise RuntimeError("Frozen Task 9C-5.9 annotation set is not training-ready 62/62")
    merged_records = {record["frameId"]: record for record in merged["annotations"]}
    centerlines = {frame_id: record["gooseneckSpoutCenterline"]["points"] for frame_id, record in merged_records.items()}
    frames, annotations = data_module.load_records(repo_root, work_root)
    frames_by_id = {frame["frameId"]: frame for frame in frames}
    selected = [frames_by_id[frame_id] for frame_id in centerlines]
    negatives = [frame for frame in frames if not annotations[frame["frameId"]]["objects"] and annotations[frame["frameId"]].get("dripper")]
    eligible = selected + negatives
    if any(frame["sessionId"] in FORBIDDEN for frame in eligible) or set(frame["sessionId"] for frame in eligible) != set(SESSIONS):
        raise RuntimeError("Forbidden or missing session in Task 9C-5.10")
    examples = pilot.build_examples(baseline, manual, data_module, repo_root, work_root, eligible, annotations, centerlines)

    model = mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.IMAGENET1K_V2)
    backbone = FrozenMultiScaleBackbone(model.features.eval())
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)
    intermediate, final = extract_features(backbone, examples)

    run_dir = work_root / "runs/task-9c5-10"
    eval_dir = work_root / "eval/task-9c5-10"
    checkpoint_dir = work_root / "checkpoints/task-9c5-10"
    for directory in (run_dir, eval_dir, checkpoint_dir):
        directory.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((work_root / "datasets/task-9c5-9/manifest.json").read_text(encoding="utf-8"))
    manifest_records = {record["frameId"]: record for record in manifest["frames"]}
    folds: dict[str, dict[str, Any]] = {name: {} for name in CANDIDATES}
    predictions: dict[str, list[dict[str, Any]]] = {name: [] for name in CANDIDATES}
    candidate_metadata = {}
    started = time.time()
    for candidate_index, (name, configuration) in enumerate(CANDIDATES.items()):
        presence, tubes, endpoints = target_tensors(
            pilot, baseline, examples, configuration["resolution"], configuration["sigma"],
        )
        for fold_index, heldout in enumerate(SESSIONS):
            train_indexes = [index for index, example in enumerate(examples) if example.frame["sessionId"] != heldout]
            test_indexes = [index for index, example in enumerate(examples) if example.frame["sessionId"] == heldout and example.augmentation == "identity"]
            seed = SEED + candidate_index * 1000 + fold_index * 100
            checkpoint_path = checkpoint_dir / name / "loso" / heldout / "head.pt"
            if args.evaluate_existing:
                if not checkpoint_path.exists():
                    raise RuntimeError(f"Missing existing checkpoint: {checkpoint_path}")
                payload = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
                head = MultiScaleCenterlineHead(configuration["multiScale"], configuration["resolution"])
                head.load_state_dict(payload["stateDict"])
                head.eval()
                training = {
                    "selection": "fixed final epoch; restored for evaluation after reporting-only schema fix",
                    "checkpoint": str(checkpoint_path),
                    "checkpointSha256": baseline.sha256_file(checkpoint_path),
                    "epochs": payload["epoch"], "seed": payload["seed"],
                }
            else:
                head, training = train_candidate(
                    baseline, name, configuration,
                    intermediate[train_indexes], final[train_indexes], presence[train_indexes], tubes[train_indexes], endpoints[train_indexes],
                    args.epochs, seed, checkpoint_path,
                )
            with torch.inference_mode():
                raw_presence, raw_lines, _, gated_endpoints = head(intermediate[test_indexes], final[test_indexes])
            metrics, records = evaluate_candidate(
                pilot, baseline, manual, [examples[index] for index in test_indexes], raw_presence, raw_lines, gated_endpoints,
            )
            metrics["training"] = training
            folds[name][heldout] = metrics
            predictions[name].extend(records)
            print(f"completed {name} {heldout}", flush=True)
        probe = MultiScaleCenterlineHead(configuration["multiScale"], configuration["resolution"]).eval()
        candidate_metadata[name] = {
            **configuration, "headParameters": count_parameters(probe), "runtimeAndMemory": benchmark_head(probe),
            "stratified": stratified_metrics(predictions[name], merged_records, manifest_records),
        }

    baseline_results = json.loads((work_root / "runs/task-9c5-9/results.json").read_text(encoding="utf-8"))
    baseline_predictions = json.loads((work_root / "eval/task-9c5-9/predictions.json").read_text(encoding="utf-8"))["centerline_only"]
    result = {
        "status": "complete",
        "dataset": {"positive": len(selected), "negative": len(negatives)},
        "protocol": {
            "method": "seven-fold leave-one-session-out", "epochs": args.epochs,
            "backbone": "frozen torchvision MobileNetV3-large ImageNet-1K V2",
            "features": {
                "intermediate": {"blockIndex": INTERMEDIATE_INDEX, "shape": [INTERMEDIATE_CHANNELS, 28, 28]},
                "final": {"shape": [FINAL_CHANNELS, 7, 7]},
            },
            "endpoint": "endpoint logits gated by log(sigmoid(predicted centerline)); positive-only spatial CE",
            "session014Accessed": False, "externalBenchmarkAccessed": False,
        },
        "baselineA": {
            "source": str(work_root / "runs/task-9c5-9/results.json"),
            "configuration": baseline_results["protocol"]["target"],
            "folds": baseline_results["folds"]["centerline_only"],
            "stratified": stratified_metrics(baseline_predictions, merged_records, manifest_records),
        },
        "candidates": candidate_metadata,
        "folds": folds,
        "elapsedSeconds": time.time() - started,
        "onnx": {"exported": False, "reason": "Task explicitly forbids ONNX export"},
    }
    (run_dir / "results.json").write_text(json.dumps(result, indent=2, default=float), encoding="utf-8")
    (eval_dir / "predictions.json").write_text(json.dumps(predictions, indent=2, default=float), encoding="utf-8")
    print(json.dumps({"results": str(run_dir / "results.json"), "predictions": str(eval_dir / "predictions.json")}, indent=2))


if __name__ == "__main__":
    main()
