#!/usr/bin/env python3
"""Task 9C-5.6 spout structure: tip-only vs neck-first vs joint neck+tip."""

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
from typing import Any, Callable

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from torch.utils.data import DataLoader, TensorDataset
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small


SEED = 20260928
SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13))
CONFIDENCE_THRESHOLD = 0.50
BBOX_TIP_ROI_PADDING = 0.30
CONSISTENCY_PADDING = 0.10
PRIMARY_PRESET = "balanced"
GATE_LIMITS = {
    "minimumPreviouslyFailingLocate": 0.50,
    "minimumSession013Locate": 0.50,
    "minimumFprReduction011": 0.15,
    "minimumFprReduction012": 0.15,
    "minimumPresenceRecall": 0.50,
    "minimumPresenceSpecificity": 0.80,
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


def pad_bbox(bbox: dict[str, float], padding: float, bounds: dict[str, float]) -> dict[str, float]:
    width = bbox["xMax"] - bbox["xMin"]
    height = bbox["yMax"] - bbox["yMin"]
    return {
        "xMin": max(bounds["xMin"], bbox["xMin"] - width * padding),
        "yMin": max(bounds["yMin"], bbox["yMin"] - height * padding),
        "xMax": min(bounds["xMax"], bbox["xMax"] + width * padding),
        "yMax": min(bounds["yMax"], bbox["yMax"] + height * padding),
    }


def fallback_roi(bounds: dict[str, float]) -> dict[str, float]:
    width = bounds["xMax"] - bounds["xMin"]
    height = bounds["yMax"] - bounds["yMin"]
    side = max(2.0, min(width, height) * 0.5)
    center = ((bounds["xMin"] + bounds["xMax"]) / 2, (bounds["yMin"] + bounds["yMax"]) / 2)
    return {
        "xMin": max(bounds["xMin"], center[0] - side / 2),
        "yMin": max(bounds["yMin"], center[1] - side / 2),
        "xMax": min(bounds["xMax"], center[0] + side / 2),
        "yMax": min(bounds["yMax"], center[1] + side / 2),
    }


def structure_annotation(
    annotation: dict[str, Any], search: dict[str, float],
) -> dict[str, Any]:
    cloned = copy.deepcopy(annotation)
    if cloned["objects"]:
        clipped = intersect_bbox(cloned["objects"][0]["bbox"], search)
        if not valid_bbox(clipped):
            raise RuntimeError("Positive annotated bbox has no usable intersection with manual search region")
        cloned["objects"][0]["bbox"] = clipped
    return cloned


def structure_examples(
    baseline: Any,
    manual: Any,
    experiment: Any,
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    augmentations: tuple[str, ...],
) -> list[Any]:
    examples = []
    for frame in frames:
        original = annotations[frame["frameId"]]
        search = manual.search_region(original, frame, PRIMARY_PRESET)
        annotation = structure_annotation(original, search)
        image = experiment.open_image(repo_root, frame)
        for augmentation in augmentations:
            tensor, geometry = baseline.prepare_image(image, augmentation, manual.crop_tuple(search))
            positive = bool(annotation["objects"])
            obj = annotation["objects"][0] if positive else None
            examples.append(baseline.Example(
                frame=frame,
                annotation=annotation,
                tensor=tensor,
                geometry=geometry,
                presence=float(positive),
                point_target=baseline.point_to_input(obj["spoutTip"], geometry) if obj else (0.0, 0.0),
                bbox_target=baseline.bbox_to_input(obj["bbox"], geometry) if obj else (0.0, 0.0, 0.0, 0.0),
            ))
    return examples


def train_fixed(
    baseline: Any,
    features: torch.Tensor,
    examples: list[Any],
    coordinate_count: int,
    targets: torch.Tensor,
    loss_function: Callable[[torch.Tensor, torch.Tensor, torch.Tensor], torch.Tensor],
    epochs: int,
    destination: Path,
    seed: int,
) -> tuple[nn.Module, dict[str, Any]]:
    presence = torch.tensor([example.presence for example in examples], dtype=torch.float32)
    torch.manual_seed(seed)
    head = baseline.SpatialHead(features.shape[1], coordinate_count)
    optimizer = torch.optim.AdamW(head.parameters(), lr=3e-3, weight_decay=1e-4)
    generator = torch.Generator().manual_seed(seed)
    loader = DataLoader(TensorDataset(features, presence, targets), batch_size=16, shuffle=True, generator=generator)
    history = []
    for epoch in range(1, epochs + 1):
        head.train()
        losses = []
        for batch_features, batch_presence, batch_targets in loader:
            optimizer.zero_grad(set_to_none=True)
            loss = loss_function(head(batch_features), batch_presence, batch_targets)
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


def detector_loss(raw: torch.Tensor, presence: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
    confidence = F.binary_cross_entropy_with_logits(raw[:, 0], presence)
    positive = presence > 0.5
    coordinates = F.smooth_l1_loss(torch.sigmoid(raw[positive, 1:5]), targets[positive]) if positive.any() else raw.sum() * 0
    return confidence + 5.0 * coordinates


def joint_loss(raw: torch.Tensor, presence: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
    confidence = F.binary_cross_entropy_with_logits(raw[:, 0], presence)
    positive = presence > 0.5
    if not positive.any():
        return confidence + raw.sum() * 0
    predicted = torch.sigmoid(raw[positive, 1:])
    bbox = F.smooth_l1_loss(predicted[:, :4], targets[positive, :4])
    tip = F.smooth_l1_loss(predicted[:, 4:6], targets[positive, 4:6])
    return confidence + 5.0 * bbox + 5.0 * tip


def predict(baseline: Any, head: nn.Module, features: torch.Tensor) -> np.ndarray:
    return baseline.predict(head, features)


def decode_detector(
    baseline: Any, examples: list[Any], outputs: np.ndarray,
) -> list[dict[str, Any]]:
    records = []
    for example, output in zip(examples, outputs, strict=True):
        bbox = baseline.bbox_from_input(output[1:5], example.geometry, (example.frame["width"], example.frame["height"]))
        records.append({
            "frameId": example.frame["frameId"],
            "confidence": float(output[0]),
            "accepted": bool(output[0] >= CONFIDENCE_THRESHOLD and valid_bbox(bbox)),
            "bbox": bbox,
        })
    return records


def neck_local_examples(
    baseline: Any,
    manual: Any,
    experiment: Any,
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    detector_by_id: dict[str, dict[str, Any]],
    augmentations: tuple[str, ...],
    training: bool,
) -> tuple[list[Any], dict[str, dict[str, float]]]:
    examples = []
    rois = {}
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        search = manual.search_region(annotation, frame, PRIMARY_PRESET)
        image = experiment.open_image(repo_root, frame)
        if training and annotation["objects"]:
            visible_bbox = intersect_bbox(annotation["objects"][0]["bbox"], search)
            roi = pad_bbox(visible_bbox, BBOX_TIP_ROI_PADDING, search)
        else:
            predicted = detector_by_id[frame["frameId"]]["bbox"]
            roi = pad_bbox(predicted, BBOX_TIP_ROI_PADDING, search) if valid_bbox(predicted) else fallback_roi(search)
        if not valid_bbox(roi):
            roi = fallback_roi(search)
        rois[frame["frameId"]] = roi
        for augmentation in augmentations:
            tensor, geometry = baseline.prepare_image(image, augmentation, manual.crop_tuple(roi))
            examples.append(experiment.make_example(baseline, frame, annotation, tensor, geometry))
    return examples, rois


def decode_joint(
    baseline: Any, examples: list[Any], outputs: np.ndarray,
) -> list[dict[str, Any]]:
    records = []
    for example, output in zip(examples, outputs, strict=True):
        bbox = baseline.bbox_from_input(output[1:5], example.geometry, (example.frame["width"], example.frame["height"]))
        point_x, point_y = baseline.point_from_input(output[5:7], example.geometry)
        records.append({
            "frameId": example.frame["frameId"],
            "confidence": float(output[0]),
            "accepted": bool(output[0] >= CONFIDENCE_THRESHOLD and valid_bbox(bbox)),
            "bbox": bbox,
            "tipConfidence": float(output[0]),
            "point": {"x": point_x, "y": point_y},
        })
    return records


def evaluate_structure_pipeline(
    baseline: Any,
    manual: Any,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    structure_by_id: dict[str, dict[str, Any]],
    tip_by_id: dict[str, dict[str, Any]],
    formulation: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    positive_count = 0
    negative_count = 0
    located = 0
    false_present = 0
    structure_accepted = 0
    recall_iou30 = 0
    recall_iou50 = 0
    raw_tip_inside = 0
    padded_tip_inside = 0
    bbox_ious = []
    errors = []
    normalized = []
    records = []
    stages = {
        "spoutBboxMissing": 0,
        "spoutBboxWrongObject": 0,
        "spoutBboxCoarseButUsable": 0,
        "tipRejectedByConfidence": 0,
        "tipRejectedByConsistency": 0,
        "tipWrongDespiteCorrectSpout": 0,
    }
    for frame in frames:
        frame_id = frame["frameId"]
        annotation = annotations[frame_id]
        positive = bool(annotation["objects"])
        search = manual.search_region(annotation, frame, PRIMARY_PRESET)
        structure = structure_by_id[frame_id]
        tip = tip_by_id[frame_id]
        bbox = structure["bbox"]
        structure_ok = bool(structure["accepted"])
        tip_confidence_ok = bool(tip["tipConfidence"] >= CONFIDENCE_THRESHOLD)
        consistency_box = pad_bbox(bbox, CONSISTENCY_PADDING, search) if valid_bbox(bbox) else bbox
        consistent = valid_bbox(consistency_box) and manual.contains(tip["point"], consistency_box)
        accepted = structure_ok and tip_confidence_ok and consistent
        iou = None
        error = None
        normalized_error = None
        gt_tip_inside_raw = None
        gt_tip_inside_padded = None
        if positive:
            positive_count += 1
            gt_bbox = intersect_bbox(annotation["objects"][0]["bbox"], search)
            gt_tip = annotation["objects"][0]["spoutTip"]
            if not structure_ok:
                stages["spoutBboxMissing"] += 1
            else:
                structure_accepted += 1
                iou = baseline.bbox_iou(bbox, gt_bbox)
                bbox_ious.append(iou)
                recall_iou30 += int(iou >= 0.30)
                recall_iou50 += int(iou >= 0.50)
                if iou < 0.10:
                    stages["spoutBboxWrongObject"] += 1
                elif iou < 0.50:
                    stages["spoutBboxCoarseButUsable"] += 1
                gt_tip_inside_raw = manual.contains(gt_tip, bbox)
                gt_tip_inside_padded = manual.contains(gt_tip, consistency_box)
                raw_tip_inside += int(gt_tip_inside_raw)
                padded_tip_inside += int(gt_tip_inside_padded)
            if structure_ok and not tip_confidence_ok:
                stages["tipRejectedByConfidence"] += 1
            if structure_ok and tip_confidence_ok and not consistent:
                stages["tipRejectedByConsistency"] += 1
            if accepted:
                located += 1
                error = math.hypot(tip["point"]["x"] - gt_tip["x"], tip["point"]["y"] - gt_tip["y"])
                normalized_error = error / manual.effective_radius(annotation["dripper"])
                errors.append(error)
                normalized.append(normalized_error)
                if iou is not None and iou >= 0.30 and normalized_error > 0.25:
                    stages["tipWrongDespiteCorrectSpout"] += 1
        else:
            negative_count += 1
            false_present += int(accepted)
        records.append({
            "frameId": frame_id,
            "session": frame["sessionId"],
            "formulation": formulation,
            "positive": positive,
            "structureConfidence": structure["confidence"],
            "structureAccepted": structure_ok,
            "bbox": bbox,
            "bboxIoU": iou,
            "tipConfidence": tip["tipConfidence"],
            "point": tip["point"],
            "consistent": consistent,
            "accepted": accepted,
            "gtTipInsidePredictedBbox": gt_tip_inside_raw,
            "gtTipInsideConsistencyBbox": gt_tip_inside_padded,
            "errorPx": error,
            "normalizedError": normalized_error,
        })
    return {
        "positiveLocateRate": located / positive_count,
        "negativeFalsePositiveRate": false_present / negative_count,
        "pixelError": baseline.distribution(errors),
        "normalizedError": baseline.distribution(normalized),
        "presence": {
            "positiveRecall": located / positive_count,
            "negativeSpecificity": 1 - false_present / negative_count,
            "falsePresent": false_present,
            "falseAbsent": positive_count - located,
        },
        "structure": {
            "positiveAcceptedStructureRate": structure_accepted / positive_count,
            "recallIoU30": recall_iou30 / positive_count,
            "recallIoU50": recall_iou50 / positive_count,
            "bboxIoUAccepted": baseline.distribution(bbox_ious),
            "groundTruthTipInsidePredictedBboxRate": raw_tip_inside / max(1, structure_accepted),
            "groundTruthTipInsideConsistencyBboxRate": padded_tip_inside / max(1, structure_accepted),
        },
        "stageFailures": stages,
    }, records


def candidate_score(folds: dict[str, Any], formulation: str) -> tuple[float, float, float]:
    focus = ("session-004", "session-011", "session-012", "session-013")
    metrics = [folds[session][formulation] for session in focus]
    p90_values = [item["normalizedError"]["p90"] for item in metrics]
    return (
        min(item["positiveLocateRate"] for item in metrics),
        min(item["presence"]["negativeSpecificity"] for item in metrics),
        -max(value if value is not None else 1_000_000.0 for value in p90_values),
    )


def evaluate_gate(folds: dict[str, Any], best: str) -> dict[str, Any]:
    failures = []
    for session in ("session-004", "session-011", "session-012", "session-013"):
        metrics = folds[session][best]
        if metrics["positiveLocateRate"] < GATE_LIMITS["minimumPreviouslyFailingLocate"]:
            failures.append(f"{session}: catastrophic locate collapse")
        if metrics["presence"]["positiveRecall"] < GATE_LIMITS["minimumPresenceRecall"]:
            failures.append(f"{session}: presence recall")
        if metrics["presence"]["negativeSpecificity"] < GATE_LIMITS["minimumPresenceSpecificity"]:
            failures.append(f"{session}: presence specificity")
    if folds["session-013"][best]["positiveLocateRate"] < GATE_LIMITS["minimumSession013Locate"]:
        failures.append("session-013: no meaningful recovery")
    for session, key in (("session-011", "minimumFprReduction011"), ("session-012", "minimumFprReduction012")):
        baseline_fpr = folds[session]["tipOnly"]["negativeFalsePositiveRate"]
        improvement = baseline_fpr - folds[session][best]["negativeFalsePositiveRate"]
        if improvement < GATE_LIMITS[key]:
            failures.append(f"{session}: negative FPR reduction {improvement:.3f} is not material")
    old_p90 = folds["session-004"]["tipOnly"]["normalizedError"]["p90"]
    new_p90 = folds["session-004"][best]["normalizedError"]["p90"]
    if new_p90 is None or old_p90 is None or new_p90 >= old_p90:
        failures.append("session-004: tail error not reduced")
    return {"passed": not failures, "limits": GATE_LIMITS, "failures": failures}


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    baseline = load_module(repo_root / "scripts/vision/task9c2-baseline.py", "task9c2_baseline_956")
    experiment = load_module(repo_root / "scripts/vision/task9c5-2-global-local-keypoint.py", "task9c5_2_reused_956")
    data_module = load_module(repo_root / "scripts/vision/task9c5-3-targeted-retraining.py", "task9c5_3_data_956")
    manual = load_module(repo_root / "scripts/vision/task9c5-5-manual-roi-localization.py", "task9c5_5_manual_956")
    baseline.set_determinism()
    torch.hub.set_dir(str(work_root / "cache/torch/hub"))
    frames, annotations = data_module.load_records(repo_root, work_root)
    experiment.open_image = lambda root, frame: data_module.open_development_image(root, work_root, frame)
    eligible = [frame for frame in frames if annotations[frame["frameId"]].get("dripper")]
    tip_only = json.loads((work_root / "runs/task-9c5-5/results.json").read_text(encoding="utf-8"))
    run_dir = work_root / "runs/task-9c5-6"
    checkpoint_dir = work_root / "checkpoints/task-9c5-6"
    run_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    backbone = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1).features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)
    folds = {}
    all_records = {"neckFirst": [], "jointNeckTip": []}
    started = time.time()
    for fold_index, heldout in enumerate(SESSIONS):
        train_frames = [frame for frame in eligible if frame["sessionId"] != heldout]
        test_frames = [frame for frame in eligible if frame["sessionId"] == heldout]
        seed = SEED + fold_index * 100
        train_examples = structure_examples(baseline, manual, experiment, repo_root, train_frames, annotations, baseline.AUGMENTATIONS)
        test_examples = structure_examples(baseline, manual, experiment, repo_root, test_frames, annotations, ("identity",))
        train_features = baseline.extract_features(backbone, train_examples)
        test_features = baseline.extract_features(backbone, test_examples)

        detector_targets = torch.tensor([example.bbox_target for example in train_examples], dtype=torch.float32)
        detector_head, detector_training = train_fixed(
            baseline, train_features, train_examples, 4, detector_targets, detector_loss, args.epochs,
            checkpoint_dir / "loso" / heldout / "neck-detector.head.pt", seed,
        )
        detector_test = decode_detector(baseline, test_examples, predict(baseline, detector_head, test_features))
        detector_test_by_id = {item["frameId"]: item for item in detector_test}
        train_identity = structure_examples(baseline, manual, experiment, repo_root, train_frames, annotations, ("identity",))
        train_identity_features = baseline.extract_features(backbone, train_identity)
        detector_train = decode_detector(baseline, train_identity, predict(baseline, detector_head, train_identity_features))
        detector_train_by_id = {item["frameId"]: item for item in detector_train}

        neck_train, _ = neck_local_examples(
            baseline, manual, experiment, repo_root, train_frames, annotations,
            detector_train_by_id, baseline.AUGMENTATIONS, training=True,
        )
        neck_train_features = baseline.extract_features(backbone, neck_train)
        neck_head, neck_training = experiment.train_fixed_head(
            baseline, f"{heldout}-neck-tip", neck_train_features, neck_train, args.epochs,
            checkpoint_dir / "loso" / heldout / "neck-tip.head.pt", seed + 1,
        )
        neck_test, _ = neck_local_examples(
            baseline, manual, experiment, repo_root, test_frames, annotations,
            detector_test_by_id, ("identity",), training=False,
        )
        neck_outputs = predict(baseline, neck_head, baseline.extract_features(backbone, neck_test))
        _, neck_tip_predictions = baseline.evaluate_keypoints(neck_test, neck_outputs, CONFIDENCE_THRESHOLD)
        neck_tip_by_id = {
            item["frameId"]: {"tipConfidence": item["confidence"], "point": item["point"]}
            for item in neck_tip_predictions
        }
        neck_metrics, neck_records = evaluate_structure_pipeline(
            baseline, manual, test_frames, annotations, detector_test_by_id, neck_tip_by_id, "neckFirst",
        )

        joint_targets = torch.tensor([
            (*example.bbox_target, *example.point_target) for example in train_examples
        ], dtype=torch.float32)
        joint_head, joint_training = train_fixed(
            baseline, train_features, train_examples, 6, joint_targets, joint_loss, args.epochs,
            checkpoint_dir / "loso" / heldout / "joint-neck-tip.head.pt", seed + 2,
        )
        joint_predictions = decode_joint(baseline, test_examples, predict(baseline, joint_head, test_features))
        joint_by_id = {item["frameId"]: item for item in joint_predictions}
        joint_metrics, joint_records = evaluate_structure_pipeline(
            baseline, manual, test_frames, annotations, joint_by_id, joint_by_id, "jointNeckTip",
        )

        tip_metrics = copy.deepcopy(tip_only["folds"][heldout]["manualRoiRefined"])
        tip_metrics["presence"] = copy.deepcopy(tip_only["folds"][heldout]["presence"]["jointConfidenceRule"])
        folds[heldout] = {
            "counts": {"total": len(test_frames), "positive": sum(bool(annotations[f["frameId"]]["objects"]) for f in test_frames), "negative": sum(not annotations[f["frameId"]]["objects"] for f in test_frames)},
            "tipOnly": tip_metrics,
            "neckFirst": neck_metrics,
            "jointNeckTip": joint_metrics,
            "training": {"neckDetector": detector_training, "neckTip": neck_training, "joint": joint_training},
        }
        all_records["neckFirst"].extend(neck_records)
        all_records["jointNeckTip"].extend(joint_records)
        print(f"completed {heldout} fold", flush=True)

    best = max(("neckFirst", "jointNeckTip"), key=lambda formulation: candidate_score(folds, formulation))
    gate = evaluate_gate(folds, best)
    results = {
        "status": "complete",
        "protocol": {
            "sessions": SESSIONS,
            "method": "seven-fold leave-one-session-out",
            "manualSearchPreset": PRIMARY_PRESET,
            "confidenceThresholds": {"bbox": CONFIDENCE_THRESHOLD, "tip": CONFIDENCE_THRESHOLD, "joint": CONFIDENCE_THRESHOLD},
            "neckTipRoiPaddingEachSide": BBOX_TIP_ROI_PADDING,
            "consistencyPaddingEachSide": CONSISTENCY_PADDING,
            "bboxTarget": "annotated gooseneck_spout intersected with the manual search crop",
            "checkpointSelection": "fixed final epoch; held-out session excluded",
            "session014Accessed": False,
            "externalBenchmarkAccessed": False,
        },
        "folds": folds,
        "bestStructureAwareCandidate": best,
        "candidateScores": {name: candidate_score(folds, name) for name in ("neckFirst", "jointNeckTip")},
        "gate": gate,
        "catastrophicCollapse": not gate["passed"],
        "onnx": {"exported": False, "reason": "Task gate does not authorize export; cross-session gate failed"},
        "elapsedSeconds": time.time() - started,
    }
    (run_dir / "results.json").write_text(json.dumps(results, indent=2, default=float), encoding="utf-8")
    (run_dir / "predictions.json").write_text(json.dumps(all_records, indent=2, default=float), encoding="utf-8")
    print(json.dumps({"results": str(run_dir / "results.json"), "best": best, "gate": gate}, indent=2))


if __name__ == "__main__":
    main()
