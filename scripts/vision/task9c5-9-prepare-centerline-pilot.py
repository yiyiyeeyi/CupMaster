#!/usr/bin/env python3
"""Prepare the Task 9C-5.9 human centerline annotation pilot package."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import shutil
import sys
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


SESSIONS = tuple(f"session-{value:03d}" for value in (1, 2, 3, 4, 11, 12, 13))
FORBIDDEN = {"session-014"} | {f"session-{value:03d}" for value in range(5, 11)}
EXPECTED_COUNTS = {
    "session-001": 6,
    "session-002": 6,
    "session-003": 6,
    "session-004": 10,
    "session-011": 10,
    "session-012": 12,
    "session-013": 12,
}
SELECTED = {
    "session-001": (72000, 106000, 150000, 196000, 285000, 297000),
    "session-002": (66000, 75000, 112000, 122000, 162000, 173000),
    "session-003": (10000, 20000, 35000, 45000, 65000, 67000),
    "session-004": (100000, 147000, 150000, 154000, 180000, 187000, 215000, 217000, 253000, 266000),
    "session-011": (4000, 16000, 28000, 40000, 67000, 73000, 79000, 85000, 91000, 97000),
    "session-012": (13000, 14000, 17000, 25000, 26000, 29000, 33000, 36000, 38000, 39000, 42000, 44000),
    "session-013": (36000, 42000, 51000, 57000, 66000, 72000, 78000, 84000, 90000, 96000, 105000, 114000),
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
    return parser.parse_args()


def selected_frame_ids() -> list[str]:
    return [f"{session}-t{timestamp:06d}" for session, timestamps in SELECTED.items() for timestamp in timestamps]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tags_for(frame: dict[str, Any]) -> list[str]:
    session = frame["sessionId"]
    timestamp = frame["timestampMs"]
    tags: list[str] = []
    if session in {"session-001", "session-002", "session-003"}:
        tags.extend(("reference_domain", "first_party"))
    if session == "session-004":
        tags.extend(("dark_spout", "reflective_spout", "top_entry"))
        if timestamp in {147000, 187000, 215000, 217000}:
            tags.extend(("edge_truncation", "task9c5_8_failure"))
        if timestamp >= 180000:
            tags.append("water_overlap")
    if session == "session-011":
        tags.extend(("dark_spout", "curved_segment", "reflection"))
        if timestamp >= 67000:
            tags.extend(("water_overlap", "task9c5_8_failure"))
        if timestamp in {4000, 16000}:
            tags.append("short_visible_segment")
    if session == "session-012":
        tags.extend(("white_spout", "highlight", "right_entry", "task9c5_8_failure"))
        if timestamp <= 29000:
            tags.extend(("short_visible_segment", "edge_truncation"))
        if timestamp >= 17000:
            tags.append("water_overlap")
    if session == "session-013":
        tags.extend(("white_spout", "low_contrast", "task9c5_8_failure"))
        if timestamp <= 57000:
            tags.extend(("short_visible_segment", "edge_truncation"))
        if timestamp >= 42000:
            tags.append("water_overlap")
    return list(dict.fromkeys(tags))


def reason_for(frame: dict[str, Any]) -> str:
    session = frame["sessionId"]
    if session in {"session-001", "session-002", "session-003"}:
        return "reference first-party geometry sampled across distinct pour phases"
    if session == "session-004":
        return "dark reflective/top-edge first-party case, including prior bbox failures"
    if session == "session-011":
        return "dark curved spout with reflection/water/interference variation"
    if session == "session-012":
        return "white highlighted short/right-edge spout from critical failure domain"
    return "white low-contrast/short visible spout from critical collapse domain"


def source_path(repo_root: Path, work_root: Path, frame: dict[str, Any]) -> Path:
    if frame["imageSource"] == "first_party":
        path = (repo_root / "data/vision" / frame["path"]).resolve()
        allowed = (repo_root / "data/vision").resolve()
    elif frame["imageSource"] == "research":
        path = (work_root / "datasets/task-9c5-3/annotation-package/images" / frame["filename"]).resolve()
        allowed = (work_root / "datasets/task-9c5-3/annotation-package/images").resolve()
    else:
        raise RuntimeError(f"Unexpected image source: {frame['imageSource']}")
    if not path.is_relative_to(allowed):
        raise RuntimeError(f"Source path escaped allowlist: {path}")
    return path


def package_filename(frame: dict[str, Any]) -> str:
    if "filename" in frame:
        return str(frame["filename"])
    if "path" in frame:
        return Path(frame["path"]).name
    raise RuntimeError(f"Frame has no package filename: {frame['frameId']}")


def validate_selection(
    frames: list[dict[str, Any]], annotations: dict[str, dict[str, Any]], selected: list[dict[str, Any]],
) -> None:
    expected_ids = set(selected_frame_ids())
    actual_ids = {frame["frameId"] for frame in selected}
    if actual_ids != expected_ids or len(selected) != len(expected_ids):
        raise RuntimeError("Selected frame identity mismatch")
    counts = Counter(frame["sessionId"] for frame in selected)
    if dict(counts) != EXPECTED_COUNTS:
        raise RuntimeError(f"Unexpected per-session counts: {counts}")
    if set(counts) & FORBIDDEN or set(counts) != set(SESSIONS):
        raise RuntimeError("Forbidden or missing session in selection")
    if any(not annotations[frame["frameId"]]["objects"] for frame in selected):
        raise RuntimeError("Pilot selection contains a non-positive frame")
    if len({frame["frameId"] for frame in frames}) != len(frames):
        raise RuntimeError("Development source contains duplicate frame IDs")


def render_contact_sheets(image_dir: Path, records: list[dict[str, Any]], destination: Path) -> list[str]:
    destination.mkdir(parents=True, exist_ok=True)
    paths = []
    per_sheet = 16
    tile_width, tile_height = 300, 585
    columns = 4
    for offset in range(0, len(records), per_sheet):
        page = records[offset:offset + per_sheet]
        rows = (len(page) + columns - 1) // columns
        sheet = Image.new("RGB", (columns * tile_width, rows * tile_height), "white")
        draw = ImageDraw.Draw(sheet)
        for index, record in enumerate(page):
            image = Image.open(image_dir / record["filename"]).convert("RGB")
            image.thumbnail((tile_width - 12, tile_height - 75), Image.Resampling.LANCZOS)
            x = (index % columns) * tile_width
            y = (index // columns) * tile_height
            sheet.paste(image, (x + (tile_width - image.width) // 2, y))
            draw.text((x + 5, y + tile_height - 68), record["frameId"], fill="black")
            draw.text((x + 5, y + tile_height - 48), ", ".join(record["domainTags"][:4]), fill="black")
        path = destination / f"contact-sheet-{offset // per_sheet + 1:02d}.jpg"
        sheet.save(path, quality=90)
        paths.append(str(path))
    return paths


def annotation_instructions() -> str:
    return """# Task 9C-5.9 centerline annotation instructions

