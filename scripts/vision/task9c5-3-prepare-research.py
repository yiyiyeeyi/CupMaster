#!/usr/bin/env python3
"""Prepare targeted external-research frames and ensemble tip proposals."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import shutil
import statistics
import sys
import zipfile
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont
from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small


SEED = 20260925
SESSIONS = ("session-011", "session-012", "session-013")
TIMESTAMPS: dict[str, dict[str, list[float]]] = {
    "session-011": {
        "negative": [4, 7, 52, 55, 107, 110, 113],
        "positive": list(range(10, 50, 3)) + list(range(58, 104, 3)),
    },
    "session-012": {
        "negative": [1, 3, 5, 7, 9, 42, 44, 46, 48, 50, 52],
        "positive": list(range(10, 21)) + list(range(25, 40)),
    },
    "session-013": {
        "negative": [2, 7, 12, 17, 22, 27, 32, 128, 133, 138, 143],
        "positive": list(range(36, 124, 3)),
    },
}


def load_module(path: Path, name: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def dhash(image: np.ndarray) -> int:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, (9, 8), interpolation=cv2.INTER_AREA)
    bits = resized[:, 1:] > resized[:, :-1]
    value = 0
    for bit in bits.flatten():
        value = (value << 1) | int(bit)
    return value


def extract(repo_root: Path, output_root: Path) -> list[dict[str, Any]]:
    records = []
    for session in SESSIONS:
        source = repo_root / f"data/vision/raw/{session}.mov"
        capture = cv2.VideoCapture(str(source))
        if not capture.isOpened():
            raise RuntimeError(f"Could not open {source}")
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        hashes: list[tuple[str, int]] = []
        for label in ("negative", "positive"):
            for seconds in TIMESTAMPS[session][label]:
                capture.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
                ok, frame = capture.read()
                if not ok:
                    raise RuntimeError(f"Could not decode {session} at {seconds}s")
                frame_id = f"{session}-t{int(seconds * 1000):06d}"
                directory = output_root / "frames" / session
                directory.mkdir(parents=True, exist_ok=True)
                path = directory / f"{frame_id}.jpg"
                if not cv2.imwrite(str(path), frame, [cv2.IMWRITE_JPEG_QUALITY, 95]):
                    raise RuntimeError(f"Could not write {path}")
                fingerprint = dhash(frame)
                nearest = min(
                    ((other_id, (fingerprint ^ other_hash).bit_count()) for other_id, other_hash in hashes),
                    key=lambda item: item[1], default=(None, None),
                )
                hashes.append((frame_id, fingerprint))
                records.append({
                    "frameId": frame_id, "sessionId": session, "timestampMs": int(seconds * 1000),
                    "path": str(path.relative_to(output_root)).replace("\\", "/"),
                    "width": width, "height": height, "provisionalLabel": label,
                    "sourceType": "external_reference", "researchTrainingEligible": True,
                    "productionTrainingEligible": False, "rightsStatus": "research_only_user_authorized",
                    "nearestPriorFrameId": nearest[0], "nearestPriorDHashDistance": nearest[1],
                    "nearDuplicateFlag": nearest[1] is not None and nearest[1] <= 4,
                })
        capture.release()
    return records


def predict(repo_root: Path, work_root: Path, output_root: Path, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    baseline = load_module(repo_root / "scripts/vision/task9c2-baseline.py", "task9c2_proposal_baseline")
    experiment = load_module(repo_root / "scripts/vision/task9c5-2-global-local-keypoint.py", "task9c5_2_proposal")
    baseline.set_determinism()
    torch.hub.set_dir(str(work_root / "cache/torch/hub"))
    backbone = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1).features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)
    global_heads = []
    local_heads = []
    for fold in ("session-001", "session-002", "session-003", "session-004"):
        global_head = baseline.SpatialHead(576, 2)
        local_head = baseline.SpatialHead(576, 2)
        global_head.load_state_dict(torch.load(work_root / f"checkpoints/task-9c5-2/{fold}/global.head.pt", weights_only=True)["stateDict"])
        local_head.load_state_dict(torch.load(work_root / f"checkpoints/task-9c5-2/{fold}/local-0.65.head.pt", weights_only=True)["stateDict"])
        global_heads.append(global_head.eval())
        local_heads.append(local_head.eval())

    proposals = []
    for record in records:
        image = Image.open(output_root / record["path"]).convert("RGB")
        tensor, geometry = baseline.prepare_image(image, "identity")
        features = baseline.extract_features(backbone, [baseline.Example(record, {"objects": []}, tensor, geometry, 0, (0, 0), (0, 0, 0, 0))])
        global_outputs = [baseline.predict(head, features)[0] for head in global_heads]
        global_points = [baseline.point_from_input(output[1:3], geometry) for output in global_outputs]
        global_point = {
            "x": statistics.median(point[0] for point in global_points),
            "y": statistics.median(point[1] for point in global_points),
        }
        roi = experiment.square_roi((global_point["x"], global_point["y"]), image.width, image.height, 0.65)
        local_tensor, local_geometry = baseline.prepare_image(image, "identity", experiment.roi_tuple(roi))
        local_features = baseline.extract_features(backbone, [baseline.Example(record, {"objects": []}, local_tensor, local_geometry, 0, (0, 0), (0, 0, 0, 0))])
        local_outputs = [baseline.predict(head, local_features)[0] for head in local_heads]
        local_points = [baseline.point_from_input(output[1:3], local_geometry) for output in local_outputs]
        local_point = {
            "x": statistics.median(point[0] for point in local_points),
            "y": statistics.median(point[1] for point in local_points),
        }
        proposals.append({
            **record,
            "globalConfidence": statistics.fmean(float(output[0]) for output in global_outputs),
            "globalPoint": global_point,
            "localConfidence": statistics.fmean(float(output[0]) for output in local_outputs),
            "spoutTipProposal": local_point,
            "localRoi": roi,
            "globalLocalAgreementPx": math.hypot(global_point["x"] - local_point["x"], global_point["y"] - local_point["y"]),
            "reviewStatus": "proposal_unreviewed",
        })
    return proposals


def render(output_root: Path, proposals: list[dict[str, Any]]) -> dict[str, str]:
    paths = {}
    font = ImageFont.load_default()
    for session in SESSIONS:
        thumbs = []
        for record in [item for item in proposals if item["sessionId"] == session]:
            image = Image.open(output_root / record["path"]).convert("RGB")
            image.thumbnail((300, 534), Image.Resampling.LANCZOS)
            sx, sy = image.width / record["width"], image.height / record["height"]
            draw = ImageDraw.Draw(image)
            roi = record["localRoi"]
            draw.rectangle((roi["xMin"] * sx, roi["yMin"] * sy, roi["xMax"] * sx, roi["yMax"] * sy), outline="yellow", width=2)
            for field, color in (("globalPoint", "cyan"), ("spoutTipProposal", "magenta")):
                point = record[field]
                x, y = point["x"] * sx, point["y"] * sy
                draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=color)
            label = "P" if record["provisionalLabel"] == "positive" else "N"
            text = f"{record['timestampMs']/1000:.1f}s {label} g={record['globalConfidence']:.2f} l={record['localConfidence']:.2f} d={record['nearestPriorDHashDistance']}"
            draw.rectangle((0, 0, image.width, 18), fill="black")
            draw.text((3, 3), text, fill="white", font=font)
            thumbs.append(image)
        cols = 5
        cell_w = max(image.width for image in thumbs)
        cell_h = max(image.height for image in thumbs)
        sheet = Image.new("RGB", (cols * cell_w, math.ceil(len(thumbs) / cols) * cell_h), "#202020")
        for index, image in enumerate(thumbs):
            sheet.paste(image, ((index % cols) * cell_w, (index // cols) * cell_h))
        destination = output_root / f"{session}-proposal-contact-sheet.jpg"
        sheet.save(destination, quality=90)
        paths[session] = str(destination)
    return paths


def build_annotation_package(output_root: Path, proposals: list[dict[str, Any]]) -> dict[str, Any]:
    selected = [
        item for item in proposals
        if item["nearestPriorDHashDistance"] is None or item["nearestPriorDHashDistance"] > 1
    ]
    package_root = output_root / "annotation-package"
    images_root = package_root / "images"
    images_root.mkdir(parents=True, exist_ok=True)
    records = []
    for item in selected:
        source = output_root / item["path"]
        destination = images_root / source.name
        shutil.copy2(source, destination)
        records.append({
            "frameId": item["frameId"], "sessionId": item["sessionId"],
            "timestampMs": item["timestampMs"], "filename": destination.name,
            "width": item["width"], "height": item["height"],
            "selectionHintOnly": item["provisionalLabel"],
            "annotationStatus": "manual_review_required",
            "sourceType": "external_reference", "researchTrainingEligible": True,
            "productionTrainingEligible": False,
        })
    package = {
        "version": "task-9c5-3-research-annotation-package-v0",
        "status": "not_training_ready_manual_annotation_required",
        "labels": {
            "trainingTarget": "spout_tip single point for usable positives",
            "analysis": "gooseneck_spout rectangle where practical",
            "normalization": "dripper ellipse where practical",
            "negative": "zero spout_tip and zero gooseneck_spout",
            "removed": "spout_neck_base",
        },
        "proposalPolicy": "proposal overlays are review aids only and are not included as ground truth",
        "frames": records,
    }
    manifest_path = package_root / "annotation-package-manifest.json"
    manifest_path.write_text(json.dumps(package, indent=2), encoding="utf-8")
    zip_path = output_root / "task-9c5-3-annotation-images.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(manifest_path, manifest_path.name)
        for record in records:
            image_path = images_root / record["filename"]
            archive.write(image_path, f"images/{image_path.name}")
    return {
        "manifest": str(manifest_path), "zip": str(zip_path), "total": len(records),
        "perSession": {
            session: {
                "total": sum(item["sessionId"] == session for item in records),
                "positiveHints": sum(item["sessionId"] == session and item["selectionHintOnly"] == "positive" for item in records),
                "negativeHints": sum(item["sessionId"] == session and item["selectionHintOnly"] == "negative" for item in records),
            }
            for session in SESSIONS
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--work-root", type=Path, required=True)
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()
    work_root = args.work_root.resolve()
    output_root = work_root / "datasets/task-9c5-3"
    output_root.mkdir(parents=True, exist_ok=True)
    records = extract(repo_root, output_root)
    proposals = predict(repo_root, work_root, output_root, records)
    sheets = render(output_root, proposals)
    annotation_package = build_annotation_package(output_root, proposals)
    manifest = {
        "datasetVersion": "task-9c5-3-external-research-proposals-v0",
        "status": "proposal_only_manual_review_required",
        "sessions": SESSIONS,
        "session014Accessed": False,
        "externalBenchmark005To010Accessed": False,
        "frames": proposals,
        "contactSheets": sheets,
        "annotationPackage": annotation_package,
    }
    (output_root / "proposal-manifest.json").write_text(json.dumps(manifest, indent=2, default=float), encoding="utf-8")
    for session in SESSIONS:
        selected = [item for item in proposals if item["sessionId"] == session]
        print(session, len(selected), sum(item["provisionalLabel"] == "positive" for item in selected), sum(item["nearDuplicateFlag"] for item in selected))


if __name__ == "__main__":
    main()
