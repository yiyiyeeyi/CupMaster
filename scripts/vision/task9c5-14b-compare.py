#!/usr/bin/env python3
"""Create the private Task 9C-5.14B comparison summary."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any


GROUPS = {
    "sessions001To004": ("session-001", "session-002", "session-003", "session-004"),
    "sessions011To013": ("session-011", "session-012", "session-013"),
    "sessions015To019": ("session-015", "session-016", "session-017", "session-018", "session-019"),
}
CORRECTED_IDS = (
    "session-016-t002000", "session-019-t000000", "session-019-t000500",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", type=Path, required=True)
    return parser.parse_args()


def macro(results: dict[str, Any], sessions: tuple[str, ...]) -> dict[str, float]:
    folds = [results["targeted"][session] for session in sessions]
    return {
        "presenceRecall": statistics.fmean(fold["presenceTip"]["presence"]["positiveRecall"] for fold in folds),
        "specificity": statistics.fmean(fold["presenceTip"]["presence"]["negativeSpecificity"] for fold in folds),
        "regionRecall": statistics.fmean(fold["spoutRegion"]["positiveDetectionRecall"] for fold in folds),
        "tipMean": statistics.fmean(fold["tip"]["mean"] for fold in folds),
    }


def recognition(records: list[dict[str, Any]], annotations: dict[str, dict[str, Any]], state: str) -> dict[str, Any]:
    selected = [
        record for record in records
        if record["positive"] and annotations[record["frameId"]]["selectionMetadata"]["waterOnHint"] == state
    ]
    accepted = sum(record["presenceAccepted"] for record in selected)
    return {
        "count": len(selected), "accepted": accepted,
        "recall": accepted / len(selected) if selected else None,
        "probabilities": {record["frameId"]: record["presenceProbability"] for record in selected},
    }


def main() -> None:
    args = parse_args()
    work_root = args.work_root.resolve()
    old = json.loads((work_root / "eval/task-9c5-13/results.json").read_text(encoding="utf-8"))
    new = json.loads((work_root / "eval/task-9c5-14b/results.json").read_text(encoding="utf-8"))
    predictions = json.loads((work_root / "eval/task-9c5-14b/predictions.json").read_text(encoding="utf-8"))
    normalized = json.loads((
        work_root / "datasets/task-9c5-11/annotations/task-9c5-11-targeted-v1.corrected.normalized.json"
    ).read_text(encoding="utf-8"))
    annotations = {item["frameId"]: item for item in normalized["annotations"]}
    session019_records = predictions["targeted"]["session-019"]["presenceTip"]
    session019 = new["targeted"]["session-019"]
    all_records = [
        record for session in predictions["targeted"].values() for record in session["presenceTip"]
    ]
    corrected = []
    for frame_id in CORRECTED_IDS:
        record = next(record for record in all_records if record["frameId"] == frame_id)
        corrected.append({
            "frameId": frame_id,
            "presenceProbability": record["presenceProbability"],
            "presenceAccepted": record["presenceAccepted"],
            "normalizedTipError": record["argmax"]["normalizedError"],
        })
    output = {
        "status": "complete",
        "annotationQa": {
            "targetRecords": 51,
            "positive": sum(item["kind"] == "positive" for item in normalized["annotations"]),
            "negative": sum(item["kind"] == "intentional_negative" for item in normalized["annotations"]),
            "positiveWaterOn": sum(item["kind"] == "positive" and item["selectionMetadata"]["waterOnHint"] == "yes" for item in normalized["annotations"]),
            "positiveWaterOff": sum(item["kind"] == "positive" and item["selectionMetadata"]["waterOnHint"] == "no" for item in normalized["annotations"]),
            "dripperCoverage": sum(item["dripper"] is not None for item in normalized["annotations"]),
        },
        "correctedFrames": corrected,
        "session019": {
            "presenceRecall": session019["presenceTip"]["presence"]["positiveRecall"],
            "specificity": session019["presenceTip"]["presence"]["negativeSpecificity"],
            "waterOff": recognition(session019_records, annotations, "no"),
            "waterOn": recognition(session019_records, annotations, "yes"),
            "tip": session019["tip"],
        },
        "qualityBuckets": {
            "task9c5_13": old["qualityBuckets"]["targeted"],
            "task9c5_14b": new["qualityBuckets"]["targeted"],
        },
        "hardNegatives": {
            "task9c5_13": old["domain"]["targeted"]["hardNegatives"],
            "task9c5_14b": new["domain"]["targeted"]["hardNegatives"],
        },
        "groups": {
            name: {"task9c5_13": macro(old, sessions), "task9c5_14b": macro(new, sessions)}
            for name, sessions in GROUPS.items()
        },
        "session014Accessed": False,
        "externalBenchmarkAccessed": False,
    }
    destination = work_root / "eval/task-9c5-14b/comparison.json"
    destination.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
