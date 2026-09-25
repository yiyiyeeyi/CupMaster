#!/usr/bin/env python3
"""Task 9C-5.1 deterministic cross-session domain-shift audit."""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import math
import statistics
import sys
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
RUNNER_PATH = SCRIPT_DIR / "task9c4-hybrid-video.py"
SPEC = importlib.util.spec_from_file_location("task9c4_hybrid_video", RUNNER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import frozen runner from {RUNNER_PATH}")
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)

SESSIONS = ("session-001", "session-002", "session-003", "session-004")
COLORS = {
    "session-001": (31, 119, 180),
    "session-002": (255, 127, 14),
    "session-003": (44, 160, 44),
    "session-004": (214, 39, 40),
}
FEATURES = (
    "bboxAreaFraction", "bboxAspectRatio", "bboxCenterXNorm", "bboxCenterYNorm",
    "tipXNorm", "tipYNorm", "tipEdgeDistanceNorm", "dripperRadiusImageWidth",
    "tipDripperDistanceRadii", "tipRelativeX", "tipRelativeY", "spoutLengthProxyNorm",
    "boundaryTouchCount", "meanLuminance", "luminanceStd", "localContrast",
    "meanSaturation", "highlightFraction", "darkFraction",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--work-root", type=Path, required=True)
    return parser.parse_args()


def distribution(values: Iterable[float | None]) -> dict[str, float | int | None]:
    finite = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    if not finite:
        return {"count": 0, "mean": None, "median": None, "min": None, "max": None}
    return {
        "count": len(finite),
        "mean": statistics.fmean(finite),
        "median": statistics.median(finite),
        "min": min(finite),
        "max": max(finite),
    }


def pearson(pairs: Iterable[tuple[float | None, float | None]]) -> float | None:
    valid = [(float(left), float(right)) for left, right in pairs if left is not None and right is not None]
    if len(valid) < 3:
        return None
    left = np.asarray([item[0] for item in valid], dtype=np.float64)
    right = np.asarray([item[1] for item in valid], dtype=np.float64)
    if float(left.std()) <= 1e-12 or float(right.std()) <= 1e-12:
        return None
    return float(np.corrcoef(left, right)[0, 1])


def load_dataset(repo_root: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], Path, Path]:
    manifest_path = repo_root / "data/vision/frames/feasibility-v1/manifests/cupmaster-spout-first-party-v1.training-ready.json"
    annotation_path = repo_root / "data/vision/annotations/feasibility-v1/first-party-v1.training-ready.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    payload = json.loads(annotation_path.read_text(encoding="utf-8"))
    annotations = {
        item["frameId"]: item
        for annotation_pass in payload["passes"]
        for item in annotation_pass["annotations"]
    }
    frames = [item for item in manifest["frames"] if item["sessionId"] in SESSIONS]
    if len(frames) != 88 or set(item["sessionId"] for item in frames) != set(SESSIONS):
        raise RuntimeError("Expected the frozen 88-frame first-party dataset across sessions 001–004")
    return frames, annotations, manifest_path, annotation_path


def image_diagnostics(image: np.ndarray, bbox: dict[str, float] | None) -> dict[str, float | None]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    local_contrast = None
    if bbox is not None:
        x0 = max(0, min(image.shape[1] - 1, math.floor(bbox["xMin"])))
        y0 = max(0, min(image.shape[0] - 1, math.floor(bbox["yMin"])))
        x1 = max(x0 + 1, min(image.shape[1], math.ceil(bbox["xMax"])))
        y1 = max(y0 + 1, min(image.shape[0], math.ceil(bbox["yMax"])))
        local_contrast = float(gray[y0:y1, x0:x1].std())
    return {
        "meanLuminance": float(gray.mean()),
        "luminanceStd": float(gray.std()),
        "localContrast": local_contrast,
        "meanSaturation": float(hsv[:, :, 1].mean()),
        "highlightFraction": float(np.mean(gray >= 245)),
        "darkFraction": float(np.mean(gray <= 32)),
    }


