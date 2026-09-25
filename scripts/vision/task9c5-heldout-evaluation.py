#!/usr/bin/env python3
"""Task 9C-5 one-shot held-out evaluation on first-party session-004."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np


SCRIPT_DIR = Path(__file__).resolve().parent
RUNNER_PATH = SCRIPT_DIR / "task9c4-hybrid-video.py"
SPEC = importlib.util.spec_from_file_location("task9c4_hybrid_video", RUNNER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import frozen runner from {RUNNER_PATH}")
runner = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = runner
SPEC.loader.exec_module(runner)

SESSION = "session-004"
SEED = 20260925

# Frozen before model output was inspected. Boundaries come from the manual
# whole-video audit at 2 s and 0.5 s sampling resolution, supported by the
# authoritative sparse annotations. They are event truth, not tuning windows.
VISIBLE_INTERVALS = (
    (94.5, 116.5),
    (142.5, 155.0),
    (176.5, 188.0),
    (214.5, 221.5),
    (252.5, 267.0),
)

EVENT_AUDIT = (
    {"start": 0.0, "end": 76.0, "type": "preparation/interference", "detail": "coffee loading, bed preparation, hand and brewer interaction"},
    {"start": 76.0, "end": 94.5, "type": "absence", "detail": "empty setup before first pour"},
    {"start": 94.5, "end": 116.5, "type": "active_pour", "detail": "entry through top edge; continuous first pour"},
    {"start": 116.5, "end": 142.5, "type": "absence", "detail": "clear first exit"},
    {"start": 142.5, "end": 155.0, "type": "active_pour", "detail": "second entry and pour"},
    {"start": 155.0, "end": 176.5, "type": "absence/interference", "detail": "exit followed by hand adjustment around 166–175 s"},
    {"start": 176.5, "end": 188.0, "type": "active_pour", "detail": "third entry and pour"},
    {"start": 188.0, "end": 214.5, "type": "absence/interference", "detail": "exit followed by hand adjustment around 204–214 s"},
    {"start": 214.5, "end": 221.5, "type": "active_pour", "detail": "fourth entry and shorter pour"},
    {"start": 221.5, "end": 252.5, "type": "absence/interference", "detail": "exit and brewer/hand adjustment around 236–251 s"},
    {"start": 252.5, "end": 267.0, "type": "active_pour", "detail": "fifth entry and pour"},
    {"start": 267.0, "end": 292.0, "type": "absence", "detail": "clear final exit"},
    {"start": 292.0, "end": 309.18, "type": "scene_transition", "detail": "brewer removed and server/cup handling; no usable spout"},
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument("--skip-video", action="store_true")
    parser.add_argument("--render-only", action="store_true")
    return parser.parse_args()


def visible_at(seconds: float) -> bool:
    return any(start <= seconds < end for start, end in VISIBLE_INTERVALS)


def load_heldout(repo_root: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], Path, Path]:
    manifest_path = repo_root / "data/vision/frames/feasibility-v1/manifests/cupmaster-spout-first-party-v1.training-ready.json"
    annotation_path = repo_root / "data/vision/annotations/feasibility-v1/first-party-v1.training-ready.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    payload = json.loads(annotation_path.read_text(encoding="utf-8"))
    annotations = {
        item["frameId"]: item
        for annotation_pass in payload["passes"]
        for item in annotation_pass["annotations"]
    }
    frames = [item for item in manifest["frames"] if item["sessionId"] == SESSION]
    if len(frames) != 22:
        raise RuntimeError(f"Expected 22 held-out session-004 frames, got {len(frames)}")
    if sum(bool(annotations[item["frameId"]]["objects"]) for item in frames) != 14:
        raise RuntimeError("Expected 14 held-out positives")
    return frames, annotations, manifest_path, annotation_path


def keypoint_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [item for item in records if item["groundTruthPositive"]]
    located = [item for item in positives if item["accepted"]]
    negatives = [item for item in records if not item["groundTruthPositive"]]
    normalized = [item["normalizedError"] for item in located if item["normalizedError"] is not None]
    return {
        "positives": len(positives),
        "located": len(located),
        "missRate": (len(positives) - len(located)) / len(positives),
        "negativeFalsePositiveCount": sum(item["accepted"] for item in negatives),
        "negativeFalsePositiveRate": sum(item["accepted"] for item in negatives) / len(negatives),
        "pixelError": runner.distribution(item["pixelError"] for item in located),
        "normalizedError": runner.distribution(normalized),
        "normalizedEligible": len(normalized),
        "normalizedExcludedMissingGeometry": len(located) - len(normalized),
    }


def evaluate_static(
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    adapters: Any,
) -> dict[str, Any]:
    detector_records = []
    mode_a_records = []
    mode_b_records = []
    for frame_record in frames:
        frame_id = frame_record["frameId"]
        annotation = annotations[frame_id]
        positive = bool(annotation["objects"])
        path = repo_root / "data/vision" / frame_record["path"]
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"Could not read held-out image {path}")
        detector = adapters.detector(image)
        expected_bbox = annotation["objects"][0]["bbox"] if positive else None
        expected_tip = annotation["objects"][0]["spoutTip"] if positive else None
        iou = runner.baseline.bbox_iou(detector["bbox"], expected_bbox) if positive else None
        bbox_valid = (
            detector["bbox"]["xMax"] - detector["bbox"]["xMin"] >= 2
            and detector["bbox"]["yMax"] - detector["bbox"]["yMin"] >= 2
        )
        padded_roi = (
            runner.expand_roi(detector["bbox"], image.shape[1], image.shape[0])
            if bbox_valid else None
        )
        inside_raw = runner.point_in_roi(expected_tip, detector["bbox"]) if positive and bbox_valid else False if positive else None
        inside_padded = runner.point_in_roi(expected_tip, padded_roi) if positive and padded_roi is not None else False if positive else None
        detector_records.append({
            "frameId": frame_id,
            "groundTruthPositive": positive,
            "confidence": detector["confidence"],
            "accepted": detector["accepted"],
            "bbox": detector["bbox"],
            "iou": iou,
            "tipInsideRaw": inside_raw,
            "tipInsidePadded": inside_padded,
            "paddedRoi": padded_roi,
            "paddedRoiTouchesBoundary": padded_roi is not None and (
                padded_roi["xMin"] <= 0 or padded_roi["yMin"] <= 0
                or padded_roi["xMax"] >= image.shape[1] or padded_roi["yMax"] >= image.shape[0]
            ),
        })

        full = adapters.keypoint(image, None)
        mode_a_records.append(keypoint_record(frame_id, positive, annotation, full))

        if detector["accepted"] and padded_roi is not None:
            roi_keypoint = adapters.keypoint(image, padded_roi)
            mode_b_records.append(keypoint_record(frame_id, positive, annotation, roi_keypoint))
        else:
            mode_b_records.append({
                "frameId": frame_id,
                "groundTruthPositive": positive,
                "accepted": False,
                "confidence": None,
                "point": None,
                "pixelError": None,
                "normalizedError": None,
                "failure": "detector_acquisition_failure",
            })

    positives = [item for item in detector_records if item["groundTruthPositive"]]
    negatives = [item for item in detector_records if not item["groundTruthPositive"]]
    accepted_positives = [item for item in positives if item["accepted"]]
    return {
        "detection": {
            "threshold": runner.DETECTOR_THRESHOLD,
            "positiveAcquisitionRecall": len(accepted_positives) / len(positives),
            "positiveRecallIoU50": sum(item["accepted"] and item["iou"] >= 0.5 for item in positives) / len(positives),
            "negativeFalsePositiveRate": sum(item["accepted"] for item in negatives) / len(negatives),
            "bboxIoUAcceptedPositives": runner.distribution(item["iou"] for item in accepted_positives),
            "tipContainmentBeforePaddingAllPositives": sum(item["accepted"] and item["tipInsideRaw"] for item in positives) / len(positives),
            "tipContainmentAfterPaddingAllPositives": sum(item["accepted"] and item["tipInsidePadded"] for item in positives) / len(positives),
            "tipContainmentBeforePaddingAccepted": sum(item["tipInsideRaw"] for item in accepted_positives) / max(1, len(accepted_positives)),
            "tipContainmentAfterPaddingAccepted": sum(item["tipInsidePadded"] for item in accepted_positives) / max(1, len(accepted_positives)),
            "acceptedPositiveCount": len(accepted_positives),
            "positiveCount": len(positives),
            "negativeCount": len(negatives),
            "records": detector_records,
        },
        "modeA": {"method": "frozen full-frame keypoint", "threshold": runner.FULL_FRAME_KEYPOINT_THRESHOLD,
                  "metrics": keypoint_summary(mode_a_records), "records": mode_a_records},
        "modeB": {"method": "frozen detector -> 30% padded ROI -> jitter-trained keypoint",
                  "detectorThreshold": runner.DETECTOR_THRESHOLD, "keypointThreshold": runner.ROI_KEYPOINT_THRESHOLD,
                  "metrics": keypoint_summary(mode_b_records), "records": mode_b_records},
    }


def keypoint_record(
    frame_id: str,
    positive: bool,
    annotation: dict[str, Any],
    prediction: dict[str, Any],
) -> dict[str, Any]:
    error = None
    normalized = None
    if positive and prediction["accepted"]:
        target = annotation["objects"][0]["spoutTip"]
        error = runner.point_distance(prediction["point"], target)
        dripper = annotation.get("dripper")
        if dripper and dripper.get("radiusX", 0) > 0 and dripper.get("radiusY", 0) > 0:
            normalized = error / math.sqrt(dripper["radiusX"] * dripper["radiusY"])
    return {
        "frameId": frame_id,
        "groundTruthPositive": positive,
        "accepted": prediction["accepted"],
        "confidence": prediction["confidence"],
        "point": prediction.get("point"),
        "pixelError": error,
        "normalizedError": normalized,
    }


def heldout_temporal_metrics(run: dict[str, Any]) -> dict[str, Any]:
    lost_events = [item for item in run["transitions"] if item["to"] == "LOST"]
    reacquired_events = [item for item in run["transitions"] if item["to"] == "REACQUIRED"]
    exit_records = []
    for index, (_, exit_seconds) in enumerate(VISIBLE_INTERVALS):
        next_entry = VISIBLE_INTERVALS[index + 1][0] if index + 1 < len(VISIBLE_INTERVALS) else run["boundsSeconds"][1]
        match = next((event for event in lost_events if exit_seconds <= event["timestampMs"] / 1000.0 < next_entry), None)
        anchor_record = min(run["records"], key=lambda item: abs(item["timestampMs"] / 1000.0 - exit_seconds))
        anchor = anchor_record["emittedPoint"]
        max_displacement = None
        if match is not None and anchor is not None:
            points = [
                item["emittedPoint"] for item in run["records"]
                if exit_seconds * 1000 <= item["timestampMs"] <= match["timestampMs"] and item["emittedPoint"] is not None
            ]
            max_displacement = max((runner.point_distance(anchor, point) for point in points), default=0.0)
        exit_records.append({
            "trueExitSeconds": exit_seconds,
            "lostTimestampSeconds": match["timestampMs"] / 1000.0 if match else None,
            "delaySeconds": match["timestampMs"] / 1000.0 - exit_seconds if match else None,
            "reason": match["reason"] if match else None,
            "maximumAnchorDisplacementPxBeforeLost": max_displacement,
        })
    reentry_records = []
    for entry_seconds, interval_end in VISIBLE_INTERVALS[1:]:
        match = next(
            (event for event in reacquired_events if entry_seconds <= event["timestampMs"] / 1000.0 < interval_end),
            None,
        )
        reentry_records.append({
            "trueReentrySeconds": entry_seconds,
            "reacquiredTimestampSeconds": match["timestampMs"] / 1000.0 if match else None,
            "latencySeconds": match["timestampMs"] / 1000.0 - entry_seconds if match else None,
        })
    false_lost = [event for event in lost_events if visible_at(event["timestampMs"] / 1000.0)]
    false_reacquired = [event for event in reacquired_events if not visible_at(event["timestampMs"] / 1000.0)]
    segments = [
        (item["start_ms"] / 1000.0, (item["end_ms"] or item["start_ms"]) / 1000.0)
        for item in run["segments"]
    ]
    continuity = []
    false_splits = 0
    for interval in VISIBLE_INTERVALS:
        intersections = [runner.overlap(interval, segment) for segment in segments]
        positive = [value for value in intersections if value > 0]
        continuity.append(max(positive, default=0.0) / (interval[1] - interval[0]))
        false_splits += max(0, len(positive) - 1)
    false_merges = sum(sum(runner.overlap(interval, segment) > 0 for interval in VISIBLE_INTERVALS) > 1 for segment in segments)
    absence_crossings = sum(
        sum(segment[0] < left[1] and segment[1] > right[0] for segment in segments)
        for left, right in zip(VISIBLE_INTERVALS, VISIBLE_INTERVALS[1:])
    )
    presence_observations = [item for item in run["records"] if item["presenceDecision"] is not None]
    visible_presence = [item for item in presence_observations if visible_at(item["timestampMs"] / 1000.0)]
    absent_presence = [item for item in presence_observations if not visible_at(item["timestampMs"] / 1000.0)]
    false_absent = [item for item in visible_presence if not item["presenceDecision"]]
    false_present = [item for item in absent_presence if item["presenceDecision"]]
    return {
        "truth": {"visibleIntervals": VISIBLE_INTERVALS, "trueSegmentCount": len(VISIBLE_INTERVALS), "audit": EVENT_AUDIT},
        "presence": {
            "observationCount": len(presence_observations),
            "visibleObservationCount": len(visible_presence),
            "absentObservationCount": len(absent_presence),
            "falsePresentCount": len(false_present),
            "falsePresentRate": len(false_present) / max(1, len(absent_presence)),
            "falseAbsentCount": len(false_absent),
            "falseAbsentRate": len(false_absent) / max(1, len(visible_presence)),
            "falsePresentTimestampsSeconds": [item["timestampMs"] / 1000.0 for item in false_present],
            "falseAbsentTimestampsSeconds": [item["timestampMs"] / 1000.0 for item in false_absent],
            "denominatorNote": "conditional on frozen gate observations; SEARCHING frames without a detector candidate do not invoke Gate B",
        },
        "trueExits": len(exit_records),
        "trueExitsReachingLost": sum(item["lostTimestampSeconds"] is not None for item in exit_records),
        "exitRecords": exit_records,
        "lostDelaySeconds": runner.distribution(item["delaySeconds"] for item in exit_records if item["delaySeconds"] is not None),
        "falseLostCount": len(false_lost),
        "falseLost": false_lost,
        "trueReentries": len(reentry_records),
        "trueReacquisitions": sum(item["reacquiredTimestampSeconds"] is not None for item in reentry_records),
        "reentryRecords": reentry_records,
        "reacquisitionLatencySeconds": runner.distribution(item["latencySeconds"] for item in reentry_records if item["latencySeconds"] is not None),
        "falseReacquisitionCount": len(false_reacquired),
        "falseReacquisitions": false_reacquired,
        "emittedSegmentCount": len(segments),
        "segmentContinuity": runner.distribution(continuity),
        "falseSegmentSplits": false_splits,
        "falseSegmentMerges": false_merges,
        "segmentsCrossingKnownAbsence": absence_crossings,
    }


def tracking_metrics(
    run: dict[str, Any],
    sparse_predictions: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    disagreements = []
    raw_steps = []
    previous = None
    for item in run["records"]:
        if item["semanticPoint"] is not None and item["trackerPoint"] is not None:
            disagreements.append(runner.point_distance(item["semanticPoint"], item["trackerPoint"]))
        if item["emittedPoint"] is not None and item["segmentId"] is not None:
            if previous is not None and previous["segmentId"] == item["segmentId"]:
                raw_steps.append(runner.point_distance(previous["emittedPoint"], item["emittedPoint"]))
            previous = item
        else:
            previous = None
    located = [item for item in sparse_predictions if item["positive"] and item["point"] is not None]
    worst = max(located, key=lambda item: item["errorPx"], default=None)
    disagreement_events = [
        {"timestampSeconds": item["timestampMs"] / 1000.0, "reason": event["reason"]}
        for item in run["records"] for event in item["events"]
        if event["reason"] == "semantic_tracker_disagreement"
    ]
    return {
        "sparseJitter": runner.sparse_jitter(sparse_predictions, annotations),
        "sparseWorstDrift": worst,
        "semanticTrackerDisagreementPx": runner.distribution(disagreements),
        "semanticTrackerDisagreementEvents": disagreement_events,
        "rawFrameStepPx": runner.distribution(raw_steps),
        "rawFrameStepDefinition": "frame-to-frame emitted displacement within a segment; diagnostic only, not ground-truth-corrected jitter",
    }


def render_static_visuals(
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    static: dict[str, Any],
    output_root: Path,
) -> dict[str, Any]:
    output_root.mkdir(parents=True, exist_ok=True)
    detector = {item["frameId"]: item for item in static["detection"]["records"]}
    mode_a = {item["frameId"]: item for item in static["modeA"]["records"]}
    mode_b = {item["frameId"]: item for item in static["modeB"]["records"]}
    thumbs = []
    failure_paths = []
    for frame_record in frames:
        frame_id = frame_record["frameId"]
        image = cv2.imread(str(repo_root / "data/vision" / frame_record["path"]), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"Could not render {frame_id}")
        canvas = cv2.resize(image, (270, 480), interpolation=cv2.INTER_AREA)
        scale_x = 270 / image.shape[1]
        scale_y = 480 / image.shape[0]

        def point(value: dict[str, float]) -> tuple[int, int]:
            return round(value["x"] * scale_x), round(value["y"] * scale_y)

        def rectangle(value: dict[str, float], color: tuple[int, int, int], thickness: int) -> None:
            cv2.rectangle(
                canvas,
                point({"x": value["xMin"], "y": value["yMin"]}),
                point({"x": value["xMax"], "y": value["yMax"]}),
                color,
                thickness,
            )

        annotation = annotations[frame_id]
        if annotation["objects"]:
            rectangle(annotation["objects"][0]["bbox"], (0, 255, 0), 2)
            cv2.circle(canvas, point(annotation["objects"][0]["spoutTip"]), 5, (0, 255, 0), -1)
        detection = detector[frame_id]
        if detection["accepted"]:
            rectangle(detection["bbox"], (0, 255, 255), 2)
            if detection["paddedRoi"] is not None:
                rectangle(detection["paddedRoi"], (0, 128, 255), 1)
        if mode_a[frame_id]["accepted"]:
            cv2.circle(canvas, point(mode_a[frame_id]["point"]), 5, (255, 255, 0), -1)
        if mode_b[frame_id]["accepted"]:
            cv2.circle(canvas, point(mode_b[frame_id]["point"]), 5, (255, 0, 255), -1)
        lines = [
            frame_id,
            f"GT={'POS' if annotation['objects'] else 'NEG'} det={detection['confidence']:.3f}",
            f"A={mode_a[frame_id]['confidence']} B={mode_b[frame_id]['confidence']}",
        ]
        for index, label in enumerate(lines):
            cv2.putText(canvas, label, (5, 20 + index * 20), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 3, cv2.LINE_AA)
            cv2.putText(canvas, label, (5, 20 + index * 20), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
        thumbs.append(canvas)
        if annotation["objects"] and (
            not detection["accepted"] or not mode_b[frame_id]["accepted"]
            or (mode_b[frame_id]["normalizedError"] or 0) > 0.5
        ):
            path = output_root / f"{frame_id}-failure.jpg"
            cv2.imwrite(str(path), canvas)
            failure_paths.append(str(path))
    columns = 5
    rows = math.ceil(len(thumbs) / columns)
    sheet = np.zeros((rows * 480, columns * 270, 3), dtype=np.uint8)
    for index, thumb in enumerate(thumbs):
        row, column = divmod(index, columns)
        sheet[row * 480:(row + 1) * 480, column * 270:(column + 1) * 270] = thumb
    sheet_path = output_root / "session004-static-heldout-contact-sheet.jpg"
    cv2.imwrite(str(sheet_path), sheet)
    return {"contactSheet": str(sheet_path), "failureExamples": failure_paths, "failureCount": len(failure_paths)}


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = runner.baseline.require_d_drive(args.work_root)
    video_path = repo_root / "data/vision/raw/session-004.mov"
    if video_path.name != "session-004.mov":
        raise RuntimeError("Held-out media allowlist violation")
    frames, annotations, manifest_path, annotation_path = load_heldout(repo_root)
    if args.render_only:
        run_root = work_root / "runs/task-9c5-session004-heldout"
        output_root = work_root / "eval/task-9c5/session004-heldout/static"
        results_path = run_root / "results.json"
        result = json.loads(results_path.read_text(encoding="utf-8"))
        static_visuals = render_static_visuals(repo_root, frames, annotations, result["singleFrame"], output_root)
        result.setdefault("visualQa", {})["static"] = static_visuals
        results_path.write_text(json.dumps(result, indent=2, default=runner.json_default), encoding="utf-8")
        print(json.dumps({"status": "rendered", "static": static_visuals}, indent=2))
        return
    adapters = runner.ModelAdapters(work_root)
    first_image = cv2.imread(str(repo_root / "data/vision" / frames[0]["path"]), cv2.IMREAD_COLOR)
    if first_image is None:
        raise RuntimeError("Could not read warm-up image")
    adapters.warmup(first_image)
    static = evaluate_static(repo_root, frames, annotations, adapters)
    static_presence = runner.evaluate_static_presence(repo_root, frames, annotations, adapters, "B")

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open {video_path}")
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    metadata = {
        "fps": fps,
        "frameCount": frame_count,
        "width": int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
        "height": int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        "durationSeconds": frame_count / fps,
    }
    capture.release()

    for values in adapters.latencies.values():
        values.clear()
    full_run = runner.run_window(video_path, "C", "heldout_full", (0.0, metadata["durationSeconds"]), adapters, presence_gate="B")
    temporal = heldout_temporal_metrics(full_run)
    canonical = {item["frameId"]: runner.record_nearest(full_run["records"], item["timestampMs"]) for item in frames}
    localization, sparse_predictions = runner.localization_metrics(canonical, frames, annotations)
    tracking = tracking_metrics(full_run, sparse_predictions, annotations)
    duration = metadata["durationSeconds"]
    detector_ms = sum(adapters.latencies["detector"])
    keypoint_ms = sum(adapters.latencies["roiKeypoint"])
    presence_ms = sum(adapters.latencies["presenceClassifier"])
    compute = {
        "invocations": full_run["invocations"],
        "invocationsPerVideoSecond": {key: value / duration for key, value in full_run["invocations"].items()},
        "latencyMs": {
            "detector": runner.distribution(adapters.latencies["detector"]),
            "keypoint": runner.distribution(adapters.latencies["roiKeypoint"]),
            "tracker": full_run["trackerLatencyMs"],
            "presence": runner.distribution(adapters.latencies["presenceClassifier"]),
        },
        "semanticDutyCyclePercent": (detector_ms + keypoint_ms + presence_ms) / (full_run["elapsedSeconds"] * 1000.0) * 100.0,
        "trackerDutyCyclePercent": sum(full_run["trackerLatenciesMs"]) / (full_run["elapsedSeconds"] * 1000.0) * 100.0,
        "effectiveOfflineFps": full_run["effectiveFps"],
        "wallSeconds": full_run["elapsedSeconds"],
        "scheduling": "synchronous",
        "queueDepth": 0,
        "droppedInputFrames": 0,
        "warmupMs": adapters.warmup_ms,
    }

    output_root = work_root / "eval/task-9c5/session004-heldout"
    run_root = work_root / "runs/task-9c5-session004-heldout"
    output_root.mkdir(parents=True, exist_ok=True)
    run_root.mkdir(parents=True, exist_ok=True)
    visual_qa = {} if args.skip_video else runner.render_visuals(video_path, full_run, output_root)
    predictions_path = run_root / "predictions.json"
    predictions_path.write_text(json.dumps({
        "static": static,
        "staticPresence": static_presence,
        "continuous": full_run["records"],
        "sparseContinuous": sparse_predictions,
    }, indent=2, default=runner.json_default), encoding="utf-8")
    serializable_run = {
        key: value for key, value in full_run.items()
        if key not in {"records", "trackerLatenciesMs", "presenceLatenciesMs"}
    }
    result = {
        "status": "complete",
        "heldoutDiscipline": {
            "thresholdsChanged": False,
            "retrained": False,
            "checkpointReselected": False,
            "roiPaddingChanged": False,
            "stateMachineChanged": False,
            "technicalBugFixes": [
                "The held-out wrapper now skips ROI padding for rejected detector outputs with degenerate geometry; frozen model and runtime behavior are unchanged."
            ],
            "externalBenchmarkAccessed": False,
            "productionRuntimeModified": False,
        },
        "source": {"path": str(video_path), "sha256": runner.sha256_file(video_path), **metadata},
        "dataset": {
            "session": SESSION,
            "frames": len(frames),
            "positives": 14,
            "negatives": 8,
            "manifest": str(manifest_path),
            "manifestSha256": runner.sha256_file(manifest_path),
            "annotations": str(annotation_path),
            "annotationsSha256": runner.sha256_file(annotation_path),
        },
        "frozenConfiguration": {
            "seed": SEED,
            "detectorThreshold": runner.DETECTOR_THRESHOLD,
            "roiPaddingPerSide": runner.ROI_PADDING,
            "roiSquareConversion": False,
            "roiInput": "224x224 letterbox",
            "roiKeypointThreshold": runner.ROI_KEYPOINT_THRESHOLD,
            "fullFrameKeypointThreshold": runner.FULL_FRAME_KEYPOINT_THRESHOLD,
            "presenceGate": "B",
            "presenceThreshold": runner.PRESENCE_CLASSIFIER_THRESHOLD,
            "presenceHz": runner.PRESENCE_HZ,
            "presenceAbsentConfirmations": runner.PRESENCE_ABSENT_CONFIRMATIONS,
            "tracker": {
                "type": "OpenCV pyramidal Lucas-Kanade",
                "winSize": runner.LkTracker.WIN_SIZE,
                "maxLevel": runner.LkTracker.MAX_LEVEL,
                "forwardBackwardMaxErrorPx": runner.LkTracker.FB_MAX_ERROR,
                "lkMaxError": runner.LkTracker.LK_MAX_ERROR,
                "minimumFeatures": runner.LkTracker.MIN_FEATURES,
                "qualityThreshold": runner.TRACKER_QUALITY_THRESHOLD,
            },
            "semanticCorrectionHz": runner.SEMANTIC_CORRECTION_HZ,
            "antiDriftBboxDiagonalFraction": runner.ANTI_DRIFT_FRACTION,
            "localAttempts": runner.LOCAL_ATTEMPTS,
            "failureTimeoutMs": runner.FAILURE_TIMEOUT_MS,
            "initialConfirmations": runner.INITIAL_CONFIRMATIONS,
            "reacquisitionConfirmations": runner.REACQUISITION_CONFIRMATIONS,
        },
        "models": {name: {"path": str(path), "sha256": runner.sha256_file(path)} for name, path in adapters.paths.items()},
        "singleFrame": static,
        "singleFramePresence": static_presence,
        "continuous": {
            "run": serializable_run,
            "temporal": temporal,
            "localization": localization,
            "sparsePredictions": sparse_predictions,
            "tracking": tracking,
            "compute": compute,
        },
        "visualQa": visual_qa,
        "auditContactSheets": str(work_root / "eval/task-9c5/session004-audit"),
        "predictions": str(predictions_path),
        "sourceCommit": runner.safe_git_head(repo_root),
    }
    results_path = run_root / "results.json"
    results_path.write_text(json.dumps(result, indent=2, default=runner.json_default), encoding="utf-8")
    print(json.dumps({
        "status": "complete",
        "results": str(results_path),
        "predictions": str(predictions_path),
        "singleFrame": static,
        "singleFramePresence": static_presence,
        "temporal": temporal,
        "localization": localization,
        "tracking": tracking,
        "compute": compute,
        "visualQa": visual_qa,
    }, indent=2, default=runner.json_default))


if __name__ == "__main__":
    main()
