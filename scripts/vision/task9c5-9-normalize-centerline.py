#!/usr/bin/env python3
"""Normalize and QA Task 9C-5.9 CVAT centerline annotations."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import statistics
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


LABEL = "gooseneck_spout_centerline"
SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13))
TIP_PLAUSIBILITY_RADIUS_FRACTION = 0.20
REVERSED_MARGIN_RADIUS_FRACTION = 0.05
PATHOLOGICAL_JUMP_RADIUS_FRACTION = 3.0


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
    parser.add_argument("--export", type=Path, required=True)
    return parser.parse_args()


def parse_points(raw: str) -> list[dict[str, float]]:
    points = []
    for token in raw.split(";"):
        values = token.split(",")
        if len(values) != 2:
            raise ValueError(f"Malformed polyline coordinate: {token!r}")
        x, y = (float(value) for value in values)
        if not math.isfinite(x) or not math.isfinite(y):
            raise ValueError("Polyline coordinate is not finite")
        points.append({"x": x, "y": y})
    return points


def point_distance(first: dict[str, float], second: dict[str, float]) -> float:
    return math.hypot(first["x"] - second["x"], first["y"] - second["y"])


def line_length(points: list[dict[str, float]]) -> float:
    return sum(point_distance(first, second) for first, second in zip(points, points[1:]))


def consecutive_duplicate_indexes(points: list[dict[str, float]], tolerance: float = 1e-6) -> list[int]:
    return [
        index
        for index, (first, second) in enumerate(zip(points, points[1:]), start=1)
        if point_distance(first, second) <= tolerance
    ]


def orientation(a: dict[str, float], b: dict[str, float], c: dict[str, float]) -> float:
    return (b["x"] - a["x"]) * (c["y"] - a["y"]) - (b["y"] - a["y"]) * (c["x"] - a["x"])


def segments_intersect(
    a: dict[str, float], b: dict[str, float], c: dict[str, float], d: dict[str, float],
) -> bool:
    first = orientation(a, b, c)
    second = orientation(a, b, d)
    third = orientation(c, d, a)
    fourth = orientation(c, d, b)
    return first * second < 0 and third * fourth < 0


def self_intersections(points: list[dict[str, float]]) -> list[tuple[int, int]]:
    intersections = []
    for first_index in range(len(points) - 1):
        for second_index in range(first_index + 2, len(points) - 1):
            if segments_intersect(
                points[first_index], points[first_index + 1],
                points[second_index], points[second_index + 1],
            ):
                intersections.append((first_index, second_index))
    return intersections


def distribution(values: Iterable[float]) -> dict[str, float | int | None]:
    ordered = sorted(values)
    if not ordered:
        return {"count": 0, "mean": None, "median": None, "p90": None, "max": None}
    p90_index = min(len(ordered) - 1, math.ceil(0.9 * len(ordered)) - 1)
    return {
        "count": len(ordered), "mean": statistics.fmean(ordered),
        "median": statistics.median(ordered), "p90": ordered[p90_index], "max": ordered[-1],
    }


def parse_export(export_path: Path) -> tuple[ET.Element, str]:
    if not export_path.is_file():
        raise FileNotFoundError(export_path)
    with zipfile.ZipFile(export_path) as archive:
        names = archive.namelist()
        xml_names = [name for name in names if Path(name).name == "annotations.xml"]
        if len(xml_names) != 1:
            raise RuntimeError(f"Expected exactly one annotations.xml, found {xml_names}")
        payload = archive.read(xml_names[0])
    return ET.fromstring(payload), xml_names[0]


def extract_records(root: ET.Element) -> tuple[list[dict[str, Any]], dict[str, int]]:
    records = []
    shape_counts: Counter[str] = Counter()
    for image in root.findall("image"):
        shapes = list(image)
        for shape in shapes:
            shape_counts[shape.tag] += 1
        records.append({
            "imageName": Path(image.attrib["name"]).name,
            "width": int(image.attrib["width"]), "height": int(image.attrib["height"]),
            "shapes": [{"type": shape.tag, "label": shape.attrib.get("label"), "points": shape.attrib.get("points")} for shape in shapes],
        })
    return records, dict(shape_counts)


def audit(
    records: list[dict[str, Any]], manifest: dict[str, Any], annotations: dict[str, dict[str, Any]], manual: Any,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest_by_name = {frame["filename"]: frame for frame in manifest["frames"]}
    export_names = [record["imageName"] for record in records]
    duplicates = sorted(name for name, count in Counter(export_names).items() if count > 1)
    missing = sorted(set(manifest_by_name) - set(export_names))
    unknown = sorted(set(export_names) - set(manifest_by_name))
    fatal: list[str] = []
    review: list[dict[str, Any]] = []
    normalized = []
    if duplicates:
        fatal.append(f"duplicate images: {duplicates}")
    if missing:
        fatal.append(f"missing images: {missing}")
    if unknown:
        fatal.append(f"unknown images: {unknown}")

    for record in records:
        name = record["imageName"]
        if name not in manifest_by_name:
            continue
        manifest_frame = manifest_by_name[name]
        frame_id = manifest_frame["frameId"]
        authoritative = annotations[frame_id]
        if (record["width"], record["height"]) != (manifest_frame["width"], manifest_frame["height"]):
            fatal.append(f"{frame_id}: image dimensions mismatch")
        unsupported = [shape for shape in record["shapes"] if shape["type"] != "polyline" or shape["label"] != LABEL]
        centerlines = [shape for shape in record["shapes"] if shape["type"] == "polyline" and shape["label"] == LABEL]
        if unsupported:
            fatal.append(f"{frame_id}: unsupported shapes {unsupported}")
        if len(centerlines) != 1:
            fatal.append(f"{frame_id}: expected one centerline, found {len(centerlines)}")
            continue
        try:
            points = parse_points(centerlines[0]["points"] or "")
        except (TypeError, ValueError) as error:
            fatal.append(f"{frame_id}: malformed polyline: {error}")
            continue
        issues: list[str] = []
        if len(points) < 2:
            issues.append("fewer_than_two_points")
        out_of_bounds = [
            index for index, point in enumerate(points)
            if point["x"] < 0 or point["x"] > record["width"] or point["y"] < 0 or point["y"] > record["height"]
        ]
        if out_of_bounds:
            issues.append(f"out_of_bounds:{out_of_bounds}")
        duplicates_at = consecutive_duplicate_indexes(points)
        if duplicates_at:
            issues.append(f"duplicate_consecutive_points:{duplicates_at}")
        length = line_length(points)
        if length <= 0:
            issues.append("zero_length")
        intersections = self_intersections(points)
        if intersections:
            issues.append(f"self_intersections:{intersections}")
        dripper = authoritative.get("dripper")
        if not dripper:
            fatal.append(f"{frame_id}: missing authoritative dripper")
            continue
        radius = manual.effective_radius(dripper)
        segments = [point_distance(first, second) for first, second in zip(points, points[1:])]
        if segments and max(segments) > PATHOLOGICAL_JUMP_RADIUS_FRACTION * radius:
            issues.append("pathological_jump")
        objects = authoritative.get("objects", [])
        if len(objects) != 1:
            fatal.append(f"{frame_id}: expected one authoritative positive object, found {len(objects)}")
            continue
        tip = objects[0]["spoutTip"]
        first_distance = point_distance(points[0], tip)
        last_distance = point_distance(points[-1], tip)
        first_normalized = first_distance / radius
        last_normalized = last_distance / radius
        ordering = "pass"
        if last_distance + REVERSED_MARGIN_RADIUS_FRACTION * radius < first_distance \
                and last_normalized <= TIP_PLAUSIBILITY_RADIUS_FRACTION:
            ordering = "reversed_suspect"
            issues.append("last_endpoint_clearly_closer_to_tip")
        elif first_normalized > TIP_PLAUSIBILITY_RADIUS_FRACTION:
            ordering = "uncertain_tip_endpoint"
            issues.append("first_endpoint_implausibly_far_from_tip")
        if issues:
            review.append({
                "frameId": frame_id, "imageName": name, "issues": issues,
                "firstToTipPx": first_distance, "lastToTipPx": last_distance,
                "firstToTipNormalized": first_normalized, "lastToTipNormalized": last_normalized,
                "pointCount": len(points), "lengthPx": length, "lengthNormalized": length / radius,
            })
        normalized.append({
            "frameId": frame_id, "sessionId": manifest_frame["sessionId"],
            "timestampMs": manifest_frame["timestampMs"], "filename": name,
            "width": record["width"], "height": record["height"],
            "dripper": dripper, "objects": objects,
            "gooseneckSpoutCenterline": {"label": LABEL, "points": points, "pointOrder": "outlet_to_kettle_side"},
            "qa": {
                "pointCount": len(points), "lengthPx": length, "lengthNormalized": length / radius,
                "firstToTipPx": first_distance, "lastToTipPx": last_distance,
                "firstToTipNormalized": first_normalized, "lastToTipNormalized": last_normalized,
                "ordering": ordering, "issues": issues,
            },
        })

    by_session = {}
    for session in SESSIONS:
        group = [record for record in normalized if record["sessionId"] == session]
        by_session[session] = {
            "records": len(group),
            "pointCount": distribution(record["qa"]["pointCount"] for record in group),
            "visibleLengthPx": distribution(record["qa"]["lengthPx"] for record in group),
            "visibleLengthOverDripperRadius": distribution(record["qa"]["lengthNormalized"] for record in group),
            "firstEndpointToTipPx": distribution(record["qa"]["firstToTipPx"] for record in group),
            "firstEndpointToTipOverRadius": distribution(record["qa"]["firstToTipNormalized"] for record in group),
        }
    summary = {
        "records": len(records), "normalizedRecords": len(normalized),
        "missing": missing, "unknown": unknown, "duplicateImages": duplicates,
        "fatalErrors": fatal, "manualReview": review,
        "reversedEndpointSuspects": [item["frameId"] for item in review if "last_endpoint_clearly_closer_to_tip" in item["issues"]],
        "uncertainTipEndpoint": [item["frameId"] for item in review if "first_endpoint_implausibly_far_from_tip" in item["issues"]],
        "geometryIssues": [item["frameId"] for item in review if any(issue.startswith(("duplicate_", "self_", "pathological_", "out_of_", "zero_", "fewer_")) for issue in item["issues"])],
        "manualReviewRequired": bool(fatal or review), "bySession": by_session,
        "thresholds": {
            "tipPlausibilityRadiusFraction": TIP_PLAUSIBILITY_RADIUS_FRACTION,
            "reversedMarginRadiusFraction": REVERSED_MARGIN_RADIUS_FRACTION,
            "pathologicalJumpRadiusFraction": PATHOLOGICAL_JUMP_RADIUS_FRACTION,
        },
    }
    return summary, normalized


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    export_path = args.export.resolve()
    data_module = load_module(repo_root / "scripts/vision/task9c5-3-targeted-retraining.py", "task9c5_3_data_959_normalize")
    manual = load_module(repo_root / "scripts/vision/task9c5-5-manual-roi-localization.py", "task9c5_5_manual_959_normalize")
    frames, annotations = data_module.load_records(repo_root, work_root)
    if any(frame["sessionId"] not in SESSIONS for frame in frames):
        raise RuntimeError("Development loader returned forbidden session")
    manifest_path = work_root / "datasets/task-9c5-9/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root, xml_name = parse_export(export_path)
    records, shape_counts = extract_records(root)
    summary, normalized = audit(records, manifest, annotations, manual)
    summary["export"] = str(export_path)
    summary["xmlEntry"] = xml_name
    summary["shapeCounts"] = shape_counts
    output_dir = work_root / "datasets/task-9c5-9/annotations"
    output_dir.mkdir(parents=True, exist_ok=True)
    qa_path = output_dir / "centerline-pilot-v0.qa.json"
    passed = not summary["manualReviewRequired"]
    merged_path = output_dir / (
        "centerline-pilot-v0.training-ready.json" if passed
        else "centerline-pilot-v0.merged.draft.json"
    )
    qa_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    merged_path.write_text(json.dumps({
        "datasetId": "cupmaster-spout-centerline-pilot-v0",
        "status": "training_ready" if passed else "manual_review_required",
        "sourceExport": str(export_path), "annotations": normalized,
    }, indent=2), encoding="utf-8")
    print(json.dumps({"qa": str(qa_path), "merged": str(merged_path), **summary}, indent=2))
    if summary["fatalErrors"] or summary["manualReviewRequired"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
