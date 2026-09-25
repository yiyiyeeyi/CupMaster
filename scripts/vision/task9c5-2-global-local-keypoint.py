#!/usr/bin/env python3
"""Task 9C-5.2 leave-one-session-out global-to-local keypoint experiment."""

from __future__ import annotations

import argparse
import copy
import csv
import importlib.util
import json
import math
import random
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont
from torch import nn
from torch.nn import functional as F
from torch.utils.data import DataLoader, TensorDataset
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small


SEED = 20260925
SESSIONS = ("session-001", "session-002", "session-003", "session-004")
ROI_SIZE_FRACTIONS = (0.35, 0.50, 0.65)
CONFIDENCE_THRESHOLD = 0.50
TRANSLATION_JITTER = 0.30
SCALE_JITTER = (0.85, 1.15)
FEATURE_NAMES = (
    "dripperRadiusImageWidth", "tipXNorm", "boundaryTouchTop", "highlightFraction",
    "meanSaturation", "localContrast", "bboxAreaFraction",
)


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


def load_records(repo_root: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    manifest_path = repo_root / "data/vision/frames/feasibility-v1/manifests/cupmaster-spout-first-party-v1.training-ready.json"
    annotation_path = repo_root / "data/vision/annotations/feasibility-v1/first-party-v1.training-ready.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    normalized = json.loads(annotation_path.read_text(encoding="utf-8"))
    annotations = {
        item["frameId"]: item
        for annotation_pass in normalized["passes"]
        for item in annotation_pass["annotations"]
    }
    frames = [frame for frame in manifest["frames"] if frame["sessionId"] in SESSIONS]
    if len(frames) != 88 or {frame["sessionId"] for frame in frames} != set(SESSIONS):
        raise RuntimeError("Expected exactly the 88 first-party frames from sessions 001-004")
    if any(frame["frameId"] not in annotations for frame in frames):
        raise RuntimeError("Frame/annotation mismatch")
    return frames, annotations


def open_image(repo_root: Path, frame: dict[str, Any]) -> Image.Image:
    if frame["sessionId"] not in SESSIONS:
        raise RuntimeError(f"Refusing non-development media: {frame['sessionId']}")
    path = (repo_root / "data/vision" / frame["path"]).resolve()
    vision_root = (repo_root / "data/vision").resolve()
    if not path.is_relative_to(vision_root):
        raise RuntimeError(f"Frame escaped data/vision: {path}")
    return Image.open(path).convert("RGB")


def square_roi(center: tuple[float, float], width: int, height: int, size_fraction: float) -> dict[str, float]:
    side = float(width) * size_fraction
    half = side / 2
    return {
        "xMin": max(0.0, center[0] - half),
        "yMin": max(0.0, center[1] - half),
        "xMax": min(float(width), center[0] + half),
        "yMax": min(float(height), center[1] + half),
    }


def roi_tuple(roi: dict[str, float]) -> tuple[float, float, float, float]:
    return roi["xMin"], roi["yMin"], roi["xMax"], roi["yMax"]


def point_in_roi(point: dict[str, float], roi: dict[str, float]) -> bool:
    return roi["xMin"] <= point["x"] <= roi["xMax"] and roi["yMin"] <= point["y"] <= roi["yMax"]


def roi_safety(point: dict[str, float], roi: dict[str, float]) -> tuple[bool, float]:
    if not point_in_roi(point, roi):
        nearest_x = min(max(point["x"], roi["xMin"]), roi["xMax"])
        nearest_y = min(max(point["y"], roi["yMin"]), roi["yMax"])
        return False, -math.hypot(point["x"] - nearest_x, point["y"] - nearest_y)
    return True, min(
        point["x"] - roi["xMin"], roi["xMax"] - point["x"],
        point["y"] - roi["yMin"], roi["yMax"] - point["y"],
    )


def make_example(
    baseline: Any,
    frame: dict[str, Any],
    annotation: dict[str, Any],
    tensor: torch.Tensor,
    geometry: Any,
) -> Any:
    positive = bool(annotation["objects"])
    target = annotation["objects"][0]["spoutTip"] if positive else None
    return baseline.Example(
        frame, annotation, tensor, geometry, float(positive),
        baseline.point_to_input(target, geometry) if target else (0.0, 0.0),
        (0.0, 0.0, 0.0, 0.0),
    )


def full_examples(
    baseline: Any,
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    augmentations: Iterable[str],
) -> list[Any]:
    examples = []
    for frame in frames:
        image = open_image(repo_root, frame)
        annotation = annotations[frame["frameId"]]
        for augmentation in augmentations:
            tensor, geometry = baseline.prepare_image(image, augmentation)
            examples.append(make_example(baseline, frame, annotation, tensor, geometry))
    return examples


def train_fixed_head(
    baseline: Any,
    name: str,
    features: torch.Tensor,
    examples: list[Any],
    epochs: int,
    destination: Path,
    seed: int,
) -> tuple[nn.Module, dict[str, Any]]:
    presence, coordinates = baseline.targets_for(examples, "keypoint")
    torch.manual_seed(seed)
    head = baseline.SpatialHead(features.shape[1], 2)
    optimizer = torch.optim.AdamW(head.parameters(), lr=3e-3, weight_decay=1e-4)
    generator = torch.Generator().manual_seed(seed)
    loader = DataLoader(
        TensorDataset(features, presence, coordinates), batch_size=16, shuffle=True, generator=generator,
    )
    history = []
    for epoch in range(1, epochs + 1):
        head.train()
        losses = []
        for batch_features, batch_presence, batch_coordinates in loader:
            optimizer.zero_grad(set_to_none=True)
            loss = baseline.model_loss(head(batch_features), batch_presence, batch_coordinates)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
        if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
            history.append({"epoch": epoch, "trainingLoss": statistics.fmean(losses)})
    head.eval()
    destination.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"stateDict": copy.deepcopy(head.state_dict()), "epoch": epochs, "seed": seed}, destination)
    return head, {
        "selection": "fixed final epoch; held-out fold was not used for checkpoint selection",
        "epochs": epochs,
        "history": history,
        "checkpoint": str(destination),
        "checkpointSha256": baseline.sha256_file(destination),
    }