def geometry_diagnostics(
    frame: dict[str, Any], annotation: dict[str, Any],
) -> dict[str, Any]:
    width = float(frame["width"])
    height = float(frame["height"])
    result: dict[str, Any] = {
        "imageWidth": int(width), "imageHeight": int(height), "aspectRatio": width / height,
    }
    if not annotation["objects"]:
        return result
    obj = annotation["objects"][0]
    bbox = obj["bbox"]
    tip = obj["spoutTip"]
    box_width = bbox["xMax"] - bbox["xMin"]
    box_height = bbox["yMax"] - bbox["yMin"]
    epsilon = 1.0
    touches = {
        "boundaryTouchTop": bbox["yMin"] <= epsilon,
        "boundaryTouchRight": bbox["xMax"] >= width - epsilon,
        "boundaryTouchBottom": bbox["yMax"] >= height - epsilon,
        "boundaryTouchLeft": bbox["xMin"] <= epsilon,
    }
    edge_distance = min(tip["x"], width - tip["x"], tip["y"], height - tip["y"])
    dripper = annotation.get("dripper")
    radius = math.sqrt(dripper["radiusX"] * dripper["radiusY"]) if dripper else None
    result.update({
        "bboxWidth": box_width,
        "bboxHeight": box_height,
        "bboxAreaFraction": box_width * box_height / (width * height),
        "bboxAspectRatio": box_width / box_height,
        "bboxCenterXNorm": ((bbox["xMin"] + bbox["xMax"]) / 2) / width,
        "bboxCenterYNorm": ((bbox["yMin"] + bbox["yMax"]) / 2) / height,
        "tipXNorm": tip["x"] / width,
        "tipYNorm": tip["y"] / height,
        "tipEdgeDistancePx": edge_distance,
        "tipEdgeDistanceNorm": edge_distance / min(width, height),
        "dripperEffectiveRadius": radius,
        "dripperRadiusImageWidth": radius / width if radius else None,
        "tipDripperDxRadii": (tip["x"] - dripper["centerX"]) / radius if radius else None,
        "tipDripperDyRadii": (tip["y"] - dripper["centerY"]) / radius if radius else None,
        "tipDripperDistanceRadii": math.hypot(tip["x"] - dripper["centerX"], tip["y"] - dripper["centerY"]) / radius if radius else None,
        "tipRelativeX": (tip["x"] - bbox["xMin"]) / box_width,
        "tipRelativeY": (tip["y"] - bbox["yMin"]) / box_height,
        "spoutLengthProxyPx": math.hypot(box_width, box_height),
        "spoutLengthProxyNorm": math.hypot(box_width, box_height) / math.hypot(width, height),
        "boundaryTouchCount": sum(touches.values()),
        "bboxTruncationProxy": sum(touches.values()) / 4,
        **touches,
    })
    return result


