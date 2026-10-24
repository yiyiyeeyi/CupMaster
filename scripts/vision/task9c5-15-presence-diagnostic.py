#!/usr/bin/env python3
"""Task 9C-5.15 presence learnability/generalization diagnostic.

This script intentionally trains only the already-frozen presence + heatmap
head. It has an explicit development-session allowlist and reuses the corrected
Task 9C-5.14B annotations without changing them.
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
from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large


SEED = 20260929
SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13, 15, 16, 17, 18, 19))
TARGET_SESSIONS = tuple(f"session-{value:03d}" for value in (15, 16, 17, 18, 19))
FORBIDDEN_SESSIONS = {"session-014", *(f"session-{value:03d}" for value in range(5, 11))}
AUGMENTATIONS = ("identity", "horizontal_flip", "brightness_0.90", "contrast_1.10")

# Group-aware holdout. Exact/flagged near-duplicate pairs are kept on one side.
# Session 019's two dHash-identical water-off frames are both held out.
HOLDOUT_IDS = {
    "session-015-t116000", "session-015-t123500",
    "session-016-t044000", "session-016-t028000", "session-016-t164000",
    "session-017-t004000", "session-017-t012000",
    "session-018-t019000", "session-018-t062000", "session-018-t068000",
    "session-019-t000000", "session-019-t000500", "session-019-t042000",
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


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(fraction * len(ordered)) - 1)]


def distribution(values: Iterable[float]) -> dict[str, float | int | None]:
    collected = list(values)
    if not collected:
        return {"count": 0, "mean": None, "median": None, "p90": None, "max": None}
    return {
        "count": len(collected), "mean": statistics.fmean(collected),
        "median": statistics.median(collected), "p90": percentile(collected, 0.90),
        "max": max(collected),
    }


def presence_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [record for record in records if record["positive"]]
    negatives = [record for record in records if not record["positive"]]
    true_present = sum(record["presenceAccepted"] for record in positives)
    false_present = sum(record["presenceAccepted"] for record in negatives)
    return {
        "counts": {"total": len(records), "positive": len(positives), "negative": len(negatives)},
        "recall": true_present / len(positives) if positives else None,
        "specificity": 1 - false_present / len(negatives) if negatives else None,
        "falsePresent": false_present, "falseAbsent": len(positives) - true_present,
        "positiveProbability": distribution(record["presenceProbability"] for record in positives),
        "negativeProbability": distribution(record["presenceProbability"] for record in negatives),
    }


def tip_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [record for record in records if record["positive"]]
    accepted = [record for record in positives if record["presenceAccepted"]]
    return {
        "positiveCount": len(positives), "presenceAcceptedCount": len(accepted),
        "normalizedErrorAllPositives": distribution(
            float(record["argmax"]["normalizedError"]) for record in positives
        ),
        "normalizedErrorPresenceAccepted": distribution(
            float(record["argmax"]["normalizedError"]) for record in accepted
        ),
        "usableAt0.20": sum(
            record["presenceAccepted"] and float(record["argmax"]["normalizedError"]) <= 0.20
            for record in positives
        ) / len(positives) if positives else None,
    }


def metadata_summary(
    records: list[dict[str, Any]], annotations: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for water_state in ("yes", "no"):
        selected = [
            record for record in records
            if record["positive"]
            and annotations[record["frameId"]].get("selectionMetadata", {}).get("waterOnHint") == water_state
        ]
        output[f"waterOn_{water_state}"] = {
            "count": len(selected),
            "recall": sum(record["presenceAccepted"] for record in selected) / len(selected) if selected else None,
            "frameIds": [record["frameId"] for record in selected],
        }
    hard_negatives = [
        record for record in records
        if not record["positive"]
        and annotations[record["frameId"]].get("selectionMetadata", {}).get("distractorHints")
    ]
    output["hardNegatives"] = {
        "count": len(hard_negatives),
        "falsePresent": sum(record["presenceAccepted"] for record in hard_negatives),
        "falsePositiveRate": sum(record["presenceAccepted"] for record in hard_negatives) / len(hard_negatives)
        if hard_negatives else None,
    }
    output["hardNegatives"]["byHint"] = {}
    hints = sorted({
        hint for record in hard_negatives
        for hint in annotations[record["frameId"]].get("selectionMetadata", {}).get("distractorHints", [])
    })
    for hint in hints:
        selected = [
            record for record in hard_negatives
            if hint in annotations[record["frameId"]].get("selectionMetadata", {}).get("distractorHints", [])
        ]
        output["hardNegatives"]["byHint"][hint] = {
            "count": len(selected), "falsePresent": sum(record["presenceAccepted"] for record in selected),
            "falsePositiveRate": sum(record["presenceAccepted"] for record in selected) / len(selected),
        }
    return output


def summarize(
    records: list[dict[str, Any]], annotations: dict[str, dict[str, Any]], sessions: Iterable[str],
) -> dict[str, Any]:
    return {
        "overall": presence_summary(records),
        "tip": tip_summary(records),
        "metadata": metadata_summary(records, annotations),
        "bySession": {
            session: {
                "presence": presence_summary([record for record in records if record["session"] == session]),
                "tip": tip_summary([record for record in records if record["session"] == session]),
                "metadata": metadata_summary(
                    [record for record in records if record["session"] == session], annotations,
                ),
            }
            for session in sessions
        },
    }


def validate_split(
    targeted_frames: list[dict[str, Any]], annotations: dict[str, dict[str, Any]], manifest: dict[str, Any],
) -> dict[str, Any]:
    eligible_ids = {frame["frameId"] for frame in targeted_frames}
    if not HOLDOUT_IDS <= eligible_ids:
        raise RuntimeError(f"Unknown/ineligible holdout IDs: {sorted(HOLDOUT_IDS - eligible_ids)}")
    train_ids = eligible_ids - HOLDOUT_IDS
    if train_ids & HOLDOUT_IDS or train_ids | HOLDOUT_IDS != eligible_ids:
        raise RuntimeError("Within-session split overlap or coverage failure")
    manifest_by_id = {frame["id"]: frame for frame in manifest["frames"]}
    leak_pairs = set()
    for frame_id in eligible_ids:
        item = manifest_by_id[frame_id]
        nearest = item.get("nearestDHashFrameId")
        if item.get("nearDuplicateFlag") and nearest in eligible_ids:
            if (frame_id in HOLDOUT_IDS) != (nearest in HOLDOUT_IDS):
                leak_pairs.add(tuple(sorted((frame_id, nearest))))
    if leak_pairs:
        raise RuntimeError(f"Flagged near-duplicate leakage: {sorted(leak_pairs)}")
    by_session = {}
    for session in TARGET_SESSIONS:
        session_ids = {frame["frameId"] for frame in targeted_frames if frame["sessionId"] == session}
        test_ids = session_ids & HOLDOUT_IDS
        session_train = session_ids - test_ids
        by_session[session] = {
            "train": len(session_train), "test": len(test_ids),
            "trainFraction": len(session_train) / len(session_ids),
            "trainPositive": sum(bool(annotations[item]["objects"]) for item in session_train),
            "trainNegative": sum(not annotations[item]["objects"] for item in session_train),
            "testPositive": sum(bool(annotations[item]["objects"]) for item in test_ids),
            "testNegative": sum(not annotations[item]["objects"] for item in test_ids),
            "testFrameIds": sorted(test_ids),
        }
    return {
        "policy": "deterministic group-aware holdout; exact/flagged near duplicates stay on one side",
        "trainFrameIds": sorted(train_ids), "testFrameIds": sorted(HOLDOUT_IDS),
        "flaggedNearDuplicateLeakage": [], "bySession": by_session,
    }


def subset(items: list[Any], ids: set[str]) -> tuple[list[Any], list[int]]:
    indices = [index for index, item in enumerate(items) if item.frame["frameId"] in ids]
    return [items[index] for index in indices], indices


def feature_subset(features: torch.Tensor, indices: list[int]) -> torch.Tensor:
    return features[torch.tensor(indices, dtype=torch.long)]


def fit_and_evaluate(
    baseline: Any, heatmap: Any, manual: Any, annotations: dict[str, dict[str, Any]],
    train_examples: list[Any], train_features: torch.Tensor, eval_examples: list[Any],
    eval_features: torch.Tensor, epochs: int, checkpoint: Path, selection_note: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    head = heatmap.PresenceHeatmapHead(960)
    if checkpoint.is_file():
        saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
        head.load_state_dict(saved["stateDict"])
        head.eval()
        training = {
            "selection": "fixed final epoch; loaded existing checkpoint", "epochs": saved["epoch"],
            "seed": saved["seed"], "checkpoint": str(checkpoint),
            "checkpointSha256": baseline.sha256_file(checkpoint),
        }
    else:
        training = heatmap.train_fold(
            baseline, head, train_features, train_examples, epochs, SEED, checkpoint,
        )
    training["selection"] = selection_note
    with torch.inference_mode():
        presence_logits, heatmap_logits = head(eval_features)
    _, records = heatmap.evaluate_fold(
        baseline, manual, eval_examples, annotations, presence_logits, heatmap_logits,
    )
    return training, records


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    script_root = repo_root / "scripts/vision"
    baseline = load_module(script_root / "task9c2-baseline.py", "task9c2_for_task9c5_15")
    data_module = load_module(script_root / "task9c5-3-targeted-retraining.py", "task9c5_3_for_task9c5_15")
    manual = load_module(script_root / "task9c5-5-manual-roi-localization.py", "task9c5_5_for_task9c5_15")
    heatmap = load_module(script_root / "task9c5-7-presence-heatmap.py", "task9c5_7_for_task9c5_15")
    bbox_module = load_module(script_root / "task9c5-8-standalone-spout.py", "task9c5_8_for_task9c5_15")
    targeted = load_module(script_root / "task9c5-13-targeted-retraining.py", "task9c5_13_for_task9c5_15")
    baseline.set_determinism()

    corrected_path = work_root / "datasets/task-9c5-11/annotations/task-9c5-11-targeted-v1.corrected.normalized.json"
    frames, annotations, dataset = targeted.load_pool(
        repo_root, work_root, data_module, corrected_path,
    )
    if set(frame["sessionId"] for frame in frames) != set(SESSIONS):
        raise RuntimeError("Unexpected development-session set")
    if any(frame["sessionId"] in FORBIDDEN_SESSIONS for frame in frames):
        raise RuntimeError("Forbidden session entered diagnostic")
    target_frames = [frame for frame in frames if frame["sessionId"] in TARGET_SESSIONS]
    manifest = json.loads((
        work_root / "datasets/task-9c5-11/annotation/annotation-manifest.json"
    ).read_text(encoding="utf-8"))
    split = validate_split(target_frames, annotations, manifest)

    train_examples = targeted.build_examples(
        baseline, manual, bbox_module, data_module, repo_root, work_root,
        frames, annotations, AUGMENTATIONS,
    )
    eval_examples = targeted.build_examples(
        baseline, manual, bbox_module, data_module, repo_root, work_root,
        frames, annotations, ("identity",),
    )
    backbone = mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.IMAGENET1K_V2).features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad = False
    print("Extracting frozen MobileNetV3-large features", flush=True)
    train_features = baseline.extract_features(backbone, train_examples)
    eval_features = baseline.extract_features(backbone, eval_examples)

    model_root = work_root / "models/task-9c5-15"
    eval_root = work_root / "eval/task-9c5-15"
    eval_root.mkdir(parents=True, exist_ok=True)
    all_ids = {frame["frameId"] for frame in frames}
    train_fit_training, train_fit_records = fit_and_evaluate(
        baseline, heatmap, manual, annotations, train_examples, train_features,
        eval_examples, eval_features, args.epochs, model_root / "train-fit/presence-heatmap.pt",
        "fixed final epoch; intentional same-frame train-fit diagnostic",
    )
    print("Completed train-fit sanity check", flush=True)

    in_train_ids = set(split["trainFrameIds"])
    in_test_ids = set(split["testFrameIds"])
    in_train_examples, in_train_indices = subset(train_examples, in_train_ids)
    in_eval_examples, in_eval_indices = subset(eval_examples, in_test_ids)
    in_training, in_records = fit_and_evaluate(
        baseline, heatmap, manual, annotations,
        in_train_examples, feature_subset(train_features, in_train_indices),
        in_eval_examples, feature_subset(eval_features, in_eval_indices),
        args.epochs, model_root / "in-domain/presence-heatmap.pt",
        "fixed final epoch; deterministic group-aware in-domain holdout excluded",
    )
    print("Completed deterministic in-domain holdout", flush=True)

    loso_path = work_root / "eval/task-9c5-14b/predictions.json"
    loso_payload = json.loads(loso_path.read_text(encoding="utf-8"))
    loso_records = [
        record for session in SESSIONS
        for record in loso_payload["targeted"][session]["presenceTip"]
    ]
    if {record["frameId"] for record in loso_records} != all_ids:
        raise RuntimeError("Task 9C-5.14B LOSO predictions do not match corrected eligible pool")

    output = {
        "status": "complete",
        "configuration": {
            "backbone": "MobileNetV3-large ImageNet-1K V2 frozen features",
            "head": "separate BCE presence + positive-only 28x28 Gaussian heatmap; sigma 1.5; argmax",
            "epochs": args.epochs, "augmentations": list(AUGMENTATIONS),
            "manualSearchPreset": "balanced", "presenceThreshold": 0.5,
            "seed": SEED, "annotationSource": str(corrected_path),
            "session014Accessed": False, "externalBenchmarkAccessed": False,
        },
        "dataset": dataset, "split": split,
        "trainFit": summarize(train_fit_records, annotations, SESSIONS),
        "inDomain": summarize(in_records, annotations, TARGET_SESSIONS),
        "losoReference": summarize(loso_records, annotations, SESSIONS),
        "training": {"trainFit": train_fit_training, "inDomain": in_training},
    }
    (eval_root / "results.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
    (eval_root / "predictions.json").write_text(json.dumps({
        "trainFit": train_fit_records, "inDomain": in_records,
        "losoReferenceSource": str(loso_path),
    }, indent=2), encoding="utf-8")
    (eval_root / "split.json").write_text(json.dumps(split, indent=2), encoding="utf-8")
    print(json.dumps({
        "results": str(eval_root / "results.json"),
        "trainFit": output["trainFit"]["overall"],
        "inDomain": output["inDomain"]["overall"],
        "loso": output["losoReference"]["overall"],
    }, indent=2), flush=True)


if __name__ == "__main__":
    main()