def identity_predictions(
    baseline: Any, backbone: nn.Module, head: nn.Module, examples: list[Any],
) -> tuple[dict[str, Any], list[dict[str, Any]], np.ndarray]:
    features = baseline.extract_features(backbone, examples)
    outputs = baseline.predict(head, features)
    metrics, predictions = baseline.evaluate_keypoints(examples, outputs, CONFIDENCE_THRESHOLD)
    return metrics, predictions, outputs


def jittered_positive_roi(
    tip: dict[str, float], width: int, height: int, size_fraction: float, rng: random.Random,
) -> dict[str, float]:
    scale = rng.uniform(*SCALE_JITTER)
    side = width * size_fraction * scale
    dx = rng.uniform(-TRANSLATION_JITTER, TRANSLATION_JITTER) * side
    dy = rng.uniform(-TRANSLATION_JITTER, TRANSLATION_JITTER) * side
    roi = square_roi((tip["x"] + dx, tip["y"] + dy), width, height, size_fraction * scale)
    if not point_in_roi(tip, roi):
        raise RuntimeError("Bounded positive jitter unexpectedly excluded the target")
    return roi


def local_training_examples(
    baseline: Any,
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    global_by_id: dict[str, dict[str, Any]],
    size_fraction: float,
    seed: int,
) -> list[Any]:
    rng = random.Random(seed)
    examples = []
    for frame in frames:
        image = open_image(repo_root, frame)
        annotation = annotations[frame["frameId"]]
        positive = bool(annotation["objects"])
        for augmentation in baseline.AUGMENTATIONS:
            if positive:
                tip = annotation["objects"][0]["spoutTip"]
                roi = jittered_positive_roi(tip, image.width, image.height, size_fraction, rng)
            else:
                predicted = global_by_id[frame["frameId"]]["point"]
                roi = square_roi((predicted["x"], predicted["y"]), image.width, image.height, size_fraction)
            tensor, geometry = baseline.prepare_image(image, augmentation, roi_tuple(roi))
            examples.append(make_example(baseline, frame, annotation, tensor, geometry))
    return examples


def local_evaluation_examples(
    baseline: Any,
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    global_by_id: dict[str, dict[str, Any]],
    size_fraction: float,
) -> tuple[list[Any], dict[str, dict[str, Any]]]:
    examples = []
    rois = {}
    for frame in frames:
        image = open_image(repo_root, frame)
        predicted = global_by_id[frame["frameId"]]["point"]
        roi = square_roi((predicted["x"], predicted["y"]), image.width, image.height, size_fraction)
        tensor, geometry = baseline.prepare_image(image, "identity", roi_tuple(roi))
        examples.append(make_example(baseline, frame, annotations[frame["frameId"]], tensor, geometry))
        rois[frame["frameId"]] = roi
    return examples, rois