def prediction_diagnostics(
    image: np.ndarray,
    annotation: dict[str, Any],
    adapters: Any,
) -> dict[str, Any]:
    positive = bool(annotation["objects"])
    detector = adapters.detector(image)
    full = adapters.keypoint(image, None)
    presence = adapters.presence_classifier(image)
    bbox_valid = (
        detector["bbox"]["xMax"] - detector["bbox"]["xMin"] >= 2
        and detector["bbox"]["yMax"] - detector["bbox"]["yMin"] >= 2
    )
    padded = runner.expand_roi(detector["bbox"], image.shape[1], image.shape[0]) if bbox_valid else None
    roi_keypoint = adapters.keypoint(image, padded) if detector["accepted"] and padded is not None else None
    target = annotation["objects"][0]["spoutTip"] if positive else None
    gt_bbox = annotation["objects"][0]["bbox"] if positive else None
    radius = (annotation.get("dripper") or {}).get("effectiveRadius")
    full_error = runner.point_distance(full["point"], target) if positive and full["accepted"] else None
    roi_error = runner.point_distance(roi_keypoint["point"], target) if positive and roi_keypoint and roi_keypoint["accepted"] else None
    return {
        "detectorAccepted": detector["accepted"],
        "detectorConfidence": detector["confidence"],
        "detectorBbox": detector["bbox"],
        "detectorIoU": runner.baseline.bbox_iou(detector["bbox"], gt_bbox) if positive else None,
        "rawTipContained": runner.point_in_roi(target, detector["bbox"]) if positive and bbox_valid else False if positive else None,
        "paddedTipContained": runner.point_in_roi(target, padded) if positive and padded else False if positive else None,
        "paddedRoi": padded,
        "fullKeypointAccepted": full["accepted"],
        "fullKeypointConfidence": full["confidence"],
        "fullKeypointPoint": full["point"],
        "fullKeypointErrorPx": full_error,
        "fullKeypointNormalizedError": full_error / radius if full_error is not None and radius else None,
        "modeBKeypointAccepted": bool(roi_keypoint and roi_keypoint["accepted"]),
        "modeBKeypointConfidence": roi_keypoint["confidence"] if roi_keypoint else None,
        "modeBKeypointPoint": roi_keypoint["point"] if roi_keypoint else None,
        "modeBKeypointErrorPx": roi_error,
        "modeBKeypointNormalizedError": roi_error / radius if roi_error is not None and radius else None,
        "presenceProbability": presence["confidence"],
        "presencePredicted": presence["accepted"],
    }


def extract_embeddings(repo_root: Path, frames: list[dict[str, Any]], annotations: dict[str, dict[str, Any]]) -> tuple[np.ndarray, dict[str, Any]]:
    examples = []
    for frame in frames:
        if frame["sessionId"] not in SESSIONS:
            raise RuntimeError(f"Cross-session audit allowlist violation: {frame['sessionId']}")
        path = (repo_root / "data/vision" / frame["path"]).resolve()
        vision_root = (repo_root / "data/vision").resolve()
        if vision_root not in path.parents:
            raise RuntimeError(f"Cross-session audit path violation: {path}")
        with Image.open(path) as source:
            image = source.convert("RGB")
        tensor, geometry = runner.baseline.prepare_image(image, "identity")
        examples.append(runner.baseline.Example(
            frame,
            annotations[frame["frameId"]],
            tensor,
            geometry,
            float(bool(annotations[frame["frameId"]]["objects"])),
            (0.0, 0.0),
            (0.0, 0.0, 0.0, 0.0),
        ))
    backbone = runner.baseline.mobilenet_v3_small(
        weights=runner.baseline.MobileNet_V3_Small_Weights.IMAGENET1K_V1,
    ).features.eval()
    features = runner.baseline.extract_features(backbone, examples)
    embeddings = features.mean(dim=(2, 3)).numpy()
    centered = embeddings - embeddings.mean(axis=0, keepdims=True)
    _, singular, right = np.linalg.svd(centered, full_matrices=False)
    projection = centered @ right[:2].T
    variance = singular ** 2
    explained = variance[:2] / variance.sum()
    return projection, {
        "dimensions": int(embeddings.shape[1]),
        "norms": np.linalg.norm(embeddings, axis=1),
        "explainedVarianceRatio": [float(value) for value in explained],
        "definition": "audit-only PCA of centered frozen MobileNetV3-small global-average-pooled features; not used for training or threshold selection",
    }