## Tool and format

Use CVAT for Images with one label named exactly `gooseneck_spout_centerline` and shape type **polyline**.
Export as CVAT for images 1.1. Do not add rectangles, points, masks, or automatic/model-generated centerlines to this task.

## Polyline rule

Draw exactly one ordered polyline on every image:

1. Point 0 must be the center of the physical liquid outlet (`spout_tip`).
2. Continue from the outlet toward the kettle-side visible tube, following the tube center.
3. Stop at the final clearly visible spout point or the image boundary.
4. Use enough points to follow visible curvature; avoid dense redundant points on straight sections.

Include only the visibly identifiable physical tube. Do not infer off-frame geometry, bridge fully occluded sections, or include water, hand, reflection, kettle body, dripper rim, or background edges. Variable point count and variable visible length are expected. A very short segment is valid when its physical structure is identifiable.

## Review checklist

- Every one of the 62 images has exactly one polyline.
- The first point is the physical outlet, not the end of the water stream.
- Point order always runs outlet → kettle side.
- The polyline stays centered within the visible tube.
- No accidental duplicate polyline exists.
- Difficult/ambiguous frames are flagged for review rather than guessed.

Do not begin training until the export has been normalized and human-reviewed.
"""


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    data_module = load_module(repo_root / "scripts/vision/task9c5-3-targeted-retraining.py", "task9c5_3_data_959")
    frames, annotations = data_module.load_records(repo_root, work_root)
    selected_ids = set(selected_frame_ids())
    selected = sorted(
        (frame for frame in frames if frame["frameId"] in selected_ids),
        key=lambda frame: (frame["sessionId"], frame["timestampMs"]),
    )
    validate_selection(frames, annotations, selected)

    output_root = work_root / "datasets/task-9c5-9"
    image_dir = output_root / "images"
    contact_dir = output_root / "contact-sheets"
    image_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for frame in selected:
        source = source_path(repo_root, work_root, frame)
        filename = package_filename(frame)
        destination = image_dir / filename
        shutil.copy2(source, destination)
        with Image.open(destination) as image:
            width, height = image.size
        if (width, height) != (frame["width"], frame["height"]):
            raise RuntimeError(f"Image dimension mismatch: {frame['frameId']}")
        records.append({
            "frameId": frame["frameId"], "sessionId": frame["sessionId"],
            "timestampMs": frame["timestampMs"], "filename": filename,
            "width": width, "height": height, "knownPositive": True,
            "selectionReason": reason_for(frame), "domainTags": tags_for(frame),
            "annotationStatus": "pending_human", "requiredShapeCount": 1,
            "requiredLabel": "gooseneck_spout_centerline", "requiredShapeType": "polyline",
            "sha256": sha256_file(destination),
        })

    contact_sheets = render_contact_sheets(image_dir, records, contact_dir)
    manifest = {
        "datasetId": "cupmaster-spout-centerline-pilot-v0",
        "task": "Task 9C-5.9 human visible-spout centerline pilot",
        "annotationAuthority": "human-reviewed CVAT polyline export",
        "annotationStatus": "pending_human",
        "label": "gooseneck_spout_centerline",
        "pointOrder": "point 0 is spout_tip; subsequent points run toward visible kettle-side tube",
        "frameCount": len(records), "positiveCount": len(records), "negativeCount": 0,
        "countsBySession": dict(Counter(record["sessionId"] for record in records)),
        "session014Accessed": False, "externalBenchmarkAccessed": False,
        "frames": records,
    }
    (output_root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (output_root / "ANNOTATION-INSTRUCTIONS.md").write_text(annotation_instructions(), encoding="utf-8")
    with zipfile.ZipFile(output_root / "task-9c5-9-cvat-images.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for record in records:
            archive.write(image_dir / record["filename"], arcname=record["filename"])
    summary = {
        "status": "awaiting_human_annotation",
        "manifest": str(output_root / "manifest.json"),
        "imageDirectory": str(image_dir),
        "uploadZip": str(output_root / "task-9c5-9-cvat-images.zip"),
        "instructions": str(output_root / "ANNOTATION-INSTRUCTIONS.md"),
        "contactSheets": contact_sheets,
        "count": len(records), "countsBySession": manifest["countsBySession"],
        "trainingStarted": False,
    }
    (output_root / "package-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