def summarize_candidate(
    baseline: Any,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    global_by_id: dict[str, dict[str, Any]],
    local_predictions: list[dict[str, Any]],
    rois: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    local_by_id = {item["frameId"]: item for item in local_predictions}
    records = []
    errors = []
    normalized = []
    positive_count = 0
    negative_count = 0
    misses = 0
    false_positives = 0
    contained_count = 0
    usable_count = 0
    clipped_count = 0
    margins = []
    agreements = []
    for frame in frames:
        frame_id = frame["frameId"]
        annotation = annotations[frame_id]
        positive = bool(annotation["objects"])
        global_prediction = global_by_id[frame_id]
        local = local_by_id[frame_id]
        roi = rois[frame_id]
        global_accepted = bool(global_prediction["accepted"])
        local_accepted = bool(local["accepted"])
        accepted = global_accepted and local_accepted
        clipped = roi["xMin"] <= 0 or roi["yMin"] <= 0 or roi["xMax"] >= frame["width"] or roi["yMax"] >= frame["height"]
        clipped_count += int(clipped)
        agreement_px = math.hypot(
            global_prediction["point"]["x"] - local["point"]["x"],
            global_prediction["point"]["y"] - local["point"]["y"],
        )
        agreements.append(agreement_px / frame["width"])
        contained = None
        margin = None
        error = None
        normalized_error = None
        if positive:
            positive_count += 1
            tip = annotation["objects"][0]["spoutTip"]
            contained, margin = roi_safety(tip, roi)
            contained_count += int(contained)
            usable_count += int(contained and global_accepted)
            margins.append(margin)
            if not accepted:
                misses += 1
            else:
                error = math.hypot(local["point"]["x"] - tip["x"], local["point"]["y"] - tip["y"])
                errors.append(error)
                dripper = annotation.get("dripper") or {}
                if dripper.get("radiusX", 0) > 0 and dripper.get("radiusY", 0) > 0:
                    normalized_error = error / math.sqrt(dripper["radiusX"] * dripper["radiusY"])
                    normalized.append(normalized_error)
        else:
            negative_count += 1
            false_positives += int(accepted)
        records.append({
            "frameId": frame_id, "session": frame["sessionId"], "positive": positive,
            "globalConfidence": global_prediction["confidence"], "globalAccepted": global_accepted,
            "globalPoint": global_prediction["point"], "localConfidence": local["confidence"],
            "localAccepted": local_accepted, "accepted": accepted, "localPoint": local["point"],
            "globalLocalAgreementPx": agreement_px, "globalLocalAgreementImageWidth": agreement_px / frame["width"],
            "roi": roi, "roiContainedTip": contained, "roiSafetyMarginPx": margin,
            "roiClipped": clipped, "errorPx": error, "normalizedError": normalized_error,
        })
    return {
        "positiveLocateRate": 1 - misses / positive_count,
        "missRate": misses / positive_count,
        "negativeFalsePositiveRate": false_positives / negative_count,
        "pixelError": baseline.distribution(errors),
        "normalizedError": baseline.distribution(normalized),
        "roiContainmentRate": contained_count / positive_count,
        "roiFailureRate": 1 - contained_count / positive_count,
        "roiUsableAfterGlobalConfidenceRate": usable_count / positive_count,
        "roiSafetyMarginPx": baseline.distribution(margins),
        "edgeClippingRateAllFrames": clipped_count / len(frames),
        "globalLocalAgreementImageWidth": baseline.distribution(agreements),
    }, records


def summarize_global(
    metrics: dict[str, Any], frames: list[dict[str, Any]], annotations: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    negatives = sum(1 for frame in frames if not annotations[frame["frameId"]]["objects"])
    return {
        "positiveLocateRate": 1 - metrics["missRate"],
        "missRate": metrics["missRate"],
        "negativeFalsePositiveRate": metrics["negativeFalsePositiveCount"] / negatives,
        "pixelError": metrics["pixelError"],
        "normalizedError": metrics["normalizedError"],
    }


def summarize_frozen_b(audit_records: list[dict[str, Any]], baseline: Any) -> dict[str, Any]:
    by_session = {}
    for session in SESSIONS:
        records = [item for item in audit_records if item["session"] == session]
        positives = [item for item in records if item["positive"]]
        negatives = [item for item in records if not item["positive"]]
        emitted = [item for item in positives if item["modeBKeypointAccepted"]]
        by_session[session] = {
            "protocol": "frozen Task 9C-3 B0->30% ROI->R4; trained 001-002, selected on 003; not LOSO",
            "positiveLocateRate": len(emitted) / len(positives),
            "missRate": 1 - len(emitted) / len(positives),
            "negativeFalsePositiveRate": sum(bool(item["modeBKeypointAccepted"]) for item in negatives) / len(negatives),
            "normalizedError": baseline.distribution(item["modeBKeypointNormalizedError"] for item in emitted),
            "roiContainmentRate": sum(bool(item["paddedTipContained"]) for item in positives) / len(positives),
        }
    return by_session


def load_audit_csv(path: Path) -> list[dict[str, Any]]:
    boolean_fields = {"positive", "modeBKeypointAccepted", "paddedTipContained", "boundaryTouchTop"}
    records = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for raw in csv.DictReader(handle):
            record: dict[str, Any] = dict(raw)
            for field in boolean_fields:
                record[field] = raw[field].lower() == "true"
            for field in tuple(name for name in FEATURE_NAMES if name not in boolean_fields) + ("modeBKeypointNormalizedError",):
                record[field] = float(raw[field]) if raw[field] else None
            records.append(record)
    return records


def pearson(left: list[float], right: list[float]) -> float | None:
    if len(left) < 3 or len(set(left)) < 2 or len(set(right)) < 2:
        return None
    return float(np.corrcoef(np.asarray(left), np.asarray(right))[0, 1])


def domain_sensitivity(
    audit_records: list[dict[str, Any]], candidate_records: list[dict[str, Any]],
) -> dict[str, Any]:
    audit = {item["frameId"]: item for item in audit_records if item["positive"]}
    candidate = {item["frameId"]: item for item in candidate_records if item["positive"]}
    result = {}
    for feature in FEATURE_NAMES:
        common = [frame_id for frame_id in audit if frame_id in candidate]
        common = [frame_id for frame_id in common if audit[frame_id][feature] is not None]
        values = [float(audit[frame_id][feature]) for frame_id in common]
        b_errors = [audit[frame_id]["modeBKeypointNormalizedError"] for frame_id in common]
        c_errors = [candidate[frame_id]["normalizedError"] for frame_id in common]
        result[feature] = {
            "baselineBErrorCorrelation": pearson(
                [value for value, error in zip(values, b_errors, strict=True) if error is not None],
                [float(error) for error in b_errors if error is not None],
            ),
            "candidateCErrorCorrelation": pearson(
                [value for value, error in zip(values, c_errors, strict=True) if error is not None],
                [float(error) for error in c_errors if error is not None],
            ),
            "baselineBLocateCorrelation": pearson(values, [float(audit[frame_id]["modeBKeypointAccepted"]) for frame_id in common]),
            "candidateCLocateCorrelation": pearson(values, [float(candidate[frame_id]["accepted"]) for frame_id in common]),
        }
    return result


def presence_evidence(records: list[dict[str, Any]], baseline: Any) -> dict[str, Any]:
    positives = [item for item in records if item["positive"]]
    negatives = [item for item in records if not item["positive"]]
    def field(group: list[dict[str, Any]], name: str) -> dict[str, Any]:
        return baseline.distribution(float(item[name]) for item in group)
    return {
        "globalConfidence": {"positive": field(positives, "globalConfidence"), "negative": field(negatives, "globalConfidence")},
        "localConfidence": {"positive": field(positives, "localConfidence"), "negative": field(negatives, "localConfidence")},
        "agreementImageWidth": {
            "positive": field(positives, "globalLocalAgreementImageWidth"),
            "negative": field(negatives, "globalLocalAgreementImageWidth"),
        },
        "jointFixedThreshold": {
            "threshold": CONFIDENCE_THRESHOLD,
            "positiveRecall": statistics.fmean(float(item["accepted"]) for item in positives),
            "negativeSpecificity": statistics.fmean(float(not item["accepted"]) for item in negatives),
        },
        "policyStatus": "audit only; no production presence policy frozen",
    }


def render_fold(
    repo_root: Path, frames: list[dict[str, Any]], annotations: dict[str, dict[str, Any]],
    records: list[dict[str, Any]], destination: Path,
) -> Path:
    by_id = {item["frameId"]: item for item in records}
    thumbs = []
    font = ImageFont.load_default()
    for frame in frames:
        image = open_image(repo_root, frame)
        image.thumbnail((270, 480), Image.Resampling.LANCZOS)
        sx, sy = image.width / frame["width"], image.height / frame["height"]
        record = by_id[frame["frameId"]]
        draw = ImageDraw.Draw(image)
        roi = record["roi"]
        draw.rectangle((roi["xMin"] * sx, roi["yMin"] * sy, roi["xMax"] * sx, roi["yMax"] * sy), outline="yellow", width=2)
        if record["positive"]:
            tip = annotations[frame["frameId"]]["objects"][0]["spoutTip"]
            draw.ellipse((tip["x"] * sx - 4, tip["y"] * sy - 4, tip["x"] * sx + 4, tip["y"] * sy + 4), fill="lime")
        for name, color in (("globalPoint", "cyan"), ("localPoint", "magenta")):
            point = record[name]
            draw.ellipse((point["x"] * sx - 3, point["y"] * sy - 3, point["x"] * sx + 3, point["y"] * sy + 3), fill=color)
        error = record["normalizedError"]
        text = f"{frame['frameId']} g={record['globalConfidence']:.2f} l={record['localConfidence']:.2f} e={error:.2f}" if error is not None else f"{frame['frameId']} g={record['globalConfidence']:.2f} l={record['localConfidence']:.2f}"
        draw.rectangle((0, 0, image.width, 16), fill="black")
        draw.text((2, 2), text, fill="white", font=font)
        thumbs.append(image.copy())
    cols = 5
    cell_w = max(image.width for image in thumbs)
    cell_h = max(image.height for image in thumbs)
    sheet = Image.new("RGB", (cols * cell_w, math.ceil(len(thumbs) / cols) * cell_h), "#202020")
    for index, image in enumerate(thumbs):
        sheet.paste(image, ((index % cols) * cell_w, (index // cols) * cell_h))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, quality=88)
    return destination


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    if work_root.drive.upper() != "D:":
        raise RuntimeError("Artifacts must remain on D:")
    baseline = load_module(repo_root / "scripts/vision/task9c2-baseline.py", "task9c2_baseline")
    baseline.set_determinism()
    torch.hub.set_dir(str(work_root / "cache/torch/hub"))
    frames, annotations = load_records(repo_root)
    run_dir = work_root / "runs/task-9c5-2-global-local"
    checkpoint_dir = work_root / "checkpoints/task-9c5-2"
    visual_dir = work_root / "eval/task-9c5-2"
    for path in (run_dir, checkpoint_dir, visual_dir):
        path.mkdir(parents=True, exist_ok=True)

    backbone = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1).features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)
    fold_results = {}
    all_candidate_records: dict[str, list[dict[str, Any]]] = {str(size): [] for size in ROI_SIZE_FRACTIONS}
    all_global_records = []
    training_records = {}
    started = time.time()

    for fold_index, heldout in enumerate(SESSIONS):
        train_frames = [frame for frame in frames if frame["sessionId"] != heldout]
        test_frames = [frame for frame in frames if frame["sessionId"] == heldout]
        fold_seed = SEED + fold_index * 100
        train_full = full_examples(baseline, repo_root, train_frames, annotations, baseline.AUGMENTATIONS)
        test_full = full_examples(baseline, repo_root, test_frames, annotations, ("identity",))
        train_full_features = baseline.extract_features(backbone, train_full)
        global_head, global_training = train_fixed_head(
            baseline, f"{heldout}-global", train_full_features, train_full, args.epochs,
            checkpoint_dir / heldout / "global.head.pt", fold_seed,
        )
        global_metrics, global_predictions, _ = identity_predictions(baseline, backbone, global_head, test_full)
        train_identity = full_examples(baseline, repo_root, train_frames, annotations, ("identity",))
        _, train_global_predictions, _ = identity_predictions(baseline, backbone, global_head, train_identity)
        train_global_by_id = {item["frameId"]: item for item in train_global_predictions}
        global_by_id = {item["frameId"]: item for item in global_predictions}
        all_global_records.extend({**item, "session": heldout} for item in global_predictions)

        candidates = {}
        candidate_training = {}
        for size_index, size_fraction in enumerate(ROI_SIZE_FRACTIONS):
            local_train = local_training_examples(
                baseline, repo_root, train_frames, annotations, train_global_by_id,
                size_fraction, fold_seed + size_index + 1,
            )
            local_features = baseline.extract_features(backbone, local_train)
            local_head, local_training = train_fixed_head(
                baseline, f"{heldout}-local-{size_fraction}", local_features, local_train, args.epochs,
                checkpoint_dir / heldout / f"local-{size_fraction:.2f}.head.pt", fold_seed + size_index + 1,
            )
            local_test, rois = local_evaluation_examples(
                baseline, repo_root, test_frames, annotations, global_by_id, size_fraction,
            )
            _, local_predictions, _ = identity_predictions(baseline, backbone, local_head, local_test)
            metrics, records = summarize_candidate(
                baseline, test_frames, annotations, global_by_id, local_predictions, rois,
            )
            candidates[str(size_fraction)] = metrics
            all_candidate_records[str(size_fraction)].extend(records)
            candidate_training[str(size_fraction)] = local_training
        fold_results[heldout] = {
            "trainSessions": [session for session in SESSIONS if session != heldout],
            "heldoutSession": heldout,
            "baselineAFullFrame": summarize_global(global_metrics, test_frames, annotations),
            "candidateCByRoiSize": candidates,
        }
        training_records[heldout] = {"global": global_training, "local": candidate_training}
        print(f"completed {heldout} fold", flush=True)

    def pooled_score(size: str) -> tuple[float, float, float]:
        per_fold = [fold_results[session]["candidateCByRoiSize"][size] for session in SESSIONS]
        return (
            min(item["roiContainmentRate"] for item in per_fold),
            -max(item["normalizedError"]["mean"] or math.inf for item in per_fold),
            min(item["positiveLocateRate"] for item in per_fold),
        )

    selected_size = max((str(size) for size in ROI_SIZE_FRACTIONS), key=pooled_score)
    selected_records = all_candidate_records[selected_size]
    audit_records = load_audit_csv(work_root / "eval/task-9c5-1/cross-session-frame-audit.csv")
    frozen_b = summarize_frozen_b(audit_records, baseline)
    sheets = {}
    for session in SESSIONS:
        session_frames = [frame for frame in frames if frame["sessionId"] == session]
        session_records = [item for item in selected_records if item["session"] == session]
        sheets[session] = str(render_fold(
            repo_root, session_frames, annotations, session_records,
            visual_dir / f"{session}-global-local-{selected_size}.jpg",
        ))

    results = {
        "status": "complete",
        "protocol": {
            "sessions": SESSIONS,
            "method": "leave-one-session-out; train on three sessions, evaluate the fourth",
            "checkpointSelection": "fixed final epoch; no held-out-fold selection",
            "confidenceThreshold": CONFIDENCE_THRESHOLD,
            "roiSizeFractionsOfImageWidth": ROI_SIZE_FRACTIONS,
            "selectedDevelopmentRoiSize": float(selected_size),
            "selectionRule": "maximize worst-session containment, then minimize worst-session normalized mean error, then maximize worst-session locate rate",
            "positiveJitter": {"translationFractionOfSide": TRANSLATION_JITTER, "scale": SCALE_JITTER},
            "session004Status": "development/analysis; no longer a final held-out test",
            "externalSessionsAccessed": False,
        },
        "folds": fold_results,
        "baselineBFrozen": frozen_b,
        "presenceEvidence": presence_evidence(selected_records, baseline),
        "domainSensitivity": domain_sensitivity(audit_records, selected_records),
        "training": training_records,
        "contactSheets": sheets,
        "elapsedSeconds": time.time() - started,
    }
    (run_dir / "results.json").write_text(json.dumps(results, indent=2, default=float), encoding="utf-8")
    (run_dir / "global-predictions.json").write_text(json.dumps(all_global_records, indent=2, default=float), encoding="utf-8")
    (run_dir / "candidate-predictions.json").write_text(json.dumps(all_candidate_records, indent=2, default=float), encoding="utf-8")
    print(json.dumps(results, indent=2, default=float))


if __name__ == "__main__":
    main()