def aggregate(records: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [item for item in records if item["positive"]]
    sessions: dict[str, Any] = {}
    for session in SESSIONS:
        rows = [item for item in positives if item["session"] == session]
        sessions[session] = {feature: distribution(item.get(feature) for item in rows) for feature in FEATURES}
        sessions[session]["positiveCount"] = len(rows)
        sessions[session]["boundaryTouchFrequency"] = statistics.fmean(item["boundaryTouchCount"] > 0 for item in rows)
        sessions[session]["topTouchFrequency"] = statistics.fmean(item["boundaryTouchTop"] for item in rows)
    development = [item for item in positives if item["session"] != "session-004"]
    heldout = [item for item in positives if item["session"] == "session-004"]
    comparisons = {}
    for feature in FEATURES:
        dev = [float(item[feature]) for item in development if item.get(feature) is not None]
        test = [float(item[feature]) for item in heldout if item.get(feature) is not None]
        dev_session_medians = [sessions[session][feature]["median"] for session in SESSIONS[:3] if sessions[session][feature]["median"] is not None]
        pooled_std = statistics.pstdev(dev) if len(dev) > 1 else 0.0
        comparisons[feature] = {
            "development": distribution(dev),
            "session004": distribution(test),
            "session004MedianOutsideDevelopmentPooledRange": bool(test) and statistics.median(test) < min(dev) or bool(test) and statistics.median(test) > max(dev),
            "session004MedianOutsideDevelopmentSessionMedianRange": bool(test) and statistics.median(test) < min(dev_session_medians) or bool(test) and statistics.median(test) > max(dev_session_medians),
            "standardizedMeanShift": (statistics.fmean(test) - statistics.fmean(dev)) / pooled_std if test and pooled_std > 1e-12 else None,
        }
    ranked = sorted(
        ({"feature": feature, **value} for feature, value in comparisons.items() if value["standardizedMeanShift"] is not None),
        key=lambda item: abs(item["standardizedMeanShift"]),
        reverse=True,
    )
    return {"sessions": sessions, "session004Comparisons": comparisons, "strongestStandardizedShifts": ranked}


def failure_associations(records: list[dict[str, Any]]) -> dict[str, Any]:
    heldout = [item for item in records if item["session"] == "session-004" and item["positive"]]
    features = [feature for feature in FEATURES if feature != "boundaryTouchCount"]
    detector_groups = {
        "accepted": [item for item in heldout if item["detectorAccepted"]],
        "rejected": [item for item in heldout if not item["detectorAccepted"]],
    }
    containment_groups = {
        "contained": [item for item in heldout if item["detectorAccepted"] and item["paddedTipContained"]],
        "notContained": [item for item in heldout if item["detectorAccepted"] and not item["paddedTipContained"]],
    }
    def group_summary(groups: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
        return {
            name: {"count": len(rows), **{feature: distribution(item.get(feature) for item in rows) for feature in features}}
            for name, rows in groups.items()
        }
    correlations = {
        feature: {
            "detectorConfidence": pearson((item.get(feature), item["detectorConfidence"]) for item in heldout),
            "detectorIoU": pearson((item.get(feature), item["detectorIoU"]) for item in heldout),
            "fullKeypointNormalizedError": pearson((item.get(feature), item["fullKeypointNormalizedError"]) for item in heldout),
            "presenceProbability": pearson((item.get(feature), item["presenceProbability"]) for item in heldout),
        }
        for feature in features
    }
    return {
        "session004PositiveFrames": [
            {key: item.get(key) for key in (
                "frameId", "timestampMs", "detectorAccepted", "detectorConfidence", "detectorIoU",
                "rawTipContained", "paddedTipContained", "fullKeypointNormalizedError",
                "modeBKeypointNormalizedError", "presenceProbability",
            )}
            for item in heldout
        ],
        "detectorGroups": group_summary(detector_groups),
        "containmentGroups": group_summary(containment_groups),
        "correlations": correlations,
        "caution": "descriptive associations only; n=14 held-out positives and correlated features do not establish causality",
    }


def keypoint_audit(records: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [item for item in records if item["positive"]]
    by_session = {}
    for session in SESSIONS:
        rows = [item for item in positives if item["session"] == session]
        located = [item for item in rows if item["fullKeypointNormalizedError"] is not None]
        by_session[session] = {
            "positives": len(rows),
            "located": len(located),
            "missRate": (len(rows) - len(located)) / len(rows),
            "pixelError": distribution(item["fullKeypointErrorPx"] for item in located),
            "normalizedError": distribution(item["fullKeypointNormalizedError"] for item in located),
        }
    correlations = {
        feature: pearson((item.get(feature), item["fullKeypointNormalizedError"]) for item in positives)
        for feature in (
            "tipEdgeDistanceNorm", "bboxAreaFraction", "boundaryTouchCount", "meanLuminance",
            "luminanceStd", "localContrast", "highlightFraction", "darkFraction",
        )
    }
    return {"sessions": by_session, "allPositiveCorrelations": correlations}


def render_contact_sheet(
    name: str,
    rows: list[dict[str, Any]],
    repo_root: Path,
    output_dir: Path,
) -> str:
    output_dir.mkdir(parents=True, exist_ok=True)
    thumbs = []
    for item in rows:
        image = cv2.imread(str(repo_root / "data/vision" / item["path"]), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"Could not render {item['frameId']}")
        canvas = cv2.resize(image, (270, 480), interpolation=cv2.INTER_AREA)
        sx, sy = 270 / image.shape[1], 480 / image.shape[0]
        def point(value: dict[str, float]) -> tuple[int, int]:
            return round(value["x"] * sx), round(value["y"] * sy)
        def rectangle(value: dict[str, float], color: tuple[int, int, int]) -> None:
            cv2.rectangle(canvas, point({"x": value["xMin"], "y": value["yMin"]}), point({"x": value["xMax"], "y": value["yMax"]}), color, 2)
        if item["positive"]:
            rectangle(item["gtBbox"], (0, 255, 0))
            cv2.circle(canvas, point(item["gtTip"]), 5, (0, 255, 0), -1)
        if item["detectorAccepted"]:
            rectangle(item["detectorBbox"], (0, 255, 255))
        if item["fullKeypointAccepted"]:
            cv2.circle(canvas, point(item["fullKeypointPoint"]), 5, (255, 255, 0), -1)
        labels = [
            item["frameId"],
            f"det={item['detectorConfidence']:.3f} IoU={item['detectorIoU'] if item['detectorIoU'] is not None else '-'}",
            f"Aerr={item['fullKeypointNormalizedError'] if item['fullKeypointNormalizedError'] is not None else '-'} pres={item['presenceProbability']:.3f}",
        ]
        for index, label in enumerate(labels):
            cv2.putText(canvas, str(label)[:70], (4, 18 + index * 19), cv2.FONT_HERSHEY_SIMPLEX, 0.39, (0, 0, 0), 3, cv2.LINE_AA)
            cv2.putText(canvas, str(label)[:70], (4, 18 + index * 19), cv2.FONT_HERSHEY_SIMPLEX, 0.39, (255, 255, 255), 1, cv2.LINE_AA)
        thumbs.append(canvas)
    columns = 5
    grid_rows = max(1, math.ceil(len(thumbs) / columns))
    sheet = np.zeros((grid_rows * 480, columns * 270, 3), dtype=np.uint8)
    for index, thumb in enumerate(thumbs):
        row, column = divmod(index, columns)
        sheet[row * 480:(row + 1) * 480, column * 270:(column + 1) * 270] = thumb
    path = output_dir / f"{name}.jpg"
    cv2.imwrite(str(path), sheet)
    return str(path)


def render_pca(records: list[dict[str, Any]], output_dir: Path) -> str:
    canvas = np.full((800, 1200, 3), 255, dtype=np.uint8)
    xs = np.asarray([item["pcaX"] for item in records])
    ys = np.asarray([item["pcaY"] for item in records])
    x0, x1 = float(xs.min()), float(xs.max())
    y0, y1 = float(ys.min()), float(ys.max())
    for item in records:
        x = 80 + round((item["pcaX"] - x0) / max(1e-9, x1 - x0) * 1040)
        y = 720 - round((item["pcaY"] - y0) / max(1e-9, y1 - y0) * 640)
        color = COLORS[item["session"]]
        cv2.circle(canvas, (x, y), 6, color, -1 if item["positive"] else 2)
    cv2.rectangle(canvas, (80, 80), (1120, 720), (40, 40, 40), 1)
    cv2.putText(canvas, "Frozen presence-backbone feature PCA (filled=positive, ring=negative)", (80, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (20, 20, 20), 2, cv2.LINE_AA)
    for index, session in enumerate(SESSIONS):
        cv2.circle(canvas, (850, 105 + index * 30), 7, COLORS[session], -1)
        cv2.putText(canvas, session, (870, 112 + index * 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1, cv2.LINE_AA)
    path = output_dir / "presence-feature-pca.jpg"
    cv2.imwrite(str(path), canvas)
    return str(path)


def write_csv(records: list[dict[str, Any]], path: Path) -> None:
    excluded = {"detectorBbox", "paddedRoi", "fullKeypointPoint", "modeBKeypointPoint", "gtBbox", "gtTip"}
    keys = sorted({key for item in records for key, value in item.items() if key not in excluded and not isinstance(value, (dict, list))})
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows({key: item.get(key) for key in keys} for item in records)


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = runner.baseline.require_d_drive(args.work_root)
    frames, annotations, manifest_path, annotation_path = load_dataset(repo_root)
    heldout_path = work_root / "runs/task-9c5-session004-heldout/results.json"
    if not heldout_path.exists():
        raise RuntimeError("Task 9C-5 held-out result is required")
    runner.baseline.torch.hub.set_dir(str(work_root / "cache/torch/hub"))
    adapters = runner.ModelAdapters(work_root)
    first = cv2.imread(str(repo_root / "data/vision" / frames[0]["path"]), cv2.IMREAD_COLOR)
    if first is None:
        raise RuntimeError("Could not read warm-up frame")
    adapters.warmup(first)
    projection, embedding = extract_embeddings(repo_root, frames, annotations)
    records = []
    for index, frame in enumerate(frames):
        annotation = annotations[frame["frameId"]]
        path = repo_root / "data/vision" / frame["path"]
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"Could not read {path}")
        gt_bbox = annotation["objects"][0]["bbox"] if annotation["objects"] else None
        record = {
            "frameId": frame["frameId"], "session": frame["sessionId"], "timestampMs": frame["timestampMs"],
            "split": frame["split"], "positive": bool(annotation["objects"]), "path": frame["path"],
            "gtBbox": gt_bbox,
            "gtTip": annotation["objects"][0]["spoutTip"] if annotation["objects"] else None,
            **geometry_diagnostics(frame, annotation),
            **image_diagnostics(image, gt_bbox),
            **prediction_diagnostics(image, annotation, adapters),
            "embeddingNorm": float(embedding["norms"][index]),
            "pcaX": float(projection[index, 0]), "pcaY": float(projection[index, 1]),
        }
        records.append(record)

    aggregates = aggregate(records)
    presence = {}
    for session in SESSIONS:
        session_rows = [item for item in records if item["session"] == session]
        positive = [item["presenceProbability"] for item in session_rows if item["positive"]]
        negative = [item["presenceProbability"] for item in session_rows if not item["positive"]]
        presence[session] = {
            "positiveProbability": distribution(positive),
            "negativeProbability": distribution(negative),
            "positiveRecall": sum(value >= runner.PRESENCE_CLASSIFIER_THRESHOLD for value in positive) / len(positive),
            "negativeSpecificity": sum(value < runner.PRESENCE_CLASSIFIER_THRESHOLD for value in negative) / len(negative),
            "positiveEmbeddingNorm": distribution(item["embeddingNorm"] for item in session_rows if item["positive"]),
            "negativeEmbeddingNorm": distribution(item["embeddingNorm"] for item in session_rows if not item["positive"]),
        }
    dev_negative = [item["presenceProbability"] for item in records if item["session"] != "session-004" and not item["positive"]]
    test_positive = [item["presenceProbability"] for item in records if item["session"] == "session-004" and item["positive"]]
    presence["session004PositiveVsDevelopmentNegative"] = {
        "developmentNegative": distribution(dev_negative),
        "session004Positive": distribution(test_positive),
        "session004PositiveMeanBelowDevelopmentNegativeMean": statistics.fmean(test_positive) < statistics.fmean(dev_negative),
    }
    output_dir = work_root / "eval/task-9c5-1"
    output_dir.mkdir(parents=True, exist_ok=True)
    representative = []
    for session in SESSIONS[:3]:
        rows = [item for item in records if item["session"] == session and item["positive"]]
        representative.extend(rows[index] for index in sorted(set((0, len(rows) // 3, 2 * len(rows) // 3, len(rows) - 1))))
    heldout_positive = [item for item in records if item["session"] == "session-004" and item["positive"]]
    located = [item for item in records if item["positive"] and item["fullKeypointNormalizedError"] is not None]
    contact_sheets = {
        "developmentRepresentativePositives": render_contact_sheet("01-development-representative-positives", representative, repo_root, output_dir),
        "allSession004Positives": render_contact_sheet("02-session004-all-positives", heldout_positive, repo_root, output_dir),
        "session004DetectorFailures": render_contact_sheet("03-session004-detector-failures", [item for item in heldout_positive if not item["detectorAccepted"]], repo_root, output_dir),
        "session004AcceptedTipNotContained": render_contact_sheet("04-session004-accepted-tip-not-contained", [item for item in heldout_positive if item["detectorAccepted"] and not item["paddedTipContained"]], repo_root, output_dir),
        "highestFullFrameErrors": render_contact_sheet("05-highest-full-frame-errors", sorted(located, key=lambda item: item["fullKeypointNormalizedError"], reverse=True)[:12], repo_root, output_dir),
        "lowestFullFrameErrors": render_contact_sheet("06-lowest-full-frame-errors", sorted(located, key=lambda item: item["fullKeypointNormalizedError"])[:12], repo_root, output_dir),
        "presenceFeaturePca": render_pca(records, output_dir),
    }
    csv_path = output_dir / "cross-session-frame-audit.csv"
    write_csv(records, csv_path)
    result = {
        "status": "complete",
        "scope": {
            "sessions": SESSIONS, "frames": len(records), "positives": sum(item["positive"] for item in records),
            "trainingPerformed": False, "thresholdsChanged": False, "annotationsModified": False,
            "externalBenchmarkAccessed": False, "productionRuntimeModified": False,
            "session004FutureStatus": "development/analysis only if reused; a new unseen first-party session is required for final evaluation",
        },
        "dataset": {
            "manifest": str(manifest_path), "manifestSha256": runner.sha256_file(manifest_path),
            "annotations": str(annotation_path), "annotationsSha256": runner.sha256_file(annotation_path),
            "heldoutResult": str(heldout_path), "heldoutResultSha256": runner.sha256_file(heldout_path),
        },
        "models": {name: {"path": str(path), "sha256": runner.sha256_file(path)} for name, path in adapters.paths.items()},
        "frameRecords": records,
        "sessionDistributions": aggregates,
        "failureAssociations": failure_associations(records),
        "presenceAudit": {"sessions": presence, "embedding": {key: value for key, value in embedding.items() if key != "norms"}},
        "fullFrameKeypointAudit": keypoint_audit(records),
        "contactSheets": contact_sheets,
        "csv": str(csv_path),
        "sourceCommit": runner.safe_git_head(repo_root),
    }
    results_path = output_dir / "cross-session-domain-shift.json"
    results_path.write_text(json.dumps(result, indent=2, default=runner.json_default), encoding="utf-8")
    print(json.dumps({
        "status": "complete", "results": str(results_path), "csv": str(csv_path),
        "strongestShifts": aggregates["strongestStandardizedShifts"][:8],
        "presence": presence, "fullFrameKeypoint": result["fullFrameKeypointAudit"],
        "contactSheets": contact_sheets,
    }, indent=2, default=runner.json_default))


if __name__ == "__main__":
    main()
