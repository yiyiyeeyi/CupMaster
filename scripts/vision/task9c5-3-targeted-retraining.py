#!/usr/bin/env python3
"""Task 9C-5.3 seven-session LOSO Global-to-Local research training."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import onnx
import torch
from PIL import Image
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small


SEED = 20260928
SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13))
SEALED_SESSIONS = {"session-014"}
EXTERNAL_BENCHMARK_SESSIONS = {f"session-{value:03d}" for value in range(5, 11)}
ROI_SIZE_FRACTION = 0.65
CONFIDENCE_THRESHOLD = 0.50
GATE_LIMITS = {
    "minimumLocateRate": 0.80,
    "minimumRoiContainment": 0.95,
    "maximumNormalizedMean": 0.30,
    "maximumNormalizedMedian": 0.20,
    "maximumNormalizedP90": 0.45,
    "maximumNegativeFpr": 0.10,
    "minimumPresenceRecall": 0.80,
    "minimumPresenceSpecificity": 0.90,
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


def load_records(repo_root: Path, work_root: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    manifest = json.loads((repo_root / "data/vision/frames/feasibility-v1/manifests/cupmaster-spout-first-party-v1.training-ready.json").read_text(encoding="utf-8"))
    first_party = json.loads((repo_root / "data/vision/annotations/feasibility-v1/first-party-v1.training-ready.json").read_text(encoding="utf-8"))
    research = json.loads((work_root / "datasets/task-9c5-3/annotations/task-9c5-3-targeted-v1.normalized.json").read_text(encoding="utf-8"))
    annotations = {
        item["frameId"]: item
        for annotation_pass in first_party["passes"]
        for item in annotation_pass["annotations"]
    }
    first_frames = [dict(frame, imageSource="first_party") for frame in manifest["frames"] if frame["sessionId"] in SESSIONS]
    research_frames = []
    for item in research["annotations"]:
        if item["sessionId"] not in {"session-011", "session-012", "session-013"}:
            raise RuntimeError(f"Refusing research session {item['sessionId']}")
        annotations[item["frameId"]] = item
        research_frames.append({
            "frameId": item["frameId"], "sessionId": item["sessionId"],
            "timestampMs": item["timestampMs"], "filename": item["filename"],
            "width": item["width"], "height": item["height"], "imageSource": "research",
        })
    frames = first_frames + research_frames
    if len(first_frames) != 88 or len(research_frames) != 103 or len(frames) != 191:
        raise RuntimeError(f"Expected 88 + 103 = 191 frames, got {len(first_frames)} + {len(research_frames)}")
    identities = [frame["frameId"] for frame in frames]
    if len(set(identities)) != len(identities):
        raise RuntimeError("Duplicate frame identity in development pool")
    if {frame["sessionId"] for frame in frames} != set(SESSIONS):
        raise RuntimeError("Development session set mismatch")
    if set(identities) != set(annotations):
        raise RuntimeError("Development frame/annotation mismatch")
    return frames, annotations


def open_development_image(repo_root: Path, work_root: Path, frame: dict[str, Any]) -> Image.Image:
    session = frame["sessionId"]
    if session not in SESSIONS or session in SEALED_SESSIONS or session in EXTERNAL_BENCHMARK_SESSIONS:
        raise RuntimeError(f"Refusing non-development media: {session}")
    if frame["imageSource"] == "first_party":
        path = (repo_root / "data/vision" / frame["path"]).resolve()
        allowed = (repo_root / "data/vision").resolve()
    else:
        path = (work_root / "datasets/task-9c5-3/annotation-package/images" / frame["filename"]).resolve()
        allowed = (work_root / "datasets/task-9c5-3/annotation-package/images").resolve()
    if not path.is_relative_to(allowed):
        raise RuntimeError(f"Image path escaped allowlist: {path}")
    return Image.open(path).convert("RGB")


def presence_summary(records: list[dict[str, Any]], baseline: Any) -> dict[str, Any]:
    positives = [record for record in records if record["positive"]]
    negatives = [record for record in records if not record["positive"]]

    def stats(field: str, group: list[dict[str, Any]]) -> dict[str, Any]:
        return baseline.distribution(float(record[field]) for record in group)

    def rule(field: str) -> dict[str, Any]:
        positive_accepts = sum(float(record[field] >= CONFIDENCE_THRESHOLD) for record in positives)
        negative_accepts = sum(float(record[field] >= CONFIDENCE_THRESHOLD) for record in negatives)
        return {
            "positiveRecall": positive_accepts / len(positives),
            "negativeSpecificity": 1 - negative_accepts / len(negatives),
            "falsePresent": int(negative_accepts),
            "falseAbsent": int(len(positives) - positive_accepts),
        }

    joint_positive = sum(float(record["accepted"]) for record in positives)
    joint_negative = sum(float(record["accepted"]) for record in negatives)
    return {
        "counts": {"positive": len(positives), "negative": len(negatives)},
        "globalConfidence": {"positive": stats("globalConfidence", positives), "negative": stats("globalConfidence", negatives), **rule("globalConfidence")},
        "localConfidence": {"positive": stats("localConfidence", positives), "negative": stats("localConfidence", negatives), **rule("localConfidence")},
        "globalLocalAgreementImageWidth": {
            "positive": stats("globalLocalAgreementImageWidth", positives),
            "negative": stats("globalLocalAgreementImageWidth", negatives),
            "auditOnly": True,
        },
        "jointConfidenceRule": {
            "definition": "global confidence >= 0.50 AND local confidence >= 0.50",
            "positiveRecall": joint_positive / len(positives),
            "negativeSpecificity": 1 - joint_negative / len(negatives),
            "falsePresent": int(joint_negative),
            "falseAbsent": int(len(positives) - joint_positive),
        },
    }


def evaluate_gate(folds: dict[str, Any]) -> dict[str, Any]:
    failures = []
    for session, fold in folds.items():
        metrics = fold["globalToLocal"]
        error = metrics["normalizedError"]
        presence = fold["presence"]["jointConfidenceRule"]
        checks = (
            (metrics["positiveLocateRate"] >= GATE_LIMITS["minimumLocateRate"], "locate rate"),
            (metrics["roiContainmentRate"] >= GATE_LIMITS["minimumRoiContainment"], "ROI containment"),
            (error["mean"] is not None and error["mean"] <= GATE_LIMITS["maximumNormalizedMean"], "normalized mean"),
            (error["median"] is not None and error["median"] <= GATE_LIMITS["maximumNormalizedMedian"], "normalized median"),
            (error["p90"] is not None and error["p90"] <= GATE_LIMITS["maximumNormalizedP90"], "normalized P90"),
            (metrics["negativeFalsePositiveRate"] <= GATE_LIMITS["maximumNegativeFpr"], "negative FPR"),
            (presence["positiveRecall"] >= GATE_LIMITS["minimumPresenceRecall"], "presence recall"),
            (presence["negativeSpecificity"] >= GATE_LIMITS["minimumPresenceSpecificity"], "presence specificity"),
        )
        failures.extend(f"{session}: {name}" for passed, name in checks if not passed)
    return {"passed": not failures, "limits": GATE_LIMITS, "failures": failures}


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    baseline = load_module(repo_root / "scripts/vision/task9c2-baseline.py", "task9c2_baseline_953")
    experiment = load_module(repo_root / "scripts/vision/task9c5-2-global-local-keypoint.py", "task9c5_2_reused")
    baseline.set_determinism()
    torch.hub.set_dir(str(work_root / "cache/torch/hub"))
    frames, annotations = load_records(repo_root, work_root)
    experiment.SESSIONS = SESSIONS
    experiment.CONFIDENCE_THRESHOLD = CONFIDENCE_THRESHOLD
    experiment.open_image = lambda root, frame: open_development_image(root, work_root, frame)

    run_dir = work_root / "runs/task-9c5-3-targeted-retraining"
    checkpoint_dir = work_root / "checkpoints/task-9c5-3"
    export_dir = work_root / "exports/onnx/task-9c5-3"
    run_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    backbone = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1).features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)

    folds = {}
    all_records = []
    started = time.time()
    for fold_index, heldout in enumerate(SESSIONS):
        train_frames = [frame for frame in frames if frame["sessionId"] != heldout]
        test_frames = [frame for frame in frames if frame["sessionId"] == heldout]
        if any(frame["sessionId"] == heldout for frame in train_frames):
            raise RuntimeError("Held-out leakage")
        seed = SEED + fold_index * 100
        train_full = experiment.full_examples(baseline, repo_root, train_frames, annotations, baseline.AUGMENTATIONS)
        test_full = experiment.full_examples(baseline, repo_root, test_frames, annotations, ("identity",))
        global_features = baseline.extract_features(backbone, train_full)
        global_head, global_training = experiment.train_fixed_head(
            baseline, f"{heldout}-global", global_features, train_full, args.epochs,
            checkpoint_dir / "loso" / heldout / "global.head.pt", seed,
        )
        global_metrics, global_predictions, _ = experiment.identity_predictions(baseline, backbone, global_head, test_full)
        global_by_id = {item["frameId"]: item for item in global_predictions}

        train_identity = experiment.full_examples(baseline, repo_root, train_frames, annotations, ("identity",))
        _, train_predictions, _ = experiment.identity_predictions(baseline, backbone, global_head, train_identity)
        local_train = experiment.local_training_examples(
            baseline, repo_root, train_frames, annotations,
            {item["frameId"]: item for item in train_predictions}, ROI_SIZE_FRACTION, seed + 1,
        )
        local_features = baseline.extract_features(backbone, local_train)
        local_head, local_training = experiment.train_fixed_head(
            baseline, f"{heldout}-local", local_features, local_train, args.epochs,
            checkpoint_dir / "loso" / heldout / "local.head.pt", seed + 1,
        )
        local_test, rois = experiment.local_evaluation_examples(
            baseline, repo_root, test_frames, annotations, global_by_id, ROI_SIZE_FRACTION,
        )
        _, local_predictions, _ = experiment.identity_predictions(baseline, backbone, local_head, local_test)
        refined, records = experiment.summarize_candidate(
            baseline, test_frames, annotations, global_by_id, local_predictions, rois,
        )
        folds[heldout] = {
            "heldoutSession": heldout,
            "trainSessions": [session for session in SESSIONS if session != heldout],
            "counts": {
                "total": len(test_frames),
                "positive": sum(bool(annotations[frame["frameId"]]["objects"]) for frame in test_frames),
                "negative": sum(not annotations[frame["frameId"]]["objects"] for frame in test_frames),
            },
            "global": experiment.summarize_global(global_metrics, test_frames, annotations),
            "globalToLocal": refined,
            "presence": presence_summary(records, baseline),
            "training": {"global": global_training, "local": local_training},
        }
        all_records.extend(records)
        print(f"completed {heldout} fold", flush=True)

    gate = evaluate_gate(folds)
    onnx_result = {"exported": False, "reason": "cross-session gate failed", "models": {}}
    final_training = None
    if gate["passed"]:
        all_full = experiment.full_examples(baseline, repo_root, frames, annotations, baseline.AUGMENTATIONS)
        all_features = baseline.extract_features(backbone, all_full)
        global_head, global_training = experiment.train_fixed_head(
            baseline, "all-development-global", all_features, all_full, args.epochs,
            checkpoint_dir / "selected" / "global.head.pt", SEED + 1000,
        )
        all_identity = experiment.full_examples(baseline, repo_root, frames, annotations, ("identity",))
        _, global_predictions, _ = experiment.identity_predictions(baseline, backbone, global_head, all_identity)
        local_train = experiment.local_training_examples(
            baseline, repo_root, frames, annotations,
            {item["frameId"]: item for item in global_predictions}, ROI_SIZE_FRACTION, SEED + 1001,
        )
        local_features = baseline.extract_features(backbone, local_train)
        local_head, local_training = experiment.train_fixed_head(
            baseline, "all-development-local", local_features, local_train, args.epochs,
            checkpoint_dir / "selected" / "local.head.pt", SEED + 1001,
        )
        export_dir.mkdir(parents=True, exist_ok=True)
        global_onnx = baseline.export_and_compare("global-keypoint", backbone, global_head, all_identity[0].tensor, export_dir)
        local_onnx = baseline.export_and_compare("local-refinement-keypoint", backbone, local_head, local_train[0].tensor, export_dir)
        for result in (global_onnx, local_onnx):
            onnx.checker.check_model(onnx.load(result["path"]))
            result["checkerPassed"] = True
            result["parityPassed"] = result["maxAbsoluteDifference"] <= 1e-5
        onnx_result = {"exported": True, "models": {"global": global_onnx, "local": local_onnx}}
        final_training = {"global": global_training, "local": local_training}

    results = {
        "status": "complete",
        "protocol": {
            "sessions": SESSIONS,
            "totalFrames": len(frames),
            "method": "seven-fold leave-one-session-out",
            "checkpointSelection": "fixed final epoch; held-out session never used for training or selection",
            "confidenceThreshold": CONFIDENCE_THRESHOLD,
            "localRoiFractionOfImageWidth": ROI_SIZE_FRACTION,
            "epochs": args.epochs,
            "augmentations": baseline.AUGMENTATIONS,
            "session014Accessed": False,
            "externalBenchmarkAccessed": False,
        },
        "folds": folds,
        "pooledPresence": presence_summary(all_records, baseline),
        "crossSessionGate": gate,
        "catastrophicCollapse": not gate["passed"],
        "selectedResearchTraining": final_training,
        "onnx": onnx_result,
        "elapsedSeconds": time.time() - started,
    }
    (run_dir / "results.json").write_text(json.dumps(results, indent=2, default=float), encoding="utf-8")
    (run_dir / "predictions.json").write_text(json.dumps(all_records, indent=2, default=float), encoding="utf-8")
    print(json.dumps({"results": str(run_dir / "results.json"), "gate": gate, "onnx": onnx_result}, indent=2))


if __name__ == "__main__":
    main()

