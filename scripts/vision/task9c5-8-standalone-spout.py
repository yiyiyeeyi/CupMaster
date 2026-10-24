#!/usr/bin/env python3
"""Task 9C-5.8 standalone gooseneck-spout presence and bbox audit."""

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

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw
from torch import nn
from torch.nn import functional as F
from torch.utils.data import DataLoader, TensorDataset
from torchvision.models import (
    MobileNet_V3_Large_Weights,
    MobileNet_V3_Small_Weights,
    mobilenet_v3_large,
    mobilenet_v3_small,
)


SEED = 20260929
SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13))
CONFIDENCE_THRESHOLD = 0.50
PRIMARY_PRESET = "balanced"
BACKBONES = {
    "mobilenet_v3_small": {
        "constructor": mobilenet_v3_small,
        "weights": MobileNet_V3_Small_Weights.IMAGENET1K_V1,
        "channels": 576,
    },
    "mobilenet_v3_large": {
        "constructor": mobilenet_v3_large,
        "weights": MobileNet_V3_Large_Weights.IMAGENET1K_V2,
        "channels": 960,
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
    return parser.parse_args()


def valid_bbox(bbox: dict[str, float], minimum_side: float = 2.0) -> bool:
    values = (bbox["xMin"], bbox["yMin"], bbox["xMax"], bbox["yMax"])
    return all(math.isfinite(value) for value in values) \
        and bbox["xMax"] - bbox["xMin"] >= minimum_side \
        and bbox["yMax"] - bbox["yMin"] >= minimum_side


def intersect_bbox(bbox: dict[str, float], bounds: dict[str, float]) -> dict[str, float]:
    return {
        "xMin": max(bbox["xMin"], bounds["xMin"]),
        "yMin": max(bbox["yMin"], bounds["yMin"]),
        "xMax": min(bbox["xMax"], bounds["xMax"]),
        "yMax": min(bbox["yMax"], bounds["yMax"]),
    }


def bbox_examples(
    baseline: Any,
    manual: Any,
    data_module: Any,
    repo_root: Path,
    work_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    augmentations: Iterable[str],
) -> list[Any]:
    examples = []
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        search = manual.search_region(annotation, frame, PRIMARY_PRESET)
        image = data_module.open_development_image(repo_root, work_root, frame)
        for augmentation in augmentations:
            tensor, geometry = baseline.prepare_image(image, augmentation, manual.crop_tuple(search))
            positive = bool(annotation["objects"])
            if positive:
                bbox = intersect_bbox(annotation["objects"][0]["bbox"], search)
                if not valid_bbox(bbox):
                    raise RuntimeError(f"Positive bbox excluded by search crop: {frame['frameId']}")
                bbox_target = baseline.bbox_to_input(bbox, geometry)
            else:
                bbox_target = (0.0, 0.0, 0.0, 0.0)
            examples.append(baseline.Example(
                frame=frame, annotation=annotation, tensor=tensor, geometry=geometry,
                presence=float(positive), point_target=(0.0, 0.0), bbox_target=bbox_target,
            ))
    return examples


def detector_loss(raw: torch.Tensor, presence: torch.Tensor, bbox_targets: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    presence_loss = F.binary_cross_entropy_with_logits(raw[:, 0], presence)
    positive = presence > 0.5
    bbox_loss = F.smooth_l1_loss(torch.sigmoid(raw[positive, 1:5]), bbox_targets[positive]) \
        if positive.any() else raw.sum() * 0
    return presence_loss + 5.0 * bbox_loss, presence_loss, bbox_loss


def train_head(
    baseline: Any,
    features: torch.Tensor,
    examples: list[Any],
    channels: int,
    epochs: int,
    seed: int,
    destination: Path,
) -> tuple[nn.Module, dict[str, Any]]:
    presence = torch.tensor([example.presence for example in examples], dtype=torch.float32)
    bboxes = torch.tensor([example.bbox_target for example in examples], dtype=torch.float32)
    torch.manual_seed(seed)
    head = baseline.SpatialHead(channels, 4)
    optimizer = torch.optim.AdamW(head.parameters(), lr=3e-3, weight_decay=1e-4)
    generator = torch.Generator().manual_seed(seed)
    loader = DataLoader(TensorDataset(features, presence, bboxes), batch_size=16, shuffle=True, generator=generator)
    history = []
    for epoch in range(1, epochs + 1):
        head.train()
        totals: list[float] = []
        presences: list[float] = []
        bbox_values: list[float] = []
        for batch_features, batch_presence, batch_bboxes in loader:
            optimizer.zero_grad(set_to_none=True)
            loss, presence_loss, bbox_loss = detector_loss(head(batch_features), batch_presence, batch_bboxes)
            loss.backward()
            optimizer.step()
            totals.append(float(loss.detach()))
            presences.append(float(presence_loss.detach()))
            bbox_values.append(float(bbox_loss.detach()))
        if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
            history.append({
                "epoch": epoch,
                "totalLoss": statistics.fmean(totals),
                "presenceBce": statistics.fmean(presences),
                "positiveOnlyBBoxSmoothL1": statistics.fmean(bbox_values),
            })
    head.eval()
    destination.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"stateDict": copy.deepcopy(head.state_dict()), "epoch": epochs, "seed": seed}, destination)
    return head, {
        "selection": "fixed final epoch; held-out session excluded from training and selection",
        "epochs": epochs, "history": history, "checkpoint": str(destination),
        "checkpointSha256": baseline.sha256_file(destination),
    }


def decode_predictions(baseline: Any, head: nn.Module, features: torch.Tensor, examples: list[Any]) -> list[dict[str, Any]]:
    with torch.inference_mode():
        raw = head(features)
        confidence = torch.sigmoid(raw[:, 0]).cpu().numpy()
        bbox_values = torch.sigmoid(raw[:, 1:5]).cpu().numpy()
    records = []
    for example, score, values in zip(examples, confidence, bbox_values, strict=True):
        bbox = baseline.bbox_from_input(values, example.geometry, (example.frame["width"], example.frame["height"]))
        records.append({
            "frameId": example.frame["frameId"], "session": example.frame["sessionId"],
            "timestampMs": example.frame["timestampMs"], "confidence": float(score),
            "accepted": bool(score >= CONFIDENCE_THRESHOLD and valid_bbox(bbox)), "bbox": bbox,
        })
    return records


def evaluate(
    baseline: Any,
    manual: Any,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    predictions: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    prediction_map = {record["frameId"]: record for record in predictions}
    records = []
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        prediction = prediction_map[frame["frameId"]]
        positive = bool(annotation["objects"])
        iou = None
        gt_bbox = None
        if positive:
            search = manual.search_region(annotation, frame, PRIMARY_PRESET)
            gt_bbox = intersect_bbox(annotation["objects"][0]["bbox"], search)
            if prediction["accepted"]:
                iou = baseline.bbox_iou(prediction["bbox"], gt_bbox)
        records.append({**prediction, "positive": positive, "gtBbox": gt_bbox, "bboxIoU": iou})
    positives = [record for record in records if record["positive"]]
    negatives = [record for record in records if not record["positive"]]
    accepted_positives = [record for record in positives if record["accepted"]]
    ious = [record["bboxIoU"] for record in accepted_positives]
    false_present = sum(record["accepted"] for record in negatives)
    return {
        "counts": {"total": len(records), "positive": len(positives), "negative": len(negatives)},
        "positiveDetectionRecall": len(accepted_positives) / len(positives),
        "negativeSpecificity": 1 - false_present / len(negatives),
        "negativeFalsePositiveRate": false_present / len(negatives),
        "falsePresent": false_present,
        "falseAbsent": len(positives) - len(accepted_positives),
        "bboxIoUAccepted": baseline.distribution(ious),
        "recallIoU30": sum((record["bboxIoU"] or 0) >= 0.30 for record in positives) / len(positives),
        "recallIoU50": sum((record["bboxIoU"] or 0) >= 0.50 for record in positives) / len(positives),
        "positiveConfidence": baseline.distribution(record["confidence"] for record in positives),
        "negativeConfidence": baseline.distribution(record["confidence"] for record in negatives),
    }, records


def grabcut_background_fraction(image: Image.Image, bbox: dict[str, float]) -> float | None:
    array = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)
    scale = min(1.0, 480.0 / max(array.shape[:2]))
    if scale < 1.0:
        array = cv2.resize(array, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    height, width = array.shape[:2]
    x0 = max(1, min(width - 3, int(math.floor(bbox["xMin"] * scale))))
    y0 = max(1, min(height - 3, int(math.floor(bbox["yMin"] * scale))))
    x1 = max(x0 + 2, min(width - 1, int(math.ceil(bbox["xMax"] * scale))))
    y1 = max(y0 + 2, min(height - 1, int(math.ceil(bbox["yMax"] * scale))))
    if x1 - x0 < 3 or y1 - y0 < 3:
        return None
    mask = np.zeros((height, width), np.uint8)
    background = np.zeros((1, 65), np.float64)
    foreground = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(array, mask, (x0, y0, x1 - x0, y1 - y0), background, foreground, 2, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return None
    region = mask[y0:y1, x0:x1]
    foreground_fraction = float(np.isin(region, (cv2.GC_FGD, cv2.GC_PR_FGD)).mean())
    return 1.0 - foreground_fraction


def gt_geometry(
    baseline: Any,
    manual: Any,
    data_module: Any,
    repo_root: Path,
    work_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    records = []
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        if not annotation["objects"]:
            continue
        search = manual.search_region(annotation, frame, PRIMARY_PRESET)
        bbox = intersect_bbox(annotation["objects"][0]["bbox"], search)
        width = bbox["xMax"] - bbox["xMin"]
        height = bbox["yMax"] - bbox["yMin"]
        search_area = (search["xMax"] - search["xMin"]) * (search["yMax"] - search["yMin"])
        tolerance = 2.0
        search_touch = (
            bbox["xMin"] <= search["xMin"] + tolerance or bbox["yMin"] <= search["yMin"] + tolerance
            or bbox["xMax"] >= search["xMax"] - tolerance or bbox["yMax"] >= search["yMax"] - tolerance
        )
        image_touch = (
            bbox["xMin"] <= tolerance or bbox["yMin"] <= tolerance
            or bbox["xMax"] >= frame["width"] - tolerance or bbox["yMax"] >= frame["height"] - tolerance
        )
        image = data_module.open_development_image(repo_root, work_root, frame)
        records.append({
            "frameId": frame["frameId"], "session": frame["sessionId"],
            "aspectWidthOverHeight": width / height,
            "elongation": max(width, height) / min(width, height),
            "bboxAreaOverSearchArea": width * height / search_area,
            "visibleLengthProxyOverDripperRadius": math.hypot(width, height) / manual.effective_radius(annotation["dripper"]),
            "touchesSearchBoundary": search_touch, "touchesImageBoundary": image_touch,
            "partialVisibleProxy": image_touch,
            "grabCutEstimatedBackgroundFraction": grabcut_background_fraction(image, bbox),
        })
    by_session = {}
    for session in SESSIONS:
        group = [record for record in records if record["session"] == session]
        background = [record["grabCutEstimatedBackgroundFraction"] for record in group if record["grabCutEstimatedBackgroundFraction"] is not None]
        by_session[session] = {
            "positiveCount": len(group),
            "aspectWidthOverHeight": baseline.distribution(record["aspectWidthOverHeight"] for record in group),
            "elongation": baseline.distribution(record["elongation"] for record in group),
            "bboxAreaOverSearchArea": baseline.distribution(record["bboxAreaOverSearchArea"] for record in group),
            "visibleLengthProxyOverDripperRadius": baseline.distribution(record["visibleLengthProxyOverDripperRadius"] for record in group),
            "searchBoundaryTouchRate": sum(record["touchesSearchBoundary"] for record in group) / len(group),
            "imageBoundaryPartialVisibleProxyRate": sum(record["partialVisibleProxy"] for record in group) / len(group),
            "grabCutEstimatedBackgroundFraction": baseline.distribution(background),
        }
    return by_session, records


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


def count_parameters(module: nn.Module) -> int:
    return sum(parameter.numel() for parameter in module.parameters())


def render_failure_sheet(
    data_module: Any,
    repo_root: Path,
    work_root: Path,
    records: list[dict[str, Any]],
    frames_by_id: dict[str, dict[str, Any]],
    destination: Path,
) -> None:
    failures = [record for record in records if record["positive"] and (not record["accepted"] or (record["bboxIoU"] or 0) < 0.30)]
    if not failures:
        return
    tile_width, tile_height = 280, 520
    columns = 4
    rows = math.ceil(len(failures) / columns)
    sheet = Image.new("RGB", (columns * tile_width, rows * tile_height), "white")
    for index, record in enumerate(failures):
        frame = frames_by_id[record["frameId"]]
        image = data_module.open_development_image(repo_root, work_root, frame).copy()
        draw = ImageDraw.Draw(image)
        gt = record["gtBbox"]
        pred = record["bbox"]
        draw.rectangle((gt["xMin"], gt["yMin"], gt["xMax"], gt["yMax"]), outline="lime", width=7)
        draw.rectangle((pred["xMin"], pred["yMin"], pred["xMax"], pred["yMax"]), outline="red", width=7)
        image.thumbnail((tile_width, tile_height - 70), Image.Resampling.LANCZOS)
        x = (index % columns) * tile_width
        y = (index // columns) * tile_height
        sheet.paste(image, (x + (tile_width - image.width) // 2, y))
        tile_draw = ImageDraw.Draw(sheet)
        tile_draw.text((x + 5, y + tile_height - 65), record["frameId"], fill="black")
        tile_draw.text((x + 5, y + tile_height - 45), f"p={record['confidence']:.3f} IoU={record['bboxIoU'] or 0:.3f}", fill="black")
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, quality=90)


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    baseline = load_module(repo_root / "scripts/vision/task9c2-baseline.py", "task9c2_baseline_958")
    data_module = load_module(repo_root / "scripts/vision/task9c5-3-targeted-retraining.py", "task9c5_3_data_958")
    manual = load_module(repo_root / "scripts/vision/task9c5-5-manual-roi-localization.py", "task9c5_5_manual_958")
    baseline.set_determinism()
    torch.hub.set_dir(str(work_root / "cache/torch/hub"))
    frames, annotations = data_module.load_records(repo_root, work_root)
    eligible = [frame for frame in frames if annotations[frame["frameId"]].get("dripper")]
    if any(frame["sessionId"] not in SESSIONS for frame in eligible):
        raise RuntimeError("Forbidden session entered standalone-spout experiment")

    run_dir = work_root / "runs/task-9c5-8"
    eval_dir = work_root / "eval/task-9c5-8"
    checkpoint_dir = work_root / "checkpoints/task-9c5-8"
    for directory in (run_dir, eval_dir, checkpoint_dir):
        directory.mkdir(parents=True, exist_ok=True)
    geometry_by_session, geometry_records = gt_geometry(
        baseline, manual, data_module, repo_root, work_root, eligible, annotations,
    )
    frames_by_id = {frame["frameId"]: frame for frame in eligible}
    all_results: dict[str, Any] = {}
    all_predictions: dict[str, Any] = {}
    started = time.time()
    for backbone_index, (backbone_name, configuration) in enumerate(BACKBONES.items()):
        model = configuration["constructor"](weights=configuration["weights"])
        backbone = model.features.eval()
        for parameter in backbone.parameters():
            parameter.requires_grad_(False)
        folds = {}
        prediction_records = []
        for fold_index, heldout in enumerate(SESSIONS):
            train_frames = [frame for frame in eligible if frame["sessionId"] != heldout]
            test_frames = [frame for frame in eligible if frame["sessionId"] == heldout]
            train_examples = bbox_examples(
                baseline, manual, data_module, repo_root, work_root, train_frames, annotations, baseline.AUGMENTATIONS,
            )
            test_examples = bbox_examples(
                baseline, manual, data_module, repo_root, work_root, test_frames, annotations, ("identity",),
            )
            train_features = baseline.extract_features(backbone, train_examples)
            test_features = baseline.extract_features(backbone, test_examples)
            seed = SEED + backbone_index * 1000 + fold_index * 100
            head, training = train_head(
                baseline, train_features, train_examples, configuration["channels"], args.epochs, seed,
                checkpoint_dir / backbone_name / "loso" / heldout / "spout-bbox.head.pt",
            )
            predictions = decode_predictions(baseline, head, test_features, test_examples)
            metrics, records = evaluate(baseline, manual, test_frames, annotations, predictions)
            metrics["training"] = training
            folds[heldout] = metrics
            prediction_records.extend(records)
            print(f"completed {backbone_name} {heldout}", flush=True)
        probe = baseline.SpatialHead(configuration["channels"], 4).eval()
        all_results[backbone_name] = {
            "backboneFeatureParameters": count_parameters(backbone),
            "headParameters": count_parameters(probe),
            "featureShape": [configuration["channels"], 7, 7],
            "cpuEstimate": benchmark_cpu(backbone, probe),
            "folds": folds,
        }
        all_predictions[backbone_name] = prediction_records
        for session in ("session-004", "session-011", "session-012", "session-013"):
            render_failure_sheet(
                data_module, repo_root, work_root,
                [record for record in prediction_records if record["session"] == session], frames_by_id,
                eval_dir / backbone_name / f"{session}-failed-positive-contact-sheet.jpg",
            )

    result = {
        "status": "complete",
        "protocol": {
            "sessions": SESSIONS, "method": "seven-fold leave-one-session-out",
            "manualSearchPreset": PRIMARY_PRESET, "confidenceThreshold": CONFIDENCE_THRESHOLD,
            "output": "gooseneck_spout presence plus axis-aligned bbox only; no tip output",
            "session014Accessed": False, "externalBenchmarkAccessed": False,
        },
        "dataset": {
            "eligibleFrames": len(eligible),
            "positive": sum(bool(annotations[frame["frameId"]]["objects"]) for frame in eligible),
            "negative": sum(not annotations[frame["frameId"]]["objects"] for frame in eligible),
        },
        "groundTruthGeometry": {
            "bySession": geometry_by_session,
            "backgroundEstimateCaveat": "GrabCut foreground occupancy initialized from each GT bbox; this is an image-derived proxy, not mask ground truth.",
        },
        "backbones": all_results,
        "elapsedSeconds": time.time() - started,
        "onnx": {"exported": False, "reason": "Task explicitly forbids ONNX export"},
    }
    (run_dir / "results.json").write_text(json.dumps(result, indent=2, default=float), encoding="utf-8")
    (eval_dir / "predictions.json").write_text(json.dumps(all_predictions, indent=2, default=float), encoding="utf-8")
    (eval_dir / "gt-geometry.json").write_text(json.dumps(geometry_records, indent=2, default=float), encoding="utf-8")
    print(json.dumps({"results": str(run_dir / "results.json"), "eval": str(eval_dir)}, indent=2))


if __name__ == "__main__":
    main()
