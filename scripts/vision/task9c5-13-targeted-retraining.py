#!/usr/bin/env python3
"""Task 9C-5.13 controlled targeted-data retraining experiment.

All media and generated artifacts remain local under .vision-work. The script
has an explicit session allowlist and refuses the sealed/external sessions.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import statistics
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

import torch
from PIL import Image
from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large


SEED = 20260929
OLD_SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13))
TARGET_SESSIONS = tuple(f"session-{value:03d}" for value in (15, 16, 17, 18, 19))
SESSIONS = OLD_SESSIONS + TARGET_SESSIONS
FORBIDDEN_SESSIONS = {"session-014", *(f"session-{value:03d}" for value in range(5, 11))}
AUGMENTATIONS = ("identity", "horizontal_flip", "brightness_0.90", "contrast_1.10")
QUALITY_LIMITS = (0.02, 0.06, 0.20)


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
    parser.add_argument(
        "--targeted-annotations", type=Path,
        default=Path("datasets/task-9c5-11/annotations/task-9c5-11-targeted-v0.normalized.json"),
    )
    parser.add_argument("--task-name", default="task-9c5-13")
    return parser.parse_args()


def validate_annotation(item: dict[str, Any]) -> None:
    positive = bool(item["objects"])
    if item.get("kind") == "positive" and not positive:
        raise RuntimeError(f"Positive annotation has no object: {item['frameId']}")
    if item.get("kind") == "negative" and positive:
        raise RuntimeError(f"Negative annotation has an object: {item['frameId']}")
    if len(item["objects"]) > 1:
        raise RuntimeError(f"Duplicate object annotation: {item['frameId']}")
    if positive:
        obj = item["objects"][0]
        if obj.get("class") != "gooseneck_spout" or "bbox" not in obj or "spoutTip" not in obj:
            raise RuntimeError(f"Incomplete positive annotation: {item['frameId']}")
        bbox = obj["bbox"]
        tip = obj["spoutTip"]
        if not (0 <= bbox["xMin"] < bbox["xMax"] <= item["width"] and 0 <= bbox["yMin"] < bbox["yMax"] <= item["height"]):
            raise RuntimeError(f"Invalid bbox: {item['frameId']}")
        if not (0 <= tip["x"] < item["width"] and 0 <= tip["y"] < item["height"]):
            raise RuntimeError(f"Invalid tip: {item['frameId']}")


def load_pool(
    repo_root: Path, work_root: Path, data_module: Any, targeted_annotations: Path | None = None,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, Any]]:
    old_frames, old_annotations = data_module.load_records(repo_root, work_root)
    targeted_path = targeted_annotations or (
        work_root / "datasets/task-9c5-11/annotations/task-9c5-11-targeted-v0.normalized.json"
    )
    if not targeted_path.is_absolute():
        targeted_path = work_root / targeted_path
    targeted_path = targeted_path.resolve()
    allowed_annotations = (work_root / "datasets/task-9c5-11/annotations").resolve()
    if not targeted_path.is_relative_to(allowed_annotations):
        raise RuntimeError(f"Targeted annotation path escaped allowlist: {targeted_path}")
    targeted = json.loads(targeted_path.read_text(encoding="utf-8"))
    targeted_manifest = json.loads((
        work_root / "datasets/task-9c5-11/annotation/annotation-manifest.json"
    ).read_text(encoding="utf-8"))
    targeted_frames = {item["id"]: item for item in targeted_manifest["frames"]}
    annotations = dict(old_annotations)
    frames = list(old_frames)
    for item in targeted["annotations"]:
        manifest_frame = targeted_frames.get(item["frameId"])
        if manifest_frame is None or manifest_frame["filename"] != item["filename"]:
            raise RuntimeError(f"Targeted annotation/manifest mismatch: {item['frameId']}")
        item = dict(item, width=manifest_frame["width"], height=manifest_frame["height"])
        validate_annotation(item)
        if item["sessionId"] not in TARGET_SESSIONS:
            raise RuntimeError(f"Refusing targeted session: {item['sessionId']}")
        if item["frameId"] in annotations:
            raise RuntimeError(f"Duplicate frame identity: {item['frameId']}")
        annotations[item["frameId"]] = item
        frames.append({
            "frameId": item["frameId"], "sessionId": item["sessionId"],
            "timestampMs": item["timestampMs"], "filename": item["filename"],
            "width": item["width"], "height": item["height"], "imageSource": "targeted",
        })
    if any(frame["sessionId"] in FORBIDDEN_SESSIONS for frame in frames):
        raise RuntimeError("Forbidden session entered the development pool")
    identities = [frame["frameId"] for frame in frames]
    pairs = [(frame["sessionId"], frame["timestampMs"]) for frame in frames]
    if len(set(identities)) != len(identities) or len(set(pairs)) != len(pairs):
        raise RuntimeError("Duplicate frame identity or session/timestamp pair")
    if set(identities) != set(annotations):
        raise RuntimeError("Frame/annotation mismatch")
    if set(frame["sessionId"] for frame in frames) != set(SESSIONS):
        raise RuntimeError("Development session set mismatch")
    frame_map = {frame["frameId"]: frame for frame in frames}
    for item in annotations.values():
        frame = frame_map[item["frameId"]]
        item.setdefault("width", frame["width"])
        item.setdefault("height", frame["height"])
        validate_annotation(item)
    eligible = [frame for frame in frames if annotations[frame["frameId"]].get("dripper")]
    excluded = [frame["frameId"] for frame in frames if not annotations[frame["frameId"]].get("dripper")]
    counts = {
        "completePool": count_pool(frames, annotations),
        "manualRoiEligible": count_pool(eligible, annotations),
        "excludedWithoutDripper": excluded,
    }
    return eligible, annotations, counts


def count_pool(frames: list[dict[str, Any]], annotations: dict[str, dict[str, Any]]) -> dict[str, Any]:
    by_session: dict[str, dict[str, int]] = {}
    for session in SESSIONS:
        selected = [frame for frame in frames if frame["sessionId"] == session]
        positive = sum(bool(annotations[frame["frameId"]]["objects"]) for frame in selected)
        by_session[session] = {"total": len(selected), "positive": positive, "negative": len(selected) - positive}
    positive = sum(value["positive"] for value in by_session.values())
    total = sum(value["total"] for value in by_session.values())
    return {"total": total, "positive": positive, "negative": total - positive, "bySession": by_session}


def open_image(repo_root: Path, work_root: Path, data_module: Any, frame: dict[str, Any]) -> Image.Image:
    if frame["sessionId"] not in SESSIONS or frame["sessionId"] in FORBIDDEN_SESSIONS:
        raise RuntimeError(f"Refusing non-development media: {frame['sessionId']}")
    if frame["imageSource"] != "targeted":
        return data_module.open_development_image(repo_root, work_root, frame)
    allowed = (work_root / "datasets/task-9c5-11/annotation/images").resolve()
    path = (allowed / frame["filename"]).resolve()
    if not path.is_relative_to(allowed) or not path.is_file():
        raise RuntimeError(f"Targeted image missing or escaped allowlist: {path}")
    return Image.open(path).convert("RGB")


def build_examples(
    baseline: Any, manual: Any, bbox_module: Any, data_module: Any,
    repo_root: Path, work_root: Path, frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]], augmentations: Iterable[str],
) -> list[Any]:
    examples = []
    for frame in frames:
        annotation = annotations[frame["frameId"]]
        search = manual.search_region(annotation, frame, "balanced")
        image = open_image(repo_root, work_root, data_module, frame)
        for augmentation in augmentations:
            tensor, geometry = baseline.prepare_image(image, augmentation, manual.crop_tuple(search))
            positive = bool(annotation["objects"])
            if positive:
                obj = annotation["objects"][0]
                bbox = bbox_module.intersect_bbox(obj["bbox"], search)
                if not bbox_module.valid_bbox(bbox):
                    raise RuntimeError(f"Positive bbox excluded by search crop: {frame['frameId']}")
                point_target = baseline.point_to_input(obj["spoutTip"], geometry)
                bbox_target = baseline.bbox_to_input(bbox, geometry)
            else:
                point_target = (0.0, 0.0)
                bbox_target = (0.0, 0.0, 0.0, 0.0)
            examples.append(baseline.Example(
                frame=frame, annotation=annotation, tensor=tensor, geometry=geometry,
                presence=float(positive), point_target=point_target, bbox_target=bbox_target,
            ))
    return examples


def select(items: list[Any], sessions: set[str]) -> tuple[list[Any], list[int]]:
    indices = [index for index, item in enumerate(items) if item.frame["sessionId"] in sessions]
    return [items[index] for index in indices], indices


def feature_subset(features: torch.Tensor, indices: list[int]) -> torch.Tensor:
    return features[torch.tensor(indices, dtype=torch.long)]


def run_model_pair(
    baseline: Any, manual: Any, heatmap_module: Any, bbox_module: Any,
    train_examples: list[Any], train_features: torch.Tensor,
    eval_examples: list[Any], eval_features: torch.Tensor,
    annotations: dict[str, dict[str, Any]], epochs: int, seed: int, destination: Path,
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    heatmap_head = heatmap_module.PresenceHeatmapHead(960)
    heatmap_path = destination / "presence-heatmap.pt"
    if heatmap_path.is_file():
        heatmap_checkpoint = torch.load(heatmap_path, map_location="cpu", weights_only=True)
        heatmap_head.load_state_dict(heatmap_checkpoint["stateDict"])
        heatmap_head.eval()
        heatmap_training = {
            "selection": "fixed final epoch; loaded existing checkpoint",
            "epochs": heatmap_checkpoint["epoch"], "seed": heatmap_checkpoint["seed"],
            "checkpoint": str(heatmap_path), "checkpointSha256": baseline.sha256_file(heatmap_path),
        }
    else:
        heatmap_training = heatmap_module.train_fold(
            baseline, heatmap_head, train_features, train_examples, epochs, seed, heatmap_path,
        )
    with torch.inference_mode():
        presence_logits, heatmap_logits = heatmap_head(eval_features)
    tip_metrics, tip_records = heatmap_module.evaluate_fold(
        baseline, manual, eval_examples, annotations, presence_logits, heatmap_logits,
    )
    bbox_path = destination / "spout-region.pt"
    if bbox_path.is_file():
        bbox_checkpoint = torch.load(bbox_path, map_location="cpu", weights_only=True)
        bbox_head = baseline.SpatialHead(960, 4)
        bbox_head.load_state_dict(bbox_checkpoint["stateDict"])
        bbox_head.eval()
        bbox_training = {
            "selection": "fixed final epoch; loaded existing checkpoint",
            "epochs": bbox_checkpoint["epoch"], "seed": bbox_checkpoint["seed"],
            "checkpoint": str(bbox_path), "checkpointSha256": baseline.sha256_file(bbox_path),
        }
    else:
        bbox_head, bbox_training = bbox_module.train_head(
            baseline, train_features, train_examples, 960, epochs, seed + 1, bbox_path,
        )
    bbox_predictions = bbox_module.decode_predictions(baseline, bbox_head, eval_features, eval_examples)
    eval_frames = [example.frame for example in eval_examples]
    bbox_metrics, bbox_records = bbox_module.evaluate(
        baseline, manual, eval_frames, annotations, bbox_predictions,
    )
    return {
        "presenceTip": tip_metrics, "spoutRegion": bbox_metrics,
        "training": {"presenceTip": heatmap_training, "spoutRegion": bbox_training},
    }, {"presenceTip": tip_records, "spoutRegion": bbox_records}


def existing_old_results(work_root: Path) -> tuple[dict[str, Any], dict[str, dict[str, list[dict[str, Any]]]]]:
    tip_results = json.loads((work_root / "runs/task-9c5-7/mobilenet_v3_large/results.json").read_text(encoding="utf-8"))
    bbox_results = json.loads((work_root / "runs/task-9c5-8/results.json").read_text(encoding="utf-8"))
    tip_predictions = json.loads((work_root / "eval/task-9c5-7/mobilenet_v3_large/predictions.json").read_text(encoding="utf-8"))
    bbox_predictions = json.loads((work_root / "eval/task-9c5-8/predictions.json").read_text(encoding="utf-8"))["mobilenet_v3_large"]
    results = {}
    predictions = {}
    for session in OLD_SESSIONS:
        results[session] = {
            "presenceTip": tip_results["folds"][session],
            "spoutRegion": bbox_results["backbones"]["mobilenet_v3_large"]["folds"][session],
            "training": {"source": "existing Task 9C-5.7 and 9C-5.8 fixed LOSO artifacts"},
        }
        predictions[session] = {
            "presenceTip": [record for record in tip_predictions if record["session"] == session],
            "spoutRegion": [record for record in bbox_predictions if record["session"] == session],
        }
    return results, predictions


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(fraction * len(ordered)) - 1)]


def tip_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [record for record in records if record["positive"]]
    errors = [float(record["argmax"]["normalizedError"]) for record in positives]
    accepted = [record for record in positives if record["presenceAccepted"]]
    accepted_errors = [float(record["argmax"]["normalizedError"]) for record in accepted]
    denominator = len(positives)
    return {
        "positiveCount": denominator,
        "availableCount": len(accepted),
        "mean": statistics.fmean(errors) if errors else None,
        "median": statistics.median(errors) if errors else None,
        "p90": percentile(errors, 0.90),
        "max": max(errors) if errors else None,
        "proportionAtOrBelow": {
            str(limit): sum(error <= limit for error in accepted_errors) / denominator if denominator else None
            for limit in (0.02, 0.04, 0.06, 0.10, 0.20)
        },
        "qualityBuckets": quality_buckets(records),
    }


def quality_buckets(records: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [record for record in records if record["positive"]]
    counts = Counter()
    for record in positives:
        if not record["presenceAccepted"]:
            counts["unusable"] += 1
            continue
        error = float(record["argmax"]["normalizedError"])
        if error <= QUALITY_LIMITS[0]:
            counts["high"] += 1
        elif error <= QUALITY_LIMITS[1]:
            counts["medium"] += 1
        elif error <= QUALITY_LIMITS[2]:
            counts["low"] += 1
        else:
            counts["unusable"] += 1
    total = len(positives)
    return {
        key: {"count": counts[key], "proportion": counts[key] / total if total else None}
        for key in ("high", "medium", "low", "unusable")
    }


def domain_summary(
    variant_predictions: dict[str, dict[str, list[dict[str, Any]]]],
    annotations: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    tip_records = [record for value in variant_predictions.values() for record in value["presenceTip"]]
    domains = {
        "darkReflective": {"dark", "reflective"},
        "whiteHighlight": {"white", "highlight"},
        "lowContrast": {"lowContrast"},
        "shortVisible": {"shortVisible"},
        "waterOn": {"waterOn"},
    }
    output: dict[str, Any] = {}
    for name, desired in domains.items():
        selected = []
        for record in tip_records:
            metadata = annotations[record["frameId"]].get("selectionMetadata", {})
            tags = set(metadata.get("appearanceHints", []))
            if metadata.get("waterOnHint") == "yes":
                tags.add("waterOn")
            if desired & tags:
                selected.append(record)
        positives = [record for record in selected if record["positive"]]
        output[name] = {
            "sampleCount": len(selected),
            "positiveCount": len(positives),
            "presenceRecall": sum(record["presenceAccepted"] for record in positives) / len(positives) if positives else None,
            "tip": tip_summary(selected) if positives else None,
        }
    distractors = {"hand", "wetBed", "foam", "reflection", "kettleBody", "shaft", "tool", "rim", "server"}
    negatives = []
    for record in tip_records:
        metadata = annotations[record["frameId"]].get("selectionMetadata", {})
        if not record["positive"] and distractors & set(metadata.get("distractorHints", [])):
            negatives.append(record)
    output["hardNegatives"] = {
        "count": len(negatives), "falsePresent": sum(record["presenceAccepted"] for record in negatives),
        "falsePositiveRate": sum(record["presenceAccepted"] for record in negatives) / len(negatives) if negatives else None,
    }
    output["hardNegatives"]["byHint"] = {}
    for hint in ("hand", "kettleBody", "shaft", "rim", "wetBed", "foam", "reflection", "server"):
        selected = [
            record for record in negatives
            if hint in annotations[record["frameId"]].get("selectionMetadata", {}).get("distractorHints", [])
        ]
        output["hardNegatives"]["byHint"][hint] = {
            "count": len(selected),
            "falsePresent": sum(record["presenceAccepted"] for record in selected),
            "falsePositiveRate": sum(record["presenceAccepted"] for record in selected) / len(selected) if selected else None,
        }
    return output


def add_derived(results: dict[str, Any], predictions: dict[str, dict[str, list[dict[str, Any]]]]) -> None:
    for session, result in results.items():
        result["tip"] = tip_summary(predictions[session]["presenceTip"])


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    script_root = repo_root / "scripts/vision"
    baseline = load_module(script_root / "task9c2-baseline.py", "task9c2_for_task9c5_13")
    data_module = load_module(script_root / "task9c5-3-targeted-retraining.py", "task9c5_3_for_task9c5_13")
    manual = load_module(script_root / "task9c5-5-manual-roi-localization.py", "task9c5_5_for_task9c5_13")
    heatmap_module = load_module(script_root / "task9c5-7-presence-heatmap.py", "task9c5_7_for_task9c5_13")
    bbox_module = load_module(script_root / "task9c5-8-standalone-spout.py", "task9c5_8_for_task9c5_13")
    baseline.set_determinism()

    frames, annotations, dataset = load_pool(
        repo_root, work_root, data_module, args.targeted_annotations,
    )
    print(f"Validated {dataset['completePool']['total']} frames; {dataset['manualRoiEligible']['total']} manual-ROI eligible", flush=True)
    training_examples = build_examples(
        baseline, manual, bbox_module, data_module, repo_root, work_root,
        frames, annotations, AUGMENTATIONS,
    )
    evaluation_examples = build_examples(
        baseline, manual, bbox_module, data_module, repo_root, work_root,
        frames, annotations, ("identity",),
    )
    backbone = mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.IMAGENET1K_V2).features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad = False
    print("Extracting frozen MobileNetV3-large features", flush=True)
    training_features = baseline.extract_features(backbone, training_examples)
    evaluation_features = baseline.extract_features(backbone, evaluation_examples)

    if not args.task_name.startswith("task-9c5-") or any(character in args.task_name for character in ("/", "\\", "..")):
        raise RuntimeError(f"Invalid task namespace: {args.task_name}")
    model_root = work_root / "models" / args.task_name
    eval_root = work_root / "eval" / args.task_name
    eval_root.mkdir(parents=True, exist_ok=True)
    baseline_results, baseline_predictions = existing_old_results(work_root)

    baseline_train, baseline_train_indices = select(training_examples, set(OLD_SESSIONS))
    target_eval, target_eval_indices = select(evaluation_examples, set(TARGET_SESSIONS))
    print("Training pre-target baseline on all old development sessions", flush=True)
    baseline_target_metrics, baseline_target_records = run_model_pair(
        baseline, manual, heatmap_module, bbox_module,
        baseline_train, feature_subset(training_features, baseline_train_indices),
        target_eval, feature_subset(evaluation_features, target_eval_indices),
        annotations, args.epochs, SEED, model_root / "baseline/all-old",
    )
    for session in TARGET_SESSIONS:
        baseline_results[session] = {
            "presenceTip": filter_metrics(heatmap_module, baseline, manual, annotations, target_eval, baseline_target_records["presenceTip"], session),
            "spoutRegion": filter_bbox_metrics(bbox_module, baseline, manual, annotations, target_eval, baseline_target_records["spoutRegion"], session),
            "training": baseline_target_metrics["training"],
        }
        baseline_predictions[session] = {
            "presenceTip": [record for record in baseline_target_records["presenceTip"] if record["session"] == session],
            "spoutRegion": [record for record in baseline_target_records["spoutRegion"] if record["session"] == session],
        }

    targeted_results: dict[str, Any] = {}
    targeted_predictions: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for fold_index, held_out in enumerate(SESSIONS):
        train_sessions = set(SESSIONS) - {held_out}
        train_set, train_indices = select(training_examples, train_sessions)
        eval_set, eval_indices = select(evaluation_examples, {held_out})
        print(f"Training targeted LOSO fold {held_out} ({fold_index + 1}/{len(SESSIONS)})", flush=True)
        metrics, records = run_model_pair(
            baseline, manual, heatmap_module, bbox_module,
            train_set, feature_subset(training_features, train_indices),
            eval_set, feature_subset(evaluation_features, eval_indices),
            annotations, args.epochs, SEED + 100 + fold_index * 10,
            model_root / "targeted" / held_out,
        )
        targeted_results[held_out] = metrics
        targeted_predictions[held_out] = records

    add_derived(baseline_results, baseline_predictions)
    add_derived(targeted_results, targeted_predictions)
    output = {
        "status": "complete",
        "configuration": {
            "backbone": "MobileNetV3-large ImageNet-1K V2 frozen features",
            "architectureFixed": True, "epochs": args.epochs, "augmentations": list(AUGMENTATIONS),
            "manualSearchPreset": "balanced", "presenceThreshold": 0.5,
            "presenceTip": "separate BCE presence + positive-only 28x28 Gaussian heatmap; argmax decoder; sigma 1.5",
            "spoutRegion": "independent presence + axis-aligned bbox head; BCE + 5x SmoothL1",
            "method": "session-aware LOSO; baseline old folds reused, baseline target sessions evaluated by all-old model",
            "session014Accessed": False, "externalBenchmarkAccessed": False,
        },
        "dataset": dataset,
        "baseline": baseline_results,
        "targeted": targeted_results,
        "domain": {
            "baseline": domain_summary(baseline_predictions, annotations),
            "targeted": domain_summary(targeted_predictions, annotations),
            "selectionHintsAreGroundTruth": False,
        },
        "qualityBuckets": {
            "baseline": quality_buckets([r for v in baseline_predictions.values() for r in v["presenceTip"]]),
            "targeted": quality_buckets([r for v in targeted_predictions.values() for r in v["presenceTip"]]),
        },
    }
    (eval_root / "results.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
    (eval_root / "predictions.json").write_text(json.dumps({
        "baseline": baseline_predictions, "targeted": targeted_predictions,
    }, indent=2, default=lambda value: value.item()), encoding="utf-8")
    print(json.dumps({"results": str(eval_root / "results.json"), "qualityBuckets": output["qualityBuckets"]}, indent=2), flush=True)


def filter_metrics(
    heatmap_module: Any, baseline: Any, manual: Any, annotations: dict[str, dict[str, Any]],
    examples: list[Any], records: list[dict[str, Any]], session: str,
) -> dict[str, Any]:
    selected_examples = [example for example in examples if example.frame["sessionId"] == session]
    selected_ids = {example.frame["frameId"] for example in selected_examples}
    selected_records = [record for record in records if record["frameId"] in selected_ids]
    # Re-evaluation from stored heatmaps is impossible; construct the exact aggregate directly.
    positives = [record for record in selected_records if record["positive"]]
    negatives = [record for record in selected_records if not record["positive"]]
    true_present = sum(record["presenceAccepted"] for record in positives)
    false_present = sum(record["presenceAccepted"] for record in negatives)
    return {
        "counts": {"total": len(selected_records), "positive": len(positives), "negative": len(negatives)},
        "presence": {
            "threshold": 0.5, "positiveRecall": true_present / len(positives),
            "negativeSpecificity": 1 - false_present / len(negatives),
            "precision": true_present / (true_present + false_present) if true_present + false_present else None,
            "falsePresent": false_present, "falseAbsent": len(positives) - true_present,
            "auroc": heatmap_module.binary_auc([r["positive"] for r in selected_records], [r["presenceProbability"] for r in selected_records]),
            "prAucAveragePrecision": heatmap_module.average_precision([r["positive"] for r in selected_records], [r["presenceProbability"] for r in selected_records]),
        },
        "localization": {"argmax": {"normalizedError": baseline.distribution(r["argmax"]["normalizedError"] for r in positives)}},
    }


def filter_bbox_metrics(
    bbox_module: Any, baseline: Any, manual: Any, annotations: dict[str, dict[str, Any]],
    examples: list[Any], records: list[dict[str, Any]], session: str,
) -> dict[str, Any]:
    frames = [example.frame for example in examples if example.frame["sessionId"] == session]
    selected = [record for record in records if record["session"] == session]
    # evaluate accepts decoded predictions; extra GT/result fields are harmless.
    metrics, _ = bbox_module.evaluate(baseline, manual, frames, annotations, selected)
    return metrics


if __name__ == "__main__":
    main()
