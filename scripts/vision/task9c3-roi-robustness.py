#!/usr/bin/env python3
"""Task 9C-3 detector-ROI to keypoint robustness experiment."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import random
import statistics
import sys
import time
from pathlib import Path
from typing import Any

import torch
from PIL import Image, ImageDraw, ImageFont
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small


SCRIPT_DIR = Path(__file__).resolve().parent
BASELINE_PATH = SCRIPT_DIR / "task9c2-baseline.py"
SPEC = importlib.util.spec_from_file_location("task9c2_baseline", BASELINE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import baseline tooling from {BASELINE_PATH}")
baseline = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = baseline
SPEC.loader.exec_module(baseline)

SEED = 20260925
PADDING_POLICIES = (0.0, 0.15, 0.30)
LEGACY_B2_PADDING = 0.20
DETECTOR_THRESHOLD = 0.70
KEYPOINT_THRESHOLD = 0.50


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=100)
    return parser.parse_args()


def expand_roi(
    bbox: dict[str, float],
    image_width: int,
    image_height: int,
    padding: float,
) -> dict[str, float]:
    if padding < 0:
        raise ValueError("ROI padding cannot be negative")
    width = bbox["xMax"] - bbox["xMin"]
    height = bbox["yMax"] - bbox["yMin"]
    if width <= 0 or height <= 0:
        raise ValueError("ROI bbox must have positive area")
    return {
        "xMin": max(0.0, bbox["xMin"] - width * padding),
        "yMin": max(0.0, bbox["yMin"] - height * padding),
        "xMax": min(float(image_width), bbox["xMax"] + width * padding),
        "yMax": min(float(image_height), bbox["yMax"] + height * padding),
    }


def roi_tuple(roi: dict[str, float]) -> tuple[float, float, float, float]:
    return roi["xMin"], roi["yMin"], roi["xMax"], roi["yMax"]


def tip_safety(
    point: dict[str, float],
    roi: dict[str, float],
) -> tuple[bool, float, float]:
    inside = roi["xMin"] <= point["x"] <= roi["xMax"] and roi["yMin"] <= point["y"] <= roi["yMax"]
    width = roi["xMax"] - roi["xMin"]
    height = roi["yMax"] - roi["yMin"]
    if inside:
        margin = min(
            point["x"] - roi["xMin"],
            roi["xMax"] - point["x"],
            point["y"] - roi["yMin"],
            roi["yMax"] - point["y"],
        )
    else:
        nearest_x = min(max(point["x"], roi["xMin"]), roi["xMax"])
        nearest_y = min(max(point["y"], roi["yMin"]), roi["yMax"])
        margin = -math.hypot(point["x"] - nearest_x, point["y"] - nearest_y)
    return inside, margin, margin / min(width, height)


def touches_image_boundary(roi: dict[str, float], width: int, height: int) -> bool:
    epsilon = 1e-6
    return (
        roi["xMin"] <= epsilon
        or roi["yMin"] <= epsilon
        or roi["xMax"] >= width - epsilon
        or roi["yMax"] >= height - epsilon
    )


def detector_geometry(
    predicted: dict[str, float],
    expected: dict[str, float],
) -> dict[str, float]:
    predicted_width = predicted["xMax"] - predicted["xMin"]
    predicted_height = predicted["yMax"] - predicted["yMin"]
    expected_width = expected["xMax"] - expected["xMin"]
    expected_height = expected["yMax"] - expected["yMin"]
    predicted_center = ((predicted["xMin"] + predicted["xMax"]) / 2, (predicted["yMin"] + predicted["yMax"]) / 2)
    expected_center = ((expected["xMin"] + expected["xMax"]) / 2, (expected["yMin"] + expected["yMax"]) / 2)
    center_error = math.hypot(predicted_center[0] - expected_center[0], predicted_center[1] - expected_center[1])
    expected_diagonal = math.hypot(expected_width, expected_height)
    return {
        "centerErrorPx": center_error,
        "centerErrorGtDiagonal": center_error / expected_diagonal,
        "widthScaleRatio": predicted_width / expected_width,
        "heightScaleRatio": predicted_height / expected_height,
    }


def make_example(
    frame: dict[str, Any],
    annotation: dict[str, Any],
    tensor: torch.Tensor,
    geometry: Any,
) -> Any:
    obj = annotation["objects"][0]
    return baseline.Example(
        frame,
        annotation,
        tensor,
        geometry,
        1.0,
        baseline.point_to_input(obj["spoutTip"], geometry),
        (0.0, 0.0, 0.0, 0.0),
    )


def predicted_roi_examples(
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    detector_by_id: dict[str, dict[str, Any]],
    padding: float,
) -> tuple[list[Any], dict[str, dict[str, Any]]]:
    examples = []
    rois = {}
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        if not annotation["objects"]:
            continue
        detector = detector_by_id[frame["frameId"]]
        if not detector["accepted"]:
            continue
        roi = expand_roi(detector["bbox"], frame["width"], frame["height"], padding)
        image = baseline.open_allowlisted_image(repo_root, frame)
        tensor, geometry = baseline.prepare_image(image, "identity", roi_tuple(roi))
        examples.append(make_example(frame, annotation, tensor, geometry))
        rois[frame["frameId"]] = roi
    return examples, rois


def sample_jittered_roi(
    bbox: dict[str, float],
    tip: dict[str, float],
    width: int,
    height: int,
    rng: random.Random,
) -> dict[str, float]:
    box_width = bbox["xMax"] - bbox["xMin"]
    box_height = bbox["yMax"] - bbox["yMin"]
    center_x = (bbox["xMin"] + bbox["xMax"]) / 2
    center_y = (bbox["yMin"] + bbox["yMax"]) / 2
    for _ in range(32):
        shifted_x = center_x + rng.uniform(-0.10, 0.10) * box_width
        shifted_y = center_y + rng.uniform(-0.10, 0.10) * box_height
        scale = rng.uniform(0.85, 1.30)
        jittered = {
            "xMin": max(0.0, shifted_x - box_width * scale / 2),
            "yMin": max(0.0, shifted_y - box_height * scale / 2),
            "xMax": min(float(width), shifted_x + box_width * scale / 2),
            "yMax": min(float(height), shifted_y + box_height * scale / 2),
        }
        if jittered["xMin"] <= tip["x"] <= jittered["xMax"] and jittered["yMin"] <= tip["y"] <= jittered["yMax"]:
            return jittered
    raise RuntimeError("Could not sample a tip-containing jitter ROI in 32 attempts")


def jitter_training_examples(
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
) -> tuple[list[Any], list[dict[str, Any]]]:
    rng = random.Random(SEED)
    examples = []
    samples = []
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        if not annotation["objects"]:
            continue
        image = baseline.open_allowlisted_image(repo_root, frame)
        obj = annotation["objects"][0]
        for augmentation in baseline.AUGMENTATIONS:
            roi = sample_jittered_roi(obj["bbox"], obj["spoutTip"], image.width, image.height, rng)
            tensor, geometry = baseline.prepare_image(image, augmentation, roi_tuple(roi))
            examples.append(make_example(frame, annotation, tensor, geometry))
            geometry_record = detector_geometry(roi, obj["bbox"])
            samples.append({
                "frameId": frame["frameId"],
                "augmentation": augmentation,
                "roi": roi,
                **geometry_record,
            })
    return examples, samples


def evaluate_policy(
    name: str,
    examples: list[Any],
    rois: dict[str, dict[str, Any]],
    backbone: torch.nn.Module,
    head: torch.nn.Module,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    features = baseline.extract_features(backbone, examples)
    outputs = baseline.predict(head, features)
    metrics, predictions = baseline.evaluate_keypoints(examples, outputs, KEYPOINT_THRESHOLD)
    for prediction in predictions:
        prediction["roi"] = rois[prediction["frameId"]]
        prediction["configuration"] = name
    return metrics, predictions


def diagnostic_summary(
    validation_frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    detector_by_id: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    records = []
    for frame in validation_frames:
        annotation = annotations[frame["frameId"]]
        if not annotation["objects"]:
            continue
        obj = annotation["objects"][0]
        detector = detector_by_id[frame["frameId"]]
        raw_roi = detector["bbox"]
        geometry = detector_geometry(raw_roi, obj["bbox"])
        record: dict[str, Any] = {
            "frameId": frame["frameId"],
            "filename": Path(frame["path"]).name,
            "detectorIoU": detector["iou"],
            "detectorConfidence": detector["confidence"],
            **geometry,
            "padding": {},
        }
        for padding in PADDING_POLICIES:
            roi = expand_roi(raw_roi, frame["width"], frame["height"], padding)
            contained, margin_px, margin_ratio = tip_safety(obj["spoutTip"], roi)
            record["padding"][str(padding)] = {
                "roi": roi,
                "tipContained": contained,
                "safetyMarginPx": margin_px,
                "safetyMarginMinDimension": margin_ratio,
                "touchesImageBoundary": touches_image_boundary(roi, frame["width"], frame["height"]),
            }
        records.append(record)
    raw = [record["padding"]["0.0"] for record in records]
    return {
        "tipContainmentRate": statistics.fmean(float(item["tipContained"]) for item in raw),
        "safetyMarginPx": baseline.distribution(item["safetyMarginPx"] for item in raw),
        "safetyMarginMinDimension": baseline.distribution(item["safetyMarginMinDimension"] for item in raw),
        "centerErrorPx": baseline.distribution(record["centerErrorPx"] for record in records),
        "centerErrorGtDiagonal": baseline.distribution(record["centerErrorGtDiagonal"] for record in records),
        "widthScaleRatio": baseline.distribution(record["widthScaleRatio"] for record in records),
        "heightScaleRatio": baseline.distribution(record["heightScaleRatio"] for record in records),
        "paddingContainment": {
            str(padding): statistics.fmean(float(record["padding"][str(padding)]["tipContained"]) for record in records)
            for padding in PADDING_POLICIES
        },
    }, records


def attach_errors(
    diagnostics: list[dict[str, Any]],
    prediction_sets: dict[str, list[dict[str, Any]]],
) -> None:
    by_frame = {record["frameId"]: record for record in diagnostics}
    for name, predictions in prediction_sets.items():
        for prediction in predictions:
            by_frame[prediction["frameId"]].setdefault("keypoint", {})[name] = {
                "normalizedTipError": prediction["normalizedError"],
                "pixelError": prediction["errorPx"],
                "predictedTipConfidence": prediction["confidence"],
            }


def classify_cause(record: dict[str, Any], configuration: str) -> str:
    padding_key = {"r1": "0.0", "r2": "0.15", "r3": "0.3", "r4": record["bestPaddingKey"]}[configuration]
    roi = record["padding"][padding_key]
    if not roi["tipContained"]:
        return "ROI shifted" if record["centerErrorGtDiagonal"] > 0.20 else "ROI too tight"
    if roi["safetyMarginMinDimension"] < 0.05:
        return "tip near crop boundary"
    if record["detectorIoU"] >= 0.50:
        return "keypoint failure despite good ROI"
    if roi["touchesImageBoundary"]:
        return "image-edge truncation"
    return "ROI shifted"


def render_policy(
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    predictions: list[dict[str, Any]],
    output_dir: Path,
    label: str,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    by_id = {prediction["frameId"]: prediction for prediction in predictions}
    thumbs = []
    font = ImageFont.load_default()
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        if not annotation["objects"]:
            continue
        prediction = by_id[frame["frameId"]]
        image = baseline.open_allowlisted_image(repo_root, frame)
        image.thumbnail((360, 640), Image.Resampling.LANCZOS)
        scale_x = image.width / frame["width"]
        scale_y = image.height / frame["height"]
        draw = ImageDraw.Draw(image)
        roi = prediction["roi"]
        draw.rectangle((roi["xMin"] * scale_x, roi["yMin"] * scale_y, roi["xMax"] * scale_x, roi["yMax"] * scale_y), outline="yellow", width=3)
        target_obj = annotation["objects"][0]
        target = (target_obj["spoutTip"]["x"] * scale_x, target_obj["spoutTip"]["y"] * scale_y)
        point = (prediction["point"]["x"] * scale_x, prediction["point"]["y"] * scale_y)
        draw.line((target[0], target[1], point[0], point[1]), fill="magenta", width=2)
        draw.ellipse((target[0] - 5, target[1] - 5, target[0] + 5, target[1] + 5), fill="lime")
        draw.ellipse((point[0] - 4, point[1] - 4, point[0] + 4, point[1] + 4), fill="magenta")
        text = f"{frame['frameId']} {label} e={prediction['normalizedError']:.3f} c={prediction['confidence']:.2f}"
        draw.rectangle((0, 0, image.width, 18), fill="black")
        draw.text((3, 3), text, fill="white", font=font)
        image.save(output_dir / f"{frame['frameId']}.jpg", quality=90)
        thumbs.append(image.copy())
    columns = 4
    cell_width = max(image.width for image in thumbs)
    cell_height = max(image.height for image in thumbs)
    sheet = Image.new("RGB", (columns * cell_width, math.ceil(len(thumbs) / columns) * cell_height), "#202020")
    for index, image in enumerate(thumbs):
        sheet.paste(image, ((index % columns) * cell_width, (index // columns) * cell_height))
    path = output_dir / f"{label}-contact-sheet.jpg"
    sheet.save(path, quality=88)
    return path


def main() -> None:
    started = time.time()
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = baseline.require_d_drive(args.work_root)
    run_dir = work_root / "runs/task-9c3-roi-robustness"
    checkpoint_dir = work_root / "checkpoints/task-9c3"
    export_dir = work_root / "exports/onnx/task-9c3"
    visual_root = work_root / "eval/task-9c3/validation-visuals"
    for path in (run_dir, checkpoint_dir, export_dir, visual_root):
        path.mkdir(parents=True, exist_ok=True)
    baseline.set_determinism()
    train_frames, validation_frames, annotations = baseline.load_records(repo_root)

    backbone = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1).features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)
    in_channels = 576
    b0_head = baseline.SpatialHead(in_channels, 4)
    b1_head = baseline.SpatialHead(in_channels, 2)
    b0_head.load_state_dict(torch.load(work_root / "checkpoints/task-9c2/b0-detector.head.pt", weights_only=True)["stateDict"])
    b1_head.load_state_dict(torch.load(work_root / "checkpoints/task-9c2/b1-gt-roi-keypoint.head.pt", weights_only=True)["stateDict"])
    b0_head.eval()
    b1_head.eval()

    prior_predictions = json.loads((work_root / "runs/task-9c2-baseline/predictions.json").read_text(encoding="utf-8"))
    detector_by_id = {prediction["frameId"]: prediction for prediction in prior_predictions["b0"]}
    diagnostics_summary, diagnostics = diagnostic_summary(validation_frames, annotations, detector_by_id)

    gt_examples = baseline.build_examples(repo_root, validation_frames, annotations, ("identity",), roi_mode=True)
    gt_rois = {
        example.frame["frameId"]: {
            "xMin": example.geometry.crop_x,
            "yMin": example.geometry.crop_y,
            "xMax": example.geometry.crop_x + example.geometry.crop_width,
            "yMax": example.geometry.crop_y + example.geometry.crop_height,
        }
        for example in gt_examples
    }
    r0_metrics, r0_predictions = evaluate_policy("r0", gt_examples, gt_rois, backbone, b1_head)

    fixed_results: dict[float, tuple[dict[str, Any], list[dict[str, Any]], list[Any], dict[str, dict[str, Any]]]] = {}
    for padding in PADDING_POLICIES:
        examples, rois = predicted_roi_examples(repo_root, validation_frames, annotations, detector_by_id, padding)
        metrics, predictions = evaluate_policy(f"padding-{padding}", examples, rois, backbone, b1_head)
        fixed_results[padding] = (metrics, predictions, examples, rois)
    best_padding = min(PADDING_POLICIES, key=lambda value: fixed_results[value][0]["normalizedError"]["mean"])

    jitter_examples, jitter_samples = jitter_training_examples(repo_root, train_frames, annotations)
    jitter_features = baseline.extract_features(backbone, jitter_examples)
    best_validation_examples = fixed_results[best_padding][2]
    best_validation_features = baseline.extract_features(backbone, best_validation_examples)
    jitter_head, jitter_training = baseline.train_head(
        "r4-jitter-roi-keypoint",
        jitter_features,
        jitter_examples,
        best_validation_features,
        best_validation_examples,
        2,
        args.epochs,
        checkpoint_dir,
    )
    r4_metrics, r4_predictions = evaluate_policy(
        "r4",
        best_validation_examples,
        fixed_results[best_padding][3],
        backbone,
        jitter_head,
    )
    jitter_gt_metrics, jitter_gt_predictions = evaluate_policy("jitter-gt", gt_examples, gt_rois, backbone, jitter_head)

    named_predictions = {
        "r0": r0_predictions,
        "r1": fixed_results[0.0][1],
        "r2": fixed_results[0.15][1],
        "r3": fixed_results[0.30][1],
        "r4": r4_predictions,
        "jitterGt": jitter_gt_predictions,
    }
    attach_errors(diagnostics, named_predictions)
    best_padding_key = str(best_padding)
    for record in diagnostics:
        record["bestPaddingKey"] = best_padding_key
    outliers = sorted(
        diagnostics,
        key=lambda record: record["keypoint"]["r4"]["normalizedTipError"],
        reverse=True,
    )[:5]
    outlier_report = [
        {
            "frameId": record["frameId"],
            "filename": record["filename"],
            "normalizedTipError": record["keypoint"]["r4"]["normalizedTipError"],
            "detectorIoU": record["detectorIoU"],
            "tipContained": record["padding"][best_padding_key]["tipContained"],
            "safetyMarginPx": record["padding"][best_padding_key]["safetyMarginPx"],
            "predictedTipConfidence": record["keypoint"]["r4"]["predictedTipConfidence"],
            "touchesImageBoundary": record["padding"][best_padding_key]["touchesImageBoundary"],
            "cause": classify_cause(record, "r4"),
        }
        for record in outliers
    ]

    sheets = {
        "r0": str(render_policy(repo_root, validation_frames, annotations, r0_predictions, visual_root / "r0", "r0")),
        "r1": str(render_policy(repo_root, validation_frames, annotations, fixed_results[0.0][1], visual_root / "r1", "r1")),
        "r2": str(render_policy(repo_root, validation_frames, annotations, fixed_results[0.15][1], visual_root / "r2", "r2")),
        "r3": str(render_policy(repo_root, validation_frames, annotations, fixed_results[0.30][1], visual_root / "r3", "r3")),
        "r4": str(render_policy(repo_root, validation_frames, annotations, r4_predictions, visual_root / "r4", "r4")),
        "jitterGt": str(render_policy(repo_root, validation_frames, annotations, jitter_gt_predictions, visual_root / "jitter-gt", "jitter-gt")),
    }
    onnx = baseline.export_and_compare(
        "r4-jitter-roi-keypoint",
        backbone,
        jitter_head,
        best_validation_examples[0].tensor,
        export_dir,
    )

    legacy_results = json.loads((work_root / "runs/task-9c2-baseline/results.json").read_text(encoding="utf-8"))
    legacy_b1 = legacy_results["metrics"]["b1"]["normalizedError"]["mean"]
    legacy_b2 = legacy_results["metrics"]["b2"]["normalizedErrorConditionalOnSuccessfulDetectionAndKeypoint"]["mean"]
    best_fixed_mean = fixed_results[best_padding][0]["normalizedError"]["mean"]
    r4_mean = r4_metrics["normalizedError"]["mean"]
    gap = legacy_b2 - legacy_b1
    results = {
        "status": "complete",
        "dataset": {
            "trainSessions": sorted(baseline.TRAIN_SESSIONS),
            "validationSessions": sorted(baseline.VALIDATION_SESSIONS),
            "session004MediaAccessed": False,
            "externalMediaAccessed": False,
        },
        "policy": {
            "paddingPerSide": PADDING_POLICIES,
            "order": "expand predicted bbox around center, clamp to image, crop, then letterbox to 224x224; no square conversion",
            "legacyB2PaddingPerSide": LEGACY_B2_PADDING,
            "bestFixedPadding": best_padding,
            "jitter": {
                "seed": SEED,
                "translation": "independent uniform dx/dy in [-0.10, 0.10] of GT bbox width/height",
                "scale": "uniform [0.85, 1.30] applied to both width and height",
                "containment": "deterministic rejection sampling, maximum 32 attempts, so the annotated tip remains visible",
                "augmentations": baseline.AUGMENTATIONS,
            },
        },
        "detectorDiagnostics": diagnostics_summary,
        "metrics": {
            "r0": r0_metrics,
            "r1": fixed_results[0.0][0],
            "r2": fixed_results[0.15][0],
            "r3": fixed_results[0.30][0],
            "r4": r4_metrics,
            "jitterGt": jitter_gt_metrics,
        },
        "training": jitter_training,
        "comparisons": {
            "legacyB1Mean": legacy_b1,
            "legacyB2Mean": legacy_b2,
            "bestFixedMean": best_fixed_mean,
            "r4Mean": r4_mean,
            "paddingGapClosedPercent": (legacy_b2 - best_fixed_mean) / gap * 100,
            "r4GapClosedPercent": (legacy_b2 - r4_mean) / gap * 100,
            "jitterGtChangeVsR0Percent": (
                jitter_gt_metrics["normalizedError"]["mean"] - r0_metrics["normalizedError"]["mean"]
            ) / r0_metrics["normalizedError"]["mean"] * 100,
        },
        "outliers": outlier_report,
        "onnx": onnx,
        "visualQa": sheets,
        "elapsedSeconds": time.time() - started,
    }
    (run_dir / "results.json").write_text(json.dumps(results, indent=2, default=float), encoding="utf-8")
    (run_dir / "diagnostics.json").write_text(json.dumps(diagnostics, indent=2, default=float), encoding="utf-8")
    (run_dir / "predictions.json").write_text(json.dumps(named_predictions, indent=2, default=float), encoding="utf-8")
    (run_dir / "jitter-samples.json").write_text(json.dumps(jitter_samples, indent=2, default=float), encoding="utf-8")
    print(json.dumps(results, indent=2, default=float))


if __name__ == "__main__":
    main()
