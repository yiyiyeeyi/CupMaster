#!/usr/bin/env python3
"""Task 9C-5.5 manual-dripper-ROI semantic localization experiment."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import random
import sys
import time
from pathlib import Path
from typing import Any, Iterable

import onnx
import torch
from PIL import Image
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small


SEED = 20260928
SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13))
CONFIDENCE_THRESHOLD = 0.50
LOCAL_ROI_SEARCH_WIDTH_FRACTION = 0.65
TRANSLATION_JITTER = 0.30
SCALE_JITTER = (0.85, 1.15)
SEARCH_PRESETS = {
    "balanced": {"left": 1.5, "right": 1.5, "top": 2.0, "bottom": 0.75},
    "wide_entry": {"left": 2.0, "right": 2.0, "top": 2.5, "bottom": 1.0},
}
PRIMARY_PRESET = "balanced"
GATE_LIMITS = {
    "minimumSearchContainment": 0.95,
    "maximumExcessiveClippingRate": 0.20,
    "minimumRefinedLocateRate": 0.70,
    "maximumNormalizedMedian": 0.25,
    "maximumNormalizedP90": 0.60,
    "maximumNegativeFpr": 0.10,
    "minimumPresenceRecall": 0.70,
    "minimumPresenceSpecificity": 0.90,
    "minimumFailingSessionLocateGain": 0.20,
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


def effective_radius(dripper: dict[str, Any]) -> float:
    radius_x = float(dripper["radiusX"])
    radius_y = float(dripper["radiusY"])
    if not math.isfinite(radius_x) or not math.isfinite(radius_y) or radius_x <= 0 or radius_y <= 0:
        raise ValueError("Invalid manual dripper radii")
    return math.sqrt(radius_x * radius_y)


def search_region(annotation: dict[str, Any], frame: dict[str, Any], preset_name: str) -> dict[str, Any]:
    dripper = annotation.get("dripper")
    if not dripper:
        raise ValueError(f"Missing manual calibration for {frame['frameId']}")
    preset = SEARCH_PRESETS[preset_name]
    radius = effective_radius(dripper)
    left = dripper["centerX"] - dripper["radiusX"] - preset["left"] * radius
    right = dripper["centerX"] + dripper["radiusX"] + preset["right"] * radius
    top = dripper["centerY"] - dripper["radiusY"] - preset["top"] * radius
    bottom = dripper["centerY"] + dripper["radiusY"] + preset["bottom"] * radius
    unclipped_area = max(0.0, right - left) * max(0.0, bottom - top)
    x_min = max(0.0, left)
    y_min = max(0.0, top)
    x_max = min(float(frame["width"]), right)
    y_max = min(float(frame["height"]), bottom)
    clipped_area = max(0.0, x_max - x_min) * max(0.0, y_max - y_min)
    if clipped_area <= 0:
        raise ValueError(f"Empty search region for {frame['frameId']}")
    return {
        "xMin": x_min, "yMin": y_min, "xMax": x_max, "yMax": y_max,
        "unclipped": {"xMin": left, "yMin": top, "xMax": right, "yMax": bottom},
        "retainedAreaRatio": clipped_area / unclipped_area,
    }


def contains(point: dict[str, float], bounds: dict[str, float]) -> bool:
    return bounds["xMin"] <= point["x"] <= bounds["xMax"] and bounds["yMin"] <= point["y"] <= bounds["yMax"]


def geometry_metrics(
    frames: list[dict[str, Any]], annotations: dict[str, dict[str, Any]], baseline: Any,
) -> dict[str, Any]:
    output = {}
    for preset_name in SEARCH_PRESETS:
        by_session = {}
        for session in SESSIONS:
            session_frames = [frame for frame in frames if frame["sessionId"] == session]
            eligible = [frame for frame in session_frames if annotations[frame["frameId"]].get("dripper")]
            positives = [frame for frame in eligible if annotations[frame["frameId"]]["objects"]]
            regions = [(frame, search_region(annotations[frame["frameId"]], frame, preset_name)) for frame in eligible]
            retained = [region["retainedAreaRatio"] for _, region in regions]
            contained = sum(
                contains(annotations[frame["frameId"]]["objects"][0]["spoutTip"], region)
                for frame, region in regions if annotations[frame["frameId"]]["objects"]
            )
            by_session[session] = {
                "totalFrames": len(session_frames),
                "calibrationEligible": len(eligible),
                "missingCalibration": len(session_frames) - len(eligible),
                "positiveCount": len(positives),
                "tipContainmentRate": contained / len(positives),
                "retainedAreaRatio": baseline.distribution(retained),
                "excessiveClippingRate": sum(value < 0.8 for value in retained) / len(retained),
            }
        output[preset_name] = by_session
    return output


def crop_tuple(region: dict[str, float]) -> tuple[float, float, float, float]:
    return region["xMin"], region["yMin"], region["xMax"], region["yMax"]


def manual_examples(
    baseline: Any,
    experiment: Any,
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    augmentations: Iterable[str],
    preset_name: str,
) -> list[Any]:
    examples = []
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        image = experiment.open_image(repo_root, frame)
        region = search_region(annotation, frame, preset_name)
        for augmentation in augmentations:
            tensor, geometry = baseline.prepare_image(image, augmentation, crop_tuple(region))
            examples.append(experiment.make_example(baseline, frame, annotation, tensor, geometry))
    return examples


def bounded_square(
    center: tuple[float, float], side: float, bounds: dict[str, float],
) -> dict[str, float]:
    if not math.isfinite(side) or side <= 0:
        raise ValueError("Local ROI side must be positive")
    center_x = min(max(center[0], bounds["xMin"]), bounds["xMax"])
    center_y = min(max(center[1], bounds["yMin"]), bounds["yMax"])
    half = side / 2
    return {
        "xMin": max(bounds["xMin"], center_x - half),
        "yMin": max(bounds["yMin"], center_y - half),
        "xMax": min(bounds["xMax"], center_x + half),
        "yMax": min(bounds["yMax"], center_y + half),
    }


def local_training_examples(
    baseline: Any,
    experiment: Any,
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    coarse_by_id: dict[str, dict[str, Any]],
    preset_name: str,
    seed: int,
) -> list[Any]:
    rng = random.Random(seed)
    examples = []
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        image = experiment.open_image(repo_root, frame)
        search = search_region(annotation, frame, preset_name)
        search_width = search["xMax"] - search["xMin"]
        positive = bool(annotation["objects"])
        for augmentation in baseline.AUGMENTATIONS:
            scale = rng.uniform(*SCALE_JITTER) if positive else 1.0
            side = search_width * LOCAL_ROI_SEARCH_WIDTH_FRACTION * scale
            if positive:
                tip = annotation["objects"][0]["spoutTip"]
                dx = rng.uniform(-TRANSLATION_JITTER, TRANSLATION_JITTER) * side
                dy = rng.uniform(-TRANSLATION_JITTER, TRANSLATION_JITTER) * side
                center = (tip["x"] + dx, tip["y"] + dy)
            else:
                point = coarse_by_id[frame["frameId"]]["point"]
                center = (point["x"], point["y"])
            roi = bounded_square(center, side, search)
            if positive and not contains(tip, roi):
                raise RuntimeError(f"Positive local jitter excluded target {frame['frameId']}")
            tensor, geometry = baseline.prepare_image(image, augmentation, crop_tuple(roi))
            examples.append(experiment.make_example(baseline, frame, annotation, tensor, geometry))
    return examples


def local_evaluation_examples(
    baseline: Any,
    experiment: Any,
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    coarse_by_id: dict[str, dict[str, Any]],
    preset_name: str,
) -> tuple[list[Any], dict[str, dict[str, float]]]:
    examples = []
    rois = {}
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        image = experiment.open_image(repo_root, frame)
        search = search_region(annotation, frame, preset_name)
        point = coarse_by_id[frame["frameId"]]["point"]
        side = (search["xMax"] - search["xMin"]) * LOCAL_ROI_SEARCH_WIDTH_FRACTION
        roi = bounded_square((point["x"], point["y"]), side, search)
        tensor, geometry = baseline.prepare_image(image, "identity", crop_tuple(roi))
        examples.append(experiment.make_example(baseline, frame, annotation, tensor, geometry))
        rois[frame["frameId"]] = roi
    return examples, rois


def evaluate_gate(
    folds: dict[str, Any], geometry: dict[str, Any], previous: dict[str, Any],
) -> dict[str, Any]:
    failures = []
    for session in SESSIONS:
        metrics = folds[session]["manualRoiRefined"]
        presence = folds[session]["presence"]["jointConfidenceRule"]
        geo = geometry[PRIMARY_PRESET][session]
        checks = (
            (geo["tipContainmentRate"] >= GATE_LIMITS["minimumSearchContainment"], "search containment"),
            (geo["excessiveClippingRate"] <= GATE_LIMITS["maximumExcessiveClippingRate"], "search clipping"),
            (metrics["positiveLocateRate"] >= GATE_LIMITS["minimumRefinedLocateRate"], "refined locate"),
            (metrics["normalizedError"]["median"] is not None and metrics["normalizedError"]["median"] <= GATE_LIMITS["maximumNormalizedMedian"], "normalized median"),
            (metrics["normalizedError"]["p90"] is not None and metrics["normalizedError"]["p90"] <= GATE_LIMITS["maximumNormalizedP90"], "normalized P90"),
            (metrics["negativeFalsePositiveRate"] <= GATE_LIMITS["maximumNegativeFpr"], "negative FPR"),
            (presence["positiveRecall"] >= GATE_LIMITS["minimumPresenceRecall"], "presence recall"),
            (presence["negativeSpecificity"] >= GATE_LIMITS["minimumPresenceSpecificity"], "presence specificity"),
        )
        failures.extend(f"{session}: {name}" for passed, name in checks if not passed)
        if session in {"session-011", "session-012", "session-013"}:
            old_locate = previous["folds"][session]["globalToLocal"]["positiveLocateRate"]
            gain = metrics["positiveLocateRate"] - old_locate
            if gain < GATE_LIMITS["minimumFailingSessionLocateGain"]:
                failures.append(f"{session}: locate gain {gain:.3f} below material-improvement gate")
    return {"passed": not failures, "limits": GATE_LIMITS, "failures": failures}


def failure_classification(
    folds: dict[str, Any], geometry: dict[str, Any], gate: dict[str, Any],
) -> dict[str, Any]:
    output = {}
    for session in SESSIONS:
        geo = geometry[PRIMARY_PRESET][session]
        coarse = folds[session]["manualRoiCoarse"]
        refined = folds[session]["manualRoiRefined"]
        categories = []
        if geo["tipContainmentRate"] < 0.95:
            categories.append("search region excludes tip")
        if coarse["positiveLocateRate"] < 0.70:
            categories.append("coarse semantic miss")
        if refined["roiContainmentRate"] < 0.95:
            categories.append("coarse localization too inaccurate for local refinement")
        if refined["roiContainmentRate"] >= 0.95 and refined["positiveLocateRate"] < 0.70:
            categories.append("local refinement failure despite containment")
        if refined["negativeFalsePositiveRate"] > 0.10:
            categories.append("false presence on negative")
        output[session] = {
            "gatePassed": not any(failure.startswith(f"{session}:") for failure in gate["failures"]),
            "geometryOrSemantic": "geometry" if categories == ["search region excludes tip"] else "mixed" if "search region excludes tip" in categories else "semantic",
            "categories": categories or ["none at aggregate metric level; inspect per-frame predictions"],
        }
    return output


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    baseline = load_module(repo_root / "scripts/vision/task9c2-baseline.py", "task9c2_baseline_955")
    experiment = load_module(repo_root / "scripts/vision/task9c5-2-global-local-keypoint.py", "task9c5_2_reused_955")
    data_module = load_module(repo_root / "scripts/vision/task9c5-3-targeted-retraining.py", "task9c5_3_data_955")
    baseline.set_determinism()
    torch.hub.set_dir(str(work_root / "cache/torch/hub"))
    frames, annotations = data_module.load_records(repo_root, work_root)
    experiment.SESSIONS = SESSIONS
    experiment.CONFIDENCE_THRESHOLD = CONFIDENCE_THRESHOLD
    experiment.open_image = lambda root, frame: data_module.open_development_image(root, work_root, frame)
    eligible_frames = [frame for frame in frames if annotations[frame["frameId"]].get("dripper")]
    if any(annotations[frame["frameId"]]["objects"] and not annotations[frame["frameId"]].get("dripper") for frame in frames):
        raise RuntimeError("A positive frame is missing manual calibration")

    run_dir = work_root / "runs/task-9c5-5"
    checkpoint_dir = work_root / "checkpoints/task-9c5-5"
    export_dir = work_root / "exports/onnx/task-9c5-5"
    run_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    geometry = geometry_metrics(frames, annotations, baseline)
    previous = json.loads((work_root / "runs/task-9c5-3-targeted-retraining/results.json").read_text(encoding="utf-8"))

    backbone = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1).features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)
    folds = {}
    all_records = []
    started = time.time()
    for fold_index, heldout in enumerate(SESSIONS):
        train_frames = [frame for frame in eligible_frames if frame["sessionId"] != heldout]
        test_frames = [frame for frame in eligible_frames if frame["sessionId"] == heldout]
        seed = SEED + fold_index * 100
        coarse_train = manual_examples(baseline, experiment, repo_root, train_frames, annotations, baseline.AUGMENTATIONS, PRIMARY_PRESET)
        coarse_test = manual_examples(baseline, experiment, repo_root, test_frames, annotations, ("identity",), PRIMARY_PRESET)
        coarse_features = baseline.extract_features(backbone, coarse_train)
        coarse_head, coarse_training = experiment.train_fixed_head(
            baseline, f"{heldout}-manual-coarse", coarse_features, coarse_train, args.epochs,
            checkpoint_dir / "loso" / heldout / "manual-coarse.head.pt", seed,
        )
        coarse_metrics, coarse_predictions, _ = experiment.identity_predictions(baseline, backbone, coarse_head, coarse_test)
        coarse_by_id = {item["frameId"]: item for item in coarse_predictions}

        train_identity = manual_examples(baseline, experiment, repo_root, train_frames, annotations, ("identity",), PRIMARY_PRESET)
        _, train_coarse_predictions, _ = experiment.identity_predictions(baseline, backbone, coarse_head, train_identity)
        local_train = local_training_examples(
            baseline, experiment, repo_root, train_frames, annotations,
            {item["frameId"]: item for item in train_coarse_predictions}, PRIMARY_PRESET, seed + 1,
        )
        local_features = baseline.extract_features(backbone, local_train)
        local_head, local_training = experiment.train_fixed_head(
            baseline, f"{heldout}-manual-local", local_features, local_train, args.epochs,
            checkpoint_dir / "loso" / heldout / "manual-local.head.pt", seed + 1,
        )
        local_test, rois = local_evaluation_examples(
            baseline, experiment, repo_root, test_frames, annotations, coarse_by_id, PRIMARY_PRESET,
        )
        _, local_predictions, _ = experiment.identity_predictions(baseline, backbone, local_head, local_test)
        refined, records = experiment.summarize_candidate(
            baseline, test_frames, annotations, coarse_by_id, local_predictions, rois,
        )
        folds[heldout] = {
            "heldoutSession": heldout,
            "trainSessions": [session for session in SESSIONS if session != heldout],
            "counts": {
                "total": len(test_frames),
                "positive": sum(bool(annotations[frame["frameId"]]["objects"]) for frame in test_frames),
                "negative": sum(not annotations[frame["frameId"]]["objects"] for frame in test_frames),
            },
            "fullFrameBaseline": {
                "global": previous["folds"][heldout]["global"],
                "globalToLocal": previous["folds"][heldout]["globalToLocal"],
            },
            "manualRoiCoarse": experiment.summarize_global(coarse_metrics, test_frames, annotations),
            "manualRoiRefined": refined,
            "presence": data_module.presence_summary(records, baseline),
            "training": {"coarse": coarse_training, "local": local_training},
        }
        all_records.extend(records)
        print(f"completed {heldout} fold", flush=True)

    gate = evaluate_gate(folds, geometry, previous)
    failures = failure_classification(folds, geometry, gate)
    onnx_result = {"exported": False, "reason": "cross-session semantic gate failed", "models": {}}
    selected_training = None
    if gate["passed"]:
        all_coarse = manual_examples(baseline, experiment, repo_root, eligible_frames, annotations, baseline.AUGMENTATIONS, PRIMARY_PRESET)
        coarse_features = baseline.extract_features(backbone, all_coarse)
        coarse_head, coarse_training = experiment.train_fixed_head(
            baseline, "all-development-manual-coarse", coarse_features, all_coarse, args.epochs,
            checkpoint_dir / "selected" / "manual-coarse.head.pt", SEED + 1000,
        )
        all_identity = manual_examples(baseline, experiment, repo_root, eligible_frames, annotations, ("identity",), PRIMARY_PRESET)
        _, coarse_predictions, _ = experiment.identity_predictions(baseline, backbone, coarse_head, all_identity)
        local_train = local_training_examples(
            baseline, experiment, repo_root, eligible_frames, annotations,
            {item["frameId"]: item for item in coarse_predictions}, PRIMARY_PRESET, SEED + 1001,
        )
        local_features = baseline.extract_features(backbone, local_train)
        local_head, local_training = experiment.train_fixed_head(
            baseline, "all-development-manual-local", local_features, local_train, args.epochs,
            checkpoint_dir / "selected" / "manual-local.head.pt", SEED + 1001,
        )
        export_dir.mkdir(parents=True, exist_ok=True)
        coarse_onnx = baseline.export_and_compare("manual-search-coarse", backbone, coarse_head, all_identity[0].tensor, export_dir)
        local_onnx = baseline.export_and_compare("manual-search-local", backbone, local_head, local_train[0].tensor, export_dir)
        for result in (coarse_onnx, local_onnx):
            onnx.checker.check_model(onnx.load(result["path"]))
            result["checkerPassed"] = True
            result["parityPassed"] = result["maxAbsoluteDifference"] <= 1e-5
        onnx_result = {"exported": True, "models": {"coarse": coarse_onnx, "local": local_onnx}}
        selected_training = {"coarse": coarse_training, "local": local_training}

    results = {
        "status": "complete",
        "protocol": {
            "sessions": SESSIONS,
            "totalFrames": len(frames),
            "calibrationEligibleFrames": len(eligible_frames),
            "excludedMissingCalibration": len(frames) - len(eligible_frames),
            "method": "seven-fold leave-one-session-out",
            "primarySearchPreset": PRIMARY_PRESET,
            "searchPresets": SEARCH_PRESETS,
            "localRoiFractionOfClippedSearchWidth": LOCAL_ROI_SEARCH_WIDTH_FRACTION,
            "confidenceThreshold": CONFIDENCE_THRESHOLD,
            "epochs": args.epochs,
            "session014Accessed": False,
            "externalBenchmarkAccessed": False,
        },
        "searchGeometry": geometry,
        "folds": folds,
        "pooledPresence": data_module.presence_summary(all_records, baseline),
        "gate": gate,
        "failureClassification": failures,
        "primaryBottleneck": "geometry" if any(item["geometryOrSemantic"] == "geometry" for item in failures.values()) else "mixed" if any(item["geometryOrSemantic"] == "mixed" for item in failures.values()) else "semantics",
        "catastrophicCollapse": not gate["passed"],
        "selectedTraining": selected_training,
        "onnx": onnx_result,
        "elapsedSeconds": time.time() - started,
    }
    (run_dir / "results.json").write_text(json.dumps(results, indent=2, default=float), encoding="utf-8")
    (run_dir / "predictions.json").write_text(json.dumps(all_records, indent=2, default=float), encoding="utf-8")
    print(json.dumps({"results": str(run_dir / "results.json"), "gate": gate, "onnx": onnx_result}, indent=2))


if __name__ == "__main__":
    main()

