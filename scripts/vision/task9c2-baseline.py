#!/usr/bin/env python3
"""Run the Task 9C-2 CPU-only offline baseline matrix.

The media loader is deliberately allow-listed to sessions 001-003. It never opens
session-004 or external benchmark images.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import platform
import random
import statistics
import sys
import time
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import onnxruntime as ort
import torch
from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps
from torch import nn
from torch.nn import functional as F
from torch.utils.data import DataLoader, TensorDataset
from torchvision import __version__ as torchvision_version
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small


SEED = 20260925
INPUT_SIZE = 224
TRAIN_SESSIONS = {"session-001", "session-002"}
VALIDATION_SESSIONS = {"session-003"}
MEDIA_ALLOWLIST = TRAIN_SESSIONS | VALIDATION_SESSIONS
THRESHOLDS = (0.30, 0.40, 0.50, 0.60, 0.70)
AUGMENTATIONS = ("identity", "horizontal_flip", "brightness_0.90", "contrast_1.10")


@dataclass(frozen=True)
class Geometry:
    crop_x: float
    crop_y: float
    crop_width: float
    crop_height: float
    scale: float
    pad_x: float
    pad_y: float
    flipped: bool


@dataclass
class Example:
    frame: dict[str, Any]
    annotation: dict[str, Any]
    tensor: torch.Tensor
    geometry: Geometry
    presence: float
    point_target: tuple[float, float]
    bbox_target: tuple[float, float, float, float]


class SpatialHead(nn.Module):
    def __init__(self, in_channels: int, output_coordinates: int) -> None:
        super().__init__()
        self.network = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=1),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(32 * 7 * 7, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(p=0.10),
            nn.Linear(64, 1 + output_coordinates),
        )

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return self.network(inputs)


class ExportModel(nn.Module):
    def __init__(self, backbone: nn.Module, head: SpatialHead) -> None:
        super().__init__()
        self.backbone = backbone
        self.head = head

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        raw = self.head(self.backbone(inputs))
        return torch.cat((torch.sigmoid(raw[:, :1]), torch.sigmoid(raw[:, 1:])), dim=1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=100)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_d_drive(path: Path) -> Path:
    resolved = path.resolve()
    if resolved.drive.upper() != "D:":
        raise RuntimeError(f"Task 9C-2 artifact path is not on D: {resolved}")
    return resolved


def set_determinism() -> None:
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.use_deterministic_algorithms(True)
    torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))


def load_records(repo_root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, dict[str, Any]]]:
    manifest_path = repo_root / "data/vision/frames/feasibility-v1/manifests/cupmaster-spout-first-party-v1.training-ready.json"
    annotation_path = repo_root / "data/vision/annotations/feasibility-v1/first-party-v1.training-ready.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    annotations = json.loads(annotation_path.read_text(encoding="utf-8"))
    annotation_map = {
        record["frameId"]: record
        for annotation_pass in annotations["passes"]
        for record in annotation_pass["annotations"]
    }

    train = [frame for frame in manifest["frames"] if frame["sessionId"] in TRAIN_SESSIONS]
    validation = [frame for frame in manifest["frames"] if frame["sessionId"] in VALIDATION_SESSIONS]
    if len(train) != 49 or len(validation) != 17:
        raise RuntimeError(f"Unexpected split sizes: train={len(train)}, validation={len(validation)}")
    if sum(bool(annotation_map[frame["frameId"]]["objects"]) for frame in train) != 34:
        raise RuntimeError("Unexpected train positive count")
    if sum(bool(annotation_map[frame["frameId"]]["objects"]) for frame in validation) != 12:
        raise RuntimeError("Unexpected validation positive count")
    return train, validation, annotation_map


def open_allowlisted_image(repo_root: Path, frame: dict[str, Any]) -> Image.Image:
    session_id = frame["sessionId"]
    if session_id not in MEDIA_ALLOWLIST:
        raise RuntimeError(f"Refusing to open forbidden session media: {session_id}")
    path = repo_root / "data/vision" / frame["path"]
    return Image.open(path).convert("RGB")


def expanded_crop(bbox: dict[str, float], width: int, height: int, margin: float = 0.20) -> tuple[float, float, float, float]:
    box_width = bbox["xMax"] - bbox["xMin"]
    box_height = bbox["yMax"] - bbox["yMin"]
    x0 = max(0.0, bbox["xMin"] - box_width * margin)
    y0 = max(0.0, bbox["yMin"] - box_height * margin)
    x1 = min(float(width), bbox["xMax"] + box_width * margin)
    y1 = min(float(height), bbox["yMax"] + box_height * margin)
    if x1 - x0 < 2 or y1 - y0 < 2:
        raise ValueError("ROI is too small")
    return x0, y0, x1, y1


def prepare_image(
    image: Image.Image,
    augmentation: str,
    crop: tuple[float, float, float, float] | None = None,
) -> tuple[torch.Tensor, Geometry]:
    if crop is None:
        crop = (0.0, 0.0, float(image.width), float(image.height))
    x0, y0, x1, y1 = crop
    working = image.crop((round(x0), round(y0), round(x1), round(y1)))
    flipped = augmentation == "horizontal_flip"
    if flipped:
        working = ImageOps.mirror(working)
    elif augmentation == "brightness_0.90":
        working = ImageEnhance.Brightness(working).enhance(0.90)
    elif augmentation == "contrast_1.10":
        working = ImageEnhance.Contrast(working).enhance(1.10)
    elif augmentation != "identity":
        raise ValueError(f"Unknown augmentation: {augmentation}")

    scale = min(INPUT_SIZE / working.width, INPUT_SIZE / working.height)
    resized_width = max(1, round(working.width * scale))
    resized_height = max(1, round(working.height * scale))
    resized = working.resize((resized_width, resized_height), Image.Resampling.BILINEAR)
    pad_x = (INPUT_SIZE - resized_width) // 2
    pad_y = (INPUT_SIZE - resized_height) // 2
    canvas = Image.new("RGB", (INPUT_SIZE, INPUT_SIZE), (0, 0, 0))
    canvas.paste(resized, (pad_x, pad_y))

    array = np.asarray(canvas, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(array).permute(2, 0, 1)
    mean = torch.tensor((0.485, 0.456, 0.406)).view(3, 1, 1)
    std = torch.tensor((0.229, 0.224, 0.225)).view(3, 1, 1)
    tensor = (tensor - mean) / std
    geometry = Geometry(
        crop_x=float(round(x0)),
        crop_y=float(round(y0)),
        crop_width=float(working.width),
        crop_height=float(working.height),
        scale=scale,
        pad_x=float(pad_x),
        pad_y=float(pad_y),
        flipped=flipped,
    )
    return tensor, geometry


def point_to_input(point: dict[str, float], geometry: Geometry) -> tuple[float, float]:
    local_x = point["x"] - geometry.crop_x
    local_y = point["y"] - geometry.crop_y
    if geometry.flipped:
        local_x = geometry.crop_width - local_x
    return (
        (local_x * geometry.scale + geometry.pad_x) / INPUT_SIZE,
        (local_y * geometry.scale + geometry.pad_y) / INPUT_SIZE,
    )


def point_from_input(point: Iterable[float], geometry: Geometry) -> tuple[float, float]:
    normalized_x, normalized_y = point
    local_x = (normalized_x * INPUT_SIZE - geometry.pad_x) / geometry.scale
    local_y = (normalized_y * INPUT_SIZE - geometry.pad_y) / geometry.scale
    if geometry.flipped:
        local_x = geometry.crop_width - local_x
    return geometry.crop_x + local_x, geometry.crop_y + local_y


def bbox_to_input(bbox: dict[str, float], geometry: Geometry) -> tuple[float, float, float, float]:
    x0 = bbox["xMin"] - geometry.crop_x
    x1 = bbox["xMax"] - geometry.crop_x
    if geometry.flipped:
        x0, x1 = geometry.crop_width - x1, geometry.crop_width - x0
    y0 = bbox["yMin"] - geometry.crop_y
    y1 = bbox["yMax"] - geometry.crop_y
    x0 = (x0 * geometry.scale + geometry.pad_x) / INPUT_SIZE
    x1 = (x1 * geometry.scale + geometry.pad_x) / INPUT_SIZE
    y0 = (y0 * geometry.scale + geometry.pad_y) / INPUT_SIZE
    y1 = (y1 * geometry.scale + geometry.pad_y) / INPUT_SIZE
    return ((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0)


def bbox_from_input(values: Iterable[float], geometry: Geometry, image_size: tuple[int, int]) -> dict[str, float]:
    center_x, center_y, width, height = values
    x0 = ((center_x - width / 2) * INPUT_SIZE - geometry.pad_x) / geometry.scale
    x1 = ((center_x + width / 2) * INPUT_SIZE - geometry.pad_x) / geometry.scale
    y0 = ((center_y - height / 2) * INPUT_SIZE - geometry.pad_y) / geometry.scale
    y1 = ((center_y + height / 2) * INPUT_SIZE - geometry.pad_y) / geometry.scale
    image_width, image_height = image_size
    return {
        "xMin": max(0.0, min(float(image_width), geometry.crop_x + x0)),
        "yMin": max(0.0, min(float(image_height), geometry.crop_y + y0)),
        "xMax": max(0.0, min(float(image_width), geometry.crop_x + x1)),
        "yMax": max(0.0, min(float(image_height), geometry.crop_y + y1)),
    }


def build_examples(
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotation_map: dict[str, dict[str, Any]],
    augmentations: Iterable[str],
    roi_mode: bool,
) -> list[Example]:
    examples: list[Example] = []
    for frame in frames:
        annotation = annotation_map[frame["frameId"]]
        positive = bool(annotation["objects"])
        if roi_mode and not positive:
            continue
        image = open_allowlisted_image(repo_root, frame)
        obj = annotation["objects"][0] if positive else None
        crop = expanded_crop(obj["bbox"], image.width, image.height) if roi_mode and obj else None
        for augmentation in augmentations:
            tensor, geometry = prepare_image(image, augmentation, crop)
            point_target = point_to_input(obj["spoutTip"], geometry) if obj else (0.0, 0.0)
            bbox_target = bbox_to_input(obj["bbox"], geometry) if obj else (0.0, 0.0, 0.0, 0.0)
            examples.append(Example(frame, annotation, tensor, geometry, float(positive), point_target, bbox_target))
    return examples


def extract_features(backbone: nn.Module, examples: list[Example], batch_size: int = 16) -> torch.Tensor:
    tensors = torch.stack([example.tensor for example in examples])
    outputs: list[torch.Tensor] = []
    with torch.inference_mode():
        for start in range(0, len(tensors), batch_size):
            outputs.append(backbone(tensors[start:start + batch_size]).cpu())
    return torch.cat(outputs)


def targets_for(examples: list[Example], kind: str) -> tuple[torch.Tensor, torch.Tensor]:
    presence = torch.tensor([example.presence for example in examples], dtype=torch.float32)
    if kind == "detector":
        coordinates = torch.tensor([example.bbox_target for example in examples], dtype=torch.float32)
    else:
        coordinates = torch.tensor([example.point_target for example in examples], dtype=torch.float32)
    return presence, coordinates


def model_loss(raw: torch.Tensor, presence: torch.Tensor, coordinates: torch.Tensor) -> torch.Tensor:
    confidence_loss = F.binary_cross_entropy_with_logits(raw[:, 0], presence)
    positive = presence > 0.5
    coordinate_loss = F.smooth_l1_loss(torch.sigmoid(raw[positive, 1:]), coordinates[positive]) if positive.any() else raw.sum() * 0
    return confidence_loss + 5.0 * coordinate_loss


def train_head(
    name: str,
    train_features: torch.Tensor,
    train_examples: list[Example],
    validation_features: torch.Tensor,
    validation_examples: list[Example],
    coordinate_count: int,
    epochs: int,
    checkpoint_dir: Path,
) -> tuple[SpatialHead, dict[str, Any]]:
    train_presence, train_coordinates = targets_for(train_examples, "detector" if coordinate_count == 4 else "keypoint")
    validation_presence, validation_coordinates = targets_for(validation_examples, "detector" if coordinate_count == 4 else "keypoint")
    head = SpatialHead(train_features.shape[1], coordinate_count)
    optimizer = torch.optim.AdamW(head.parameters(), lr=3e-3, weight_decay=1e-4)
    generator = torch.Generator().manual_seed(SEED)
    loader = DataLoader(
        TensorDataset(train_features, train_presence, train_coordinates),
        batch_size=16,
        shuffle=True,
        generator=generator,
    )
    best_loss = math.inf
    best_epoch = 0
    best_state: dict[str, torch.Tensor] | None = None
    history: list[dict[str, float | int]] = []
    for epoch in range(1, epochs + 1):
        head.train()
        losses = []
        for features, presence, coordinates in loader:
            optimizer.zero_grad(set_to_none=True)
            loss = model_loss(head(features), presence, coordinates)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach()))
        head.eval()
        with torch.inference_mode():
            validation_loss = float(model_loss(head(validation_features), validation_presence, validation_coordinates))
        if validation_loss < best_loss:
            best_loss = validation_loss
            best_epoch = epoch
            best_state = copy.deepcopy(head.state_dict())
        if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
            history.append({"epoch": epoch, "trainLoss": statistics.fmean(losses), "validationLoss": validation_loss})
    if best_state is None:
        raise RuntimeError(f"No checkpoint selected for {name}")
    head.load_state_dict(best_state)
    checkpoint_path = checkpoint_dir / f"{name}.head.pt"
    torch.save({"stateDict": best_state, "bestEpoch": best_epoch, "seed": SEED}, checkpoint_path)
    return head, {
        "bestEpoch": best_epoch,
        "bestValidationLoss": best_loss,
        "history": history,
        "checkpoint": str(checkpoint_path),
        "checkpointSha256": sha256_file(checkpoint_path),
    }


def predict(head: SpatialHead, features: torch.Tensor) -> np.ndarray:
    head.eval()
    with torch.inference_mode():
        raw = head(features)
        return torch.cat((torch.sigmoid(raw[:, :1]), torch.sigmoid(raw[:, 1:])), dim=1).cpu().numpy()


def percentile_nearest(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(percentile * len(ordered)) - 1)]


def distribution(values: Iterable[float]) -> dict[str, float | int | None]:
    finite = [float(value) for value in values if math.isfinite(float(value))]
    if not finite:
        return {"count": 0, "mean": None, "median": None, "p90": None, "max": None}
    return {
        "count": len(finite),
        "mean": statistics.fmean(finite),
        "median": statistics.median(finite),
        "p90": percentile_nearest(finite, 0.90),
        "max": max(finite),
    }


def bbox_iou(left: dict[str, float], right: dict[str, float]) -> float:
    width = max(0.0, min(left["xMax"], right["xMax"]) - max(left["xMin"], right["xMin"]))
    height = max(0.0, min(left["yMax"], right["yMax"]) - max(left["yMin"], right["yMin"]))
    intersection = width * height
    left_area = max(0.0, left["xMax"] - left["xMin"]) * max(0.0, left["yMax"] - left["yMin"])
    right_area = max(0.0, right["xMax"] - right["xMin"]) * max(0.0, right["yMax"] - right["yMin"])
    union = left_area + right_area - intersection
    return intersection / union if union > 0 else 0.0


def choose_detector_threshold(examples: list[Example], outputs: np.ndarray) -> float:
    best = (-math.inf, 0.50)
    for threshold in THRESHOLDS:
        matched = 0
        positives = 0
        false_positives = 0
        negatives = 0
        for example, output in zip(examples, outputs, strict=True):
            if example.presence:
                positives += 1
                if output[0] >= threshold:
                    predicted = bbox_from_input(output[1:], example.geometry, (example.frame["width"], example.frame["height"]))
                    if bbox_iou(predicted, example.annotation["objects"][0]["bbox"]) >= 0.5:
                        matched += 1
            else:
                negatives += 1
                false_positives += int(output[0] >= threshold)
        score = matched / positives - false_positives / negatives
        candidate = (score, threshold)
        if candidate > best:
            best = candidate
    return best[1]


def choose_keypoint_threshold(examples: list[Example], outputs: np.ndarray) -> float:
    if not any(not example.presence for example in examples):
        return 0.50
    best = (-math.inf, 0.50)
    for threshold in THRESHOLDS:
        positive_acceptance = statistics.fmean(float(output[0] >= threshold) for example, output in zip(examples, outputs, strict=True) if example.presence)
        negative_acceptance = statistics.fmean(float(output[0] >= threshold) for example, output in zip(examples, outputs, strict=True) if not example.presence)
        candidate = (positive_acceptance - negative_acceptance, threshold)
        if candidate > best:
            best = candidate
    return best[1]


def evaluate_detector(examples: list[Example], outputs: np.ndarray, threshold: float) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    predictions = []
    ious = []
    matched = 0
    acquired = 0
    false_positives = 0
    positive_confidences = []
    negative_confidences = []
    for example, output in zip(examples, outputs, strict=True):
        accepted = bool(output[0] >= threshold)
        predicted_bbox = bbox_from_input(output[1:], example.geometry, (example.frame["width"], example.frame["height"]))
        iou = None
        if example.presence:
            positive_confidences.append(float(output[0]))
            if accepted:
                acquired += 1
                iou = bbox_iou(predicted_bbox, example.annotation["objects"][0]["bbox"])
                ious.append(iou)
                matched += int(iou >= 0.5)
        else:
            negative_confidences.append(float(output[0]))
            false_positives += int(accepted)
        predictions.append({
            "frameId": example.frame["frameId"],
            "groundTruthPositive": bool(example.presence),
            "confidence": float(output[0]),
            "accepted": accepted,
            "bbox": predicted_bbox,
            "iou": iou,
        })
    positives = sum(example.presence for example in examples)
    negatives = len(examples) - positives
    return {
        "threshold": threshold,
        "positiveRecallIoU50": matched / positives,
        "positiveAcquisitionRate": acquired / positives,
        "negativeFalsePositiveRate": false_positives / negatives,
        "bboxIoU": distribution(ious),
        "positiveConfidence": distribution(positive_confidences),
        "negativeConfidence": distribution(negative_confidences),
    }, predictions


def evaluate_keypoints(examples: list[Example], outputs: np.ndarray, threshold: float) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    predictions = []
    errors = []
    normalized_errors = []
    misses = 0
    negative_false_positives = 0
    missing_geometry = 0
    positives = 0
    for example, output in zip(examples, outputs, strict=True):
        accepted = bool(output[0] >= threshold)
        predicted_point = point_from_input(output[1:3], example.geometry)
        error = None
        normalized = None
        if example.presence:
            positives += 1
            if not accepted:
                misses += 1
            else:
                target = example.annotation["objects"][0]["spoutTip"]
                error = math.hypot(predicted_point[0] - target["x"], predicted_point[1] - target["y"])
                errors.append(error)
                dripper = example.annotation.get("dripper")
                if dripper and dripper.get("radiusX", 0) > 0 and dripper.get("radiusY", 0) > 0:
                    normalized = error / math.sqrt(dripper["radiusX"] * dripper["radiusY"])
                    normalized_errors.append(normalized)
                else:
                    missing_geometry += 1
        else:
            negative_false_positives += int(accepted)
        predictions.append({
            "frameId": example.frame["frameId"],
            "groundTruthPositive": bool(example.presence),
            "confidence": float(output[0]),
            "accepted": accepted,
            "point": {"x": predicted_point[0], "y": predicted_point[1]},
            "errorPx": error,
            "normalizedError": normalized,
        })
    return {
        "threshold": threshold,
        "pixelError": distribution(errors),
        "normalizedError": distribution(normalized_errors),
        "missRate": misses / positives,
        "negativeFalsePositiveCount": negative_false_positives,
        "normalizedExcludedMissingGeometry": missing_geometry,
    }, predictions


def run_b2(
    repo_root: Path,
    validation_frames: list[dict[str, Any]],
    annotation_map: dict[str, dict[str, Any]],
    detector_predictions: list[dict[str, Any]],
    backbone: nn.Module,
    keypoint_head: SpatialHead,
    detector_threshold: float,
    keypoint_threshold: float,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    detector_by_id = {prediction["frameId"]: prediction for prediction in detector_predictions}
    predictions = []
    errors = []
    normalized_errors = []
    acquisition_failures = 0
    keypoint_misses = 0
    emitted = 0
    accurate = 0
    positive_count = 0
    missing_geometry = 0
    for frame in validation_frames:
        annotation = annotation_map[frame["frameId"]]
        positive = bool(annotation["objects"])
        if positive:
            positive_count += 1
        detector = detector_by_id[frame["frameId"]]
        acquired = detector["confidence"] >= detector_threshold
        record: dict[str, Any] = {
            "frameId": frame["frameId"],
            "groundTruthPositive": positive,
            "detectorConfidence": detector["confidence"],
            "detectorAccepted": acquired,
            "bbox": detector["bbox"],
            "keypointAccepted": False,
            "point": None,
            "errorPx": None,
            "normalizedError": None,
        }
        if positive and not acquired:
            acquisition_failures += 1
        if not acquired:
            predictions.append(record)
            continue
        bbox = detector["bbox"]
        if bbox["xMax"] - bbox["xMin"] < 2 or bbox["yMax"] - bbox["yMin"] < 2:
            if positive:
                acquisition_failures += 1
            predictions.append(record)
            continue
        image = open_allowlisted_image(repo_root, frame)
        crop = expanded_crop(bbox, image.width, image.height)
        tensor, geometry = prepare_image(image, "identity", crop)
        features = extract_features(backbone, [Example(frame, annotation, tensor, geometry, float(positive), (0, 0), (0, 0, 0, 0))])
        output = predict(keypoint_head, features)[0]
        point = point_from_input(output[1:3], geometry)
        keypoint_accepted = bool(output[0] >= keypoint_threshold)
        record.update({
            "keypointConfidence": float(output[0]),
            "keypointAccepted": keypoint_accepted,
            "point": {"x": point[0], "y": point[1]},
        })
        if positive:
            if not keypoint_accepted:
                keypoint_misses += 1
            else:
                emitted += 1
                target = annotation["objects"][0]["spoutTip"]
                error = math.hypot(point[0] - target["x"], point[1] - target["y"])
                errors.append(error)
                record["errorPx"] = error
                dripper = annotation.get("dripper")
                if dripper and dripper.get("radiusX", 0) > 0 and dripper.get("radiusY", 0) > 0:
                    normalized = error / math.sqrt(dripper["radiusX"] * dripper["radiusY"])
                    normalized_errors.append(normalized)
                    record["normalizedError"] = normalized
                    accurate += int(normalized <= 0.10)
                else:
                    missing_geometry += 1
                    accurate += int(error <= 20.0)
        predictions.append(record)
    return {
        "detectorAcquisitionFailureRate": acquisition_failures / positive_count,
        "keypointMissRateConditionalOnDetection": keypoint_misses / max(1, positive_count - acquisition_failures),
        "pixelErrorConditionalOnSuccessfulDetectionAndKeypoint": distribution(errors),
        "normalizedErrorConditionalOnSuccessfulDetectionAndKeypoint": distribution(normalized_errors),
        "endToEndTipEmissionRate": emitted / positive_count,
        "endToEndAccurateTipRate": accurate / positive_count,
        "accurateTipDefinition": "normalized error <= 0.10 dripper effective radii; fallback <= 20 px only when dripper geometry is unavailable",
        "normalizedExcludedMissingGeometry": missing_geometry,
    }, predictions


def export_and_compare(
    name: str,
    backbone: nn.Module,
    head: SpatialHead,
    sample: torch.Tensor,
    output_dir: Path,
) -> dict[str, Any]:
    model = ExportModel(copy.deepcopy(backbone), copy.deepcopy(head)).eval()
    destination = output_dir / f"{name}.onnx"
    export_warnings = []
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        torch.onnx.export(
            model,
            sample.unsqueeze(0),
            destination,
            input_names=["image"],
            output_names=["prediction"],
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
        )
        export_warnings = [str(item.message) for item in caught]
    with torch.inference_mode():
        source = model(sample.unsqueeze(0)).cpu().numpy()
    session = ort.InferenceSession(str(destination), providers=["CPUExecutionProvider"])
    onnx_output = session.run(None, {"image": sample.unsqueeze(0).numpy()})[0]
    return {
        "path": str(destination),
        "sha256": sha256_file(destination),
        "sizeBytes": destination.stat().st_size,
        "inputShape": [1, 3, INPUT_SIZE, INPUT_SIZE],
        "outputShape": list(onnx_output.shape),
        "outputSchema": "column 0 confidence; remaining columns sigmoid-normalized coordinates",
        "maxAbsoluteDifference": float(np.max(np.abs(source - onnx_output))),
        "warnings": export_warnings,
    }


def draw_visuals(
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotation_map: dict[str, dict[str, Any]],
    detector_predictions: list[dict[str, Any]],
    a1_predictions: list[dict[str, Any]],
    b2_predictions: list[dict[str, Any]],
    output_dir: Path,
) -> Path:
    detector_by_id = {item["frameId"]: item for item in detector_predictions}
    a1_by_id = {item["frameId"]: item for item in a1_predictions}
    b2_by_id = {item["frameId"]: item for item in b2_predictions}
    thumbs = []
    font = ImageFont.load_default()
    for frame in frames:
        image = open_allowlisted_image(repo_root, frame)
        image.thumbnail((360, 640), Image.Resampling.LANCZOS)
        scale_x = image.width / frame["width"]
        scale_y = image.height / frame["height"]
        draw = ImageDraw.Draw(image)
        annotation = annotation_map[frame["frameId"]]
        detector = detector_by_id[frame["frameId"]]
        if detector["accepted"]:
            box = detector["bbox"]
            draw.rectangle((box["xMin"] * scale_x, box["yMin"] * scale_y, box["xMax"] * scale_x, box["yMax"] * scale_y), outline="yellow", width=3)
        if annotation["objects"]:
            obj = annotation["objects"][0]
            box = obj["bbox"]
            draw.rectangle((box["xMin"] * scale_x, box["yMin"] * scale_y, box["xMax"] * scale_x, box["yMax"] * scale_y), outline="lime", width=3)
            target = (obj["spoutTip"]["x"] * scale_x, obj["spoutTip"]["y"] * scale_y)
            draw.ellipse((target[0] - 5, target[1] - 5, target[0] + 5, target[1] + 5), fill="lime")
            for prediction, color in ((a1_by_id[frame["frameId"]], "cyan"), (b2_by_id[frame["frameId"]], "magenta")):
                if prediction.get("point") and prediction.get("accepted", prediction.get("keypointAccepted", False)):
                    point = (prediction["point"]["x"] * scale_x, prediction["point"]["y"] * scale_y)
                    draw.line((target[0], target[1], point[0], point[1]), fill=color, width=2)
                    draw.ellipse((point[0] - 4, point[1] - 4, point[0] + 4, point[1] + 4), fill=color)
        label = f"{frame['frameId']} det={detector['confidence']:.2f} A1={a1_by_id[frame['frameId']]['confidence']:.2f}"
        draw.rectangle((0, 0, image.width, 18), fill="black")
        draw.text((3, 3), label, fill="white", font=font)
        destination = output_dir / f"{frame['frameId']}.jpg"
        image.save(destination, quality=90)
        thumbs.append(image.copy())
    columns = 4
    cell_width = max(image.width for image in thumbs)
    cell_height = max(image.height for image in thumbs)
    rows = math.ceil(len(thumbs) / columns)
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), "#202020")
    for index, image in enumerate(thumbs):
        sheet.paste(image, ((index % columns) * cell_width, (index // columns) * cell_height))
    sheet_path = output_dir / "validation-contact-sheet.jpg"
    sheet.save(sheet_path, quality=88)
    return sheet_path


def main() -> None:
    started = time.time()
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = require_d_drive(args.work_root)
    run_dir = work_root / "runs/task-9c2-baseline"
    checkpoint_dir = work_root / "checkpoints/task-9c2"
    export_dir = work_root / "exports/onnx/task-9c2"
    visual_dir = work_root / "eval/task-9c2/validation-visuals"
    for directory in (run_dir, checkpoint_dir, export_dir, visual_dir):
        directory.mkdir(parents=True, exist_ok=True)
    set_determinism()
    train_frames, validation_frames, annotation_map = load_records(repo_root)

    weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1
    full_model = mobilenet_v3_small(weights=weights)
    backbone = full_model.features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)

    full_train_examples = build_examples(repo_root, train_frames, annotation_map, AUGMENTATIONS, roi_mode=False)
    full_validation_examples = build_examples(repo_root, validation_frames, annotation_map, ("identity",), roi_mode=False)
    roi_train_examples = build_examples(repo_root, train_frames, annotation_map, AUGMENTATIONS, roi_mode=True)
    roi_validation_examples = build_examples(repo_root, validation_frames, annotation_map, ("identity",), roi_mode=True)
    full_train_features = extract_features(backbone, full_train_examples)
    full_validation_features = extract_features(backbone, full_validation_examples)
    roi_train_features = extract_features(backbone, roi_train_examples)
    roi_validation_features = extract_features(backbone, roi_validation_examples)

    a1_head, a1_training = train_head("a1-full-frame-keypoint", full_train_features, full_train_examples, full_validation_features, full_validation_examples, 2, args.epochs, checkpoint_dir)
    b0_head, b0_training = train_head("b0-detector", full_train_features, full_train_examples, full_validation_features, full_validation_examples, 4, args.epochs, checkpoint_dir)
    b1_head, b1_training = train_head("b1-gt-roi-keypoint", roi_train_features, roi_train_examples, roi_validation_features, roi_validation_examples, 2, args.epochs, checkpoint_dir)

    a1_outputs = predict(a1_head, full_validation_features)
    b0_outputs = predict(b0_head, full_validation_features)
    b1_outputs = predict(b1_head, roi_validation_features)
    a1_threshold = choose_keypoint_threshold(full_validation_examples, a1_outputs)
    b0_threshold = choose_detector_threshold(full_validation_examples, b0_outputs)
    b1_threshold = choose_keypoint_threshold(roi_validation_examples, b1_outputs)
    a1_metrics, a1_predictions = evaluate_keypoints(full_validation_examples, a1_outputs, a1_threshold)
    b0_metrics, b0_predictions = evaluate_detector(full_validation_examples, b0_outputs, b0_threshold)
    b1_metrics, b1_predictions = evaluate_keypoints(roi_validation_examples, b1_outputs, b1_threshold)
    b2_metrics, b2_predictions = run_b2(repo_root, validation_frames, annotation_map, b0_predictions, backbone, b1_head, b0_threshold, b1_threshold)

    contact_sheet = draw_visuals(repo_root, validation_frames, annotation_map, b0_predictions, a1_predictions, b2_predictions, visual_dir)
    onnx_exports = {
        "detector": export_and_compare("b0-detector", backbone, b0_head, full_validation_examples[0].tensor, export_dir),
        "a1Keypoint": export_and_compare("a1-full-frame-keypoint", backbone, a1_head, full_validation_examples[0].tensor, export_dir),
        "b1Keypoint": export_and_compare("b1-gt-roi-keypoint", backbone, b1_head, roi_validation_examples[0].tensor, export_dir),
    }

    torch_checkpoint = Path(torch.hub.get_dir()) / "checkpoints/mobilenet_v3_small-047dcff4.pth"
    environment = {
        "python": sys.version,
        "platform": platform.platform(),
        "torch": torch.__version__,
        "torchvision": torchvision_version,
        "onnxruntime": ort.__version__,
        "device": "cpu",
        "threads": torch.get_num_threads(),
        "seed": SEED,
        "environment": {name: os.environ.get(name) for name in (
            "VISION_WORK_ROOT", "HF_HOME", "HF_HUB_CACHE", "HF_DATASETS_CACHE", "TORCH_HOME",
            "PIP_CACHE_DIR", "MMENGINE_HOME", "UV_CACHE_DIR", "UV_PYTHON_INSTALL_DIR", "TMP", "TEMP",
        )},
        "upstreamCheckpoint": {
            "path": str(torch_checkpoint),
            "sizeBytes": torch_checkpoint.stat().st_size,
            "sha256": sha256_file(torch_checkpoint),
            "sourceUrl": "https://download.pytorch.org/models/mobilenet_v3_small-047dcff4.pth",
        },
    }
    results = {
        "status": "complete",
        "dataset": {
            "train": {"total": 49, "positive": 34, "negative": 15, "sessions": sorted(TRAIN_SESSIONS)},
            "validation": {"total": 17, "positive": 12, "negative": 5, "sessions": sorted(VALIDATION_SESSIONS)},
            "mediaAllowlist": sorted(MEDIA_ALLOWLIST),
            "session004MediaAccessed": False,
            "externalMediaAccessed": False,
        },
        "budget": {"epochs": args.epochs, "inputSize": [INPUT_SIZE, INPUT_SIZE], "augmentations": AUGMENTATIONS, "seed": SEED},
        "training": {"a1": a1_training, "b0": b0_training, "b1": b1_training},
        "metrics": {"a1": a1_metrics, "b0": b0_metrics, "b1": b1_metrics, "b2": b2_metrics},
        "onnx": onnx_exports,
        "visualQa": {"directory": str(visual_dir), "contactSheet": str(contact_sheet)},
        "elapsedSeconds": time.time() - started,
    }
    (run_dir / "environment.json").write_text(json.dumps(environment, indent=2), encoding="utf-8")
    (run_dir / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    (run_dir / "predictions.json").write_text(json.dumps({
        "a1": a1_predictions,
        "b0": b0_predictions,
        "b1": b1_predictions,
        "b2": b2_predictions,
    }, indent=2, default=float), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
