#!/usr/bin/env python3
"""Task 9C-4 offline continuous-video hybrid prototype.

The loader is hard-limited to session-003. Generated video, predictions, and
metrics must be written below the ignored D-drive .vision-work tree.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import statistics
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
BASELINE_PATH = SCRIPT_DIR / "task9c2-baseline.py"
SPEC = importlib.util.spec_from_file_location("task9c2_baseline", BASELINE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import baseline tooling from {BASELINE_PATH}")
baseline = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = baseline
SPEC.loader.exec_module(baseline)

SEED = 20260925
SESSION = "session-003"
DETECTOR_THRESHOLD = 0.70
ROI_KEYPOINT_THRESHOLD = 0.50
FULL_FRAME_KEYPOINT_THRESHOLD = 0.70
ROI_PADDING = 0.30
DETECTOR_HZ = 2.0
SEMANTIC_CORRECTION_HZ = 5.0
TRACKER_QUALITY_THRESHOLD = 0.50
ANTI_DRIFT_FRACTION = 0.20
INITIAL_CONFIRMATIONS = 3
REACQUISITION_CONFIRMATIONS = 2
LOCAL_ATTEMPTS = 2
FAILURE_TIMEOUT_MS = 400.0
PRESENCE_HZ = 5.0
PRESENCE_CLASSIFIER_THRESHOLD = 0.50
PRESENCE_ABSENT_CONFIRMATIONS = 2
BASELINE_FALSE_LOST_PRIMARY_REPEAT = 3

WINDOWS = {
    "primary": (7.75, 47.50),
    "clean_tracking": (32.00, 45.50),
    "exit_lost": (21.75, 23.50),
    "reacquisition": (30.50, 32.50),
    "edge_hand": (5.00, 10.75),
    "repeat_cycle": (61.50, 69.50),
}

TRUE_VISIBLE = {
    "primary": ((8.25, 22.25), (31.25, 45.75)),
    "clean_tracking": ((32.00, 45.50),),
    "exit_lost": ((21.75, 22.25),),
    "reacquisition": ((31.25, 32.50),),
    "edge_hand": ((8.25, 10.75),),
    "repeat_cycle": ((62.25, 68.00),),
}

EVENT_TRUTH = {
    "primary": {"initialEntry": 8.25, "exits": (22.25, 45.75), "reentries": (31.25,)},
    "clean_tracking": {"initialEntry": 32.00, "exits": (), "reentries": ()},
    "exit_lost": {"initialEntry": 21.75, "exits": (22.25,), "reentries": ()},
    "reacquisition": {"initialEntry": 31.25, "exits": (), "reentries": ()},
    "edge_hand": {"initialEntry": 8.25, "exits": (), "reentries": ()},
    "repeat_cycle": {"initialEntry": 62.25, "exits": (68.00,), "reentries": ()},
}

SPARSE_REVIEW = (
    (8.50, "initial_entry"),
    (9.00, "initial_acquisition"),
    (22.50, "first_exit"),
    (31.25, "pre_reentry"),
    (31.50, "reentry"),
    (45.75, "second_exit"),
    (62.25, "repeat_reentry"),
    (68.25, "repeat_exit"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--work-root", type=Path, required=True)
    parser.add_argument("--skip-video", action="store_true")
    parser.add_argument("--render-only", action="store_true")
    parser.add_argument("--presence-experiment", action="store_true")
    parser.add_argument("--presence-finalize-only", action="store_true")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def distribution(values: Iterable[float]) -> dict[str, float | int | None]:
    finite = [float(value) for value in values if math.isfinite(float(value))]
    if not finite:
        return {"count": 0, "mean": None, "median": None, "p90": None, "p99": None, "max": None}
    ordered = sorted(finite)
    return {
        "count": len(ordered),
        "mean": statistics.fmean(ordered),
        "median": statistics.median(ordered),
        "p90": ordered[max(0, math.ceil(0.90 * len(ordered)) - 1)],
        "p99": ordered[max(0, math.ceil(0.99 * len(ordered)) - 1)],
        "max": ordered[-1],
    }


def presence_gate_pass(summary: dict[str, Any]) -> bool:
    """Apply the 9C-4.1 gate relative to the frozen 9C-4 false-LOST baseline."""
    temporal = summary["canonicalTemporal"]
    return (
        temporal["trueExitsReachingLost"] == temporal["trueExits"]
        and temporal["segmentsCrossingKnownAbsence"] == 0
        and temporal["trueReacquisitions"] == temporal["trueReentries"]
        and summary["localization"]["negativeFalsePositiveCount"] == 0
        and temporal["falseLostCount"] <= BASELINE_FALSE_LOST_PRIMARY_REPEAT
        and summary["invocationsPerVideoSecond"]["keypoint"] < 10.0
    )


def presence_gate_decision(summaries: dict[str, Any]) -> dict[str, Any]:
    gate_a_pass = presence_gate_pass(summaries["A"])
    gate_b_pass = presence_gate_pass(summaries["B"])
    selected = "A" if gate_a_pass else "B" if gate_b_pass else None
    reason = (
        "Gate A satisfies the temporal gate; prefer the existing detector and avoid the additional classifier."
        if selected == "A"
        else (
            "Gate B is required: it preserves the frozen 9C-4 false-LOST baseline while Gate A adds a false split."
            if selected == "B"
            else "Neither gate satisfies the temporal safety criteria relative to the frozen 9C-4 baseline."
        )
    )
    return {
        "gateAPass": gate_a_pass,
        "gateBPass": gate_b_pass,
        "selected": selected,
        "reason": reason,
        "falseLostBaseline": BASELINE_FALSE_LOST_PRIMARY_REPEAT,
        "falseLostDelta": {
            gate: summaries[gate]["canonicalTemporal"]["falseLostCount"] - BASELINE_FALSE_LOST_PRIMARY_REPEAT
            for gate in ("A", "B")
        },
        "proceedToSession004": selected is not None,
    }


def json_default(value: Any) -> Any:
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def expand_roi(
    bbox: dict[str, float], width: int, height: int, padding: float = ROI_PADDING,
) -> dict[str, float]:
    box_width = bbox["xMax"] - bbox["xMin"]
    box_height = bbox["yMax"] - bbox["yMin"]
    if box_width < 2 or box_height < 2:
        raise ValueError("ROI bbox is too small")
    return {
        "xMin": max(0.0, bbox["xMin"] - padding * box_width),
        "yMin": max(0.0, bbox["yMin"] - padding * box_height),
        "xMax": min(float(width), bbox["xMax"] + padding * box_width),
        "yMax": min(float(height), bbox["yMax"] + padding * box_height),
    }


def translate_bbox(
    bbox: dict[str, float], dx: float, dy: float, width: int, height: int,
) -> dict[str, float]:
    box_width = bbox["xMax"] - bbox["xMin"]
    box_height = bbox["yMax"] - bbox["yMin"]
    x_min = min(max(0.0, bbox["xMin"] + dx), max(0.0, width - box_width))
    y_min = min(max(0.0, bbox["yMin"] + dy), max(0.0, height - box_height))
    return {"xMin": x_min, "yMin": y_min, "xMax": x_min + box_width, "yMax": y_min + box_height}


def point_distance(left: dict[str, float], right: dict[str, float]) -> float:
    return math.hypot(left["x"] - right["x"], left["y"] - right["y"])


def point_in_bounds(point: dict[str, float], width: int, height: int) -> bool:
    return 0.0 <= point["x"] < width and 0.0 <= point["y"] < height


def point_in_roi(point: dict[str, float], roi: dict[str, float]) -> bool:
    return roi["xMin"] <= point["x"] <= roi["xMax"] and roi["yMin"] <= point["y"] <= roi["yMax"]


def overlap(left: tuple[float, float], right: tuple[float, float]) -> float:
    return max(0.0, min(left[1], right[1]) - max(left[0], right[0]))


class PresenceHead(baseline.nn.Module):
    """A 577-parameter binary head over frozen MobileNetV3 features."""

    def __init__(self, channels: int = 576) -> None:
        super().__init__()
        self.pool = baseline.nn.AdaptiveAvgPool2d(1)
        self.classifier = baseline.nn.Linear(channels, 1)

    def forward(self, inputs: Any) -> Any:
        return self.classifier(self.pool(inputs).flatten(1))


class PresenceExport(baseline.nn.Module):
    def __init__(self, backbone: Any, head: PresenceHead) -> None:
        super().__init__()
        self.backbone = backbone
        self.head = head

    def forward(self, inputs: Any) -> Any:
        return baseline.torch.sigmoid(self.head(self.backbone(inputs)))


def binary_presence_metrics(
    probabilities: Iterable[float], labels: Iterable[int], threshold: float = PRESENCE_CLASSIFIER_THRESHOLD,
) -> dict[str, Any]:
    pairs = [(float(probability), int(label)) for probability, label in zip(probabilities, labels, strict=True)]
    positives = sum(label for _, label in pairs)
    negatives = len(pairs) - positives
    true_positive = sum(probability >= threshold and label == 1 for probability, label in pairs)
    true_negative = sum(probability < threshold and label == 0 for probability, label in pairs)
    false_positive = negatives - true_negative
    false_negative = positives - true_positive
    return {
        "count": len(pairs),
        "positives": positives,
        "negatives": negatives,
        "threshold": threshold,
        "accuracy": (true_positive + true_negative) / len(pairs),
        "positiveRecall": true_positive / positives,
        "negativeSpecificity": true_negative / negatives,
        "falsePresentRate": false_positive / negatives,
        "falseAbsentRate": false_negative / positives,
        "confusion": {"truePresent": true_positive, "trueAbsent": true_negative, "falsePresent": false_positive, "falseAbsent": false_negative},
    }


def train_presence_classifier(repo_root: Path, work_root: Path, epochs: int = 100) -> dict[str, Any]:
    baseline.set_determinism()
    train_frames, validation_frames, annotations = baseline.load_records(repo_root)
    backbone = baseline.mobilenet_v3_small(
        weights=baseline.MobileNet_V3_Small_Weights.IMAGENET1K_V1,
    ).features.eval()
    for parameter in backbone.parameters():
        parameter.requires_grad_(False)
    train_examples = baseline.build_examples(repo_root, train_frames, annotations, baseline.AUGMENTATIONS, roi_mode=False)
    validation_examples = baseline.build_examples(repo_root, validation_frames, annotations, ("identity",), roi_mode=False)
    train_features = baseline.extract_features(backbone, train_examples)
    validation_features = baseline.extract_features(backbone, validation_examples)
    train_labels = baseline.torch.tensor([example.presence for example in train_examples], dtype=baseline.torch.float32)
    validation_labels = baseline.torch.tensor([example.presence for example in validation_examples], dtype=baseline.torch.float32)
    positive_count = float(train_labels.sum().item())
    negative_count = float(len(train_labels) - positive_count)
    positive_weight = len(train_labels) / (2.0 * positive_count)
    negative_weight = len(train_labels) / (2.0 * negative_count)
    sample_weights = baseline.torch.where(
        train_labels > 0.5,
        baseline.torch.full_like(train_labels, positive_weight),
        baseline.torch.full_like(train_labels, negative_weight),
    )
    head = PresenceHead()
    optimizer = baseline.torch.optim.AdamW(head.parameters(), lr=0.01, weight_decay=1e-4)
    best_loss = math.inf
    best_epoch = 0
    best_state = None
    history = []
    for epoch in range(1, epochs + 1):
        head.train()
        optimizer.zero_grad(set_to_none=True)
        logits = head(train_features).squeeze(1)
        loss = baseline.F.binary_cross_entropy_with_logits(logits, train_labels, weight=sample_weights)
        loss.backward()
        optimizer.step()
        head.eval()
        with baseline.torch.inference_mode():
            validation_logits = head(validation_features).squeeze(1)
            validation_loss = baseline.F.binary_cross_entropy_with_logits(validation_logits, validation_labels).item()
        if validation_loss < best_loss:
            best_loss = validation_loss
            best_epoch = epoch
            best_state = {name: value.detach().cpu().clone() for name, value in head.state_dict().items()}
        if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
            history.append({"epoch": epoch, "trainLoss": float(loss.item()), "validationLoss": validation_loss})
    if best_state is None:
        raise RuntimeError("Presence classifier did not produce a checkpoint")
    head.load_state_dict(best_state)
    head.eval()
    checkpoint_dir = work_root / "checkpoints/task-9c4-1"
    export_dir = work_root / "exports/onnx/task-9c4-1"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    export_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = checkpoint_dir / "presence-binary.head.pt"
    baseline.torch.save({"stateDict": best_state, "bestEpoch": best_epoch, "seed": SEED}, checkpoint_path)
    with baseline.torch.inference_mode():
        validation_probabilities = baseline.torch.sigmoid(head(validation_features).squeeze(1)).cpu().numpy()
    metrics = binary_presence_metrics(validation_probabilities, [round(example.presence) for example in validation_examples])
    export_model = PresenceExport(backbone, head).eval()
    onnx_path = export_dir / "presence-binary.onnx"
    dummy = validation_examples[0].tensor.unsqueeze(0)
    baseline.torch.onnx.export(
        export_model,
        dummy,
        onnx_path,
        input_names=["image"],
        output_names=["presence_probability"],
        opset_version=17,
        dynamic_axes=None,
    )
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    onnx_output = session.run(None, {session.get_inputs()[0].name: dummy.numpy()})[0]
    with baseline.torch.inference_mode():
        source_output = export_model(dummy).numpy()
    return {
        "formulation": "full-frame frozen MobileNetV3-small features plus global average pool and one 576-to-1 linear layer",
        "parameters": sum(parameter.numel() for parameter in head.parameters()),
        "epochs": epochs,
        "bestEpoch": best_epoch,
        "bestValidationLoss": best_loss,
        "history": history,
        "metrics": metrics,
        "checkpoint": str(checkpoint_path),
        "checkpointSha256": sha256_file(checkpoint_path),
        "onnx": str(onnx_path),
        "onnxSha256": sha256_file(onnx_path),
        "onnxMaxAbsoluteDifference": float(np.max(np.abs(source_output - onnx_output))),
    }


class ModelAdapters:
    def __init__(self, work_root: Path) -> None:
        options = ort.SessionOptions()
        options.intra_op_num_threads = max(1, min(8, cv2.getNumberOfCPUs()))
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        model_paths = {
            "detector": work_root / "exports/onnx/task-9c2/b0-detector.onnx",
            "fullKeypoint": work_root / "exports/onnx/task-9c2/a1-full-frame-keypoint.onnx",
            "roiKeypoint": work_root / "exports/onnx/task-9c3/r4-jitter-roi-keypoint.onnx",
        }
        presence_path = work_root / "exports/onnx/task-9c4-1/presence-binary.onnx"
        if presence_path.exists():
            model_paths["presenceClassifier"] = presence_path
        self.paths = model_paths
        self.sessions = {
            name: ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
            for name, path in model_paths.items()
        }
        self.latencies: dict[str, list[float]] = {name: [] for name in model_paths}
        self.warmup_ms: dict[str, float] = {}

    def _prepare(
        self, frame: np.ndarray, crop: dict[str, float] | None,
    ) -> tuple[np.ndarray, Any]:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(rgb)
        crop_tuple = None
        if crop is not None:
            crop_tuple = (crop["xMin"], crop["yMin"], crop["xMax"], crop["yMax"])
        tensor, geometry = baseline.prepare_image(image, "identity", crop_tuple)
        return tensor.unsqueeze(0).numpy(), geometry

    def _run(self, name: str, tensor: np.ndarray, record: bool = True) -> np.ndarray:
        session = self.sessions[name]
        started = time.perf_counter()
        output = session.run(None, {session.get_inputs()[0].name: tensor})[0][0]
        elapsed = (time.perf_counter() - started) * 1000.0
        if record:
            self.latencies[name].append(elapsed)
        return output

    def warmup(self, frame: np.ndarray) -> None:
        full, _ = self._prepare(frame, None)
        for name in self.sessions:
            started = time.perf_counter()
            for _ in range(3):
                self._run(name, full, record=False)
            self.warmup_ms[name] = (time.perf_counter() - started) * 1000.0 / 3.0

    def detector(self, frame: np.ndarray) -> dict[str, Any]:
        started = time.perf_counter()
        tensor, geometry = self._prepare(frame, None)
        output = self._run("detector", tensor, record=False)
        self.latencies["detector"].append((time.perf_counter() - started) * 1000.0)
        bbox = baseline.bbox_from_input(output[1:5], geometry, (frame.shape[1], frame.shape[0]))
        valid = bbox["xMax"] - bbox["xMin"] >= 2 and bbox["yMax"] - bbox["yMin"] >= 2
        return {"accepted": bool(output[0] >= DETECTOR_THRESHOLD and valid), "confidence": float(output[0]), "bbox": bbox}

    def keypoint(
        self, frame: np.ndarray, roi: dict[str, float] | None,
    ) -> dict[str, Any]:
        name = "fullKeypoint" if roi is None else "roiKeypoint"
        threshold = FULL_FRAME_KEYPOINT_THRESHOLD if roi is None else ROI_KEYPOINT_THRESHOLD
        started = time.perf_counter()
        tensor, geometry = self._prepare(frame, roi)
        output = self._run(name, tensor, record=False)
        self.latencies[name].append((time.perf_counter() - started) * 1000.0)
        point_tuple = baseline.point_from_input(output[1:3], geometry)
        point = {"x": float(point_tuple[0]), "y": float(point_tuple[1])}
        accepted = bool(output[0] >= threshold and point_in_bounds(point, frame.shape[1], frame.shape[0]))
        if roi is not None:
            accepted = accepted and point_in_roi(point, roi)
        return {"accepted": accepted, "confidence": float(output[0]), "point": point}

    def presence_classifier(self, frame: np.ndarray) -> dict[str, Any]:
        if "presenceClassifier" not in self.sessions:
            raise RuntimeError("Presence classifier ONNX is not available")
        started = time.perf_counter()
        tensor, _ = self._prepare(frame, None)
        output = self._run("presenceClassifier", tensor, record=False)
        self.latencies["presenceClassifier"].append((time.perf_counter() - started) * 1000.0)
        probability = float(np.asarray(output).reshape(-1)[0])
        return {"accepted": probability >= PRESENCE_CLASSIFIER_THRESHOLD, "confidence": probability}


@dataclass
class LkResult:
    valid: bool
    point: dict[str, float] | None
    quality: float
    median_fb_error: float | None
    valid_features: int


class LkTracker:
    WIN_SIZE = (21, 21)
    MAX_LEVEL = 3
    CRITERIA = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.01)
    FB_MAX_ERROR = 1.5
    LK_MAX_ERROR = 20.0
    MIN_FEATURES = 4

    def __init__(self) -> None:
        self.previous_gray: np.ndarray | None = None
        self.features: np.ndarray | None = None
        self.anchor: dict[str, float] | None = None
        self.initial_feature_count = 0

    def clear(self) -> None:
        self.previous_gray = None
        self.features = None
        self.anchor = None
        self.initial_feature_count = 0

    def initialize(self, gray: np.ndarray, point: dict[str, float], bbox: dict[str, float]) -> bool:
        mask = np.zeros(gray.shape, dtype=np.uint8)
        diagonal = math.hypot(bbox["xMax"] - bbox["xMin"], bbox["yMax"] - bbox["yMin"])
        radius = int(max(16, min(48, 0.10 * diagonal)))
        cv2.circle(mask, (round(point["x"]), round(point["y"])), radius, 255, -1)
        features = cv2.goodFeaturesToTrack(
            gray,
            mask=mask,
            maxCorners=30,
            qualityLevel=0.01,
            minDistance=4,
            blockSize=5,
            useHarrisDetector=False,
        )
        if features is None or len(features) < self.MIN_FEATURES:
            self.clear()
            return False
        self.previous_gray = gray.copy()
        self.features = features.astype(np.float32)
        self.anchor = dict(point)
        self.initial_feature_count = len(features)
        return True

    def update(self, gray: np.ndarray) -> LkResult:
        if self.previous_gray is None or self.features is None or self.anchor is None:
            return LkResult(False, None, 0.0, None, 0)
        next_points, forward_status, forward_error = cv2.calcOpticalFlowPyrLK(
            self.previous_gray,
            gray,
            self.features,
            None,
            winSize=self.WIN_SIZE,
            maxLevel=self.MAX_LEVEL,
            criteria=self.CRITERIA,
        )
        if next_points is None or forward_status is None or forward_error is None:
            return LkResult(False, None, 0.0, None, 0)
        back_points, backward_status, _ = cv2.calcOpticalFlowPyrLK(
            gray,
            self.previous_gray,
            next_points,
            None,
            winSize=self.WIN_SIZE,
            maxLevel=self.MAX_LEVEL,
            criteria=self.CRITERIA,
        )
        if back_points is None or backward_status is None:
            return LkResult(False, None, 0.0, None, 0)
        previous_flat = self.features.reshape(-1, 2)
        next_flat = next_points.reshape(-1, 2)
        back_flat = back_points.reshape(-1, 2)
        fb_error = np.linalg.norm(previous_flat - back_flat, axis=1)
        status = (
            (forward_status.reshape(-1) == 1)
            & (backward_status.reshape(-1) == 1)
            & (forward_error.reshape(-1) <= self.LK_MAX_ERROR)
            & (fb_error <= self.FB_MAX_ERROR)
        )
        valid_count = int(np.count_nonzero(status))
        if valid_count < self.MIN_FEATURES:
            return LkResult(False, None, 0.0, None, valid_count)
        good_previous = previous_flat[status]
        good_next = next_flat[status]
        displacement = np.median(good_next - good_previous, axis=0)
        point = {"x": self.anchor["x"] + float(displacement[0]), "y": self.anchor["y"] + float(displacement[1])}
        median_fb = float(np.median(fb_error[status]))
        valid_ratio = valid_count / max(1, self.initial_feature_count)
        consistency = math.exp(-median_fb / self.FB_MAX_ERROR)
        feature_support = min(1.0, valid_count / 8.0)
        quality = max(0.0, min(1.0, 0.45 * valid_ratio + 0.35 * consistency + 0.20 * feature_support))
        self.previous_gray = gray.copy()
        self.features = good_next.reshape(-1, 1, 2).astype(np.float32)
        self.anchor = point
        self.initial_feature_count = valid_count
        return LkResult(quality >= TRACKER_QUALITY_THRESHOLD, point, quality, median_fb, valid_count)


@dataclass
class Segment:
    segment_id: int
    start_ms: float
    end_ms: float | None = None
    end_reason: str | None = None
    observation_count: int = 0


@dataclass
class RunnerState:
    state: str = "ABSENT"
    origin: str = "initial"
    confirmation_count: int = 0
    confirmation_start_ms: float | None = None
    uncertain_start_ms: float | None = None
    local_attempts: int = 0
    current_bbox: dict[str, float] | None = None
    last_trusted: dict[str, float] | None = None
    last_trusted_ms: float | None = None
    next_detector_frame: int = 0
    next_semantic_frame: int = 0
    next_presence_frame: int = 0
    consecutive_absent_presence: int = 0
    segment_counter: int = 0
    open_segment: Segment | None = None
    segments: list[Segment] = field(default_factory=list)


class HybridRunner:
    def __init__(self, mode: str, fps: float, adapters: ModelAdapters, presence_gate: str | None = None) -> None:
        if mode not in {"A", "B", "C"}:
            raise ValueError(f"Unknown mode: {mode}")
        self.mode = mode
        if presence_gate not in {None, "A", "B"}:
            raise ValueError(f"Unknown presence gate: {presence_gate}")
        self.presence_gate = presence_gate
        self.fps = fps
        self.adapters = adapters
        self.state = RunnerState()
        self.tracker = LkTracker()
        self.transitions: list[dict[str, Any]] = []
        self.invocations = {"detector": 0, "keypoint": 0, "tracker": 0, "presence": 0}
        self.tracker_latencies: list[float] = []
        self.presence_latencies: list[float] = []

    def transition(self, new_state: str, timestamp_ms: float, reason: str, frame_events: list[dict[str, Any]]) -> None:
        previous = self.state.state
        if previous == new_state:
            return
        event = {"timestampMs": timestamp_ms, "from": previous, "to": new_state, "reason": reason}
        self.transitions.append(event)
        frame_events.append(event)
        self.state.state = new_state

    def begin(self, start_frame: int, timestamp_ms: float) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        self.transition("SEARCHING", timestamp_ms, "BEGIN_SEARCH", events)
        self.state.next_detector_frame = start_frame
        self.state.next_semantic_frame = start_frame
        self.state.next_presence_frame = start_frame
        return events

    def call_presence(self, frame: np.ndarray, detector_result: dict[str, Any] | None = None) -> dict[str, Any]:
        if self.presence_gate is None:
            return {"accepted": True, "confidence": 1.0, "source": "disabled"}
        started = time.perf_counter()
        self.invocations["presence"] += 1
        if self.presence_gate == "A":
            result = detector_result if detector_result is not None else self.adapters.detector(frame)
            observation = {"accepted": bool(result["accepted"]), "confidence": float(result["confidence"]), "source": "detector"}
        else:
            result = self.adapters.presence_classifier(frame)
            observation = {"accepted": bool(result["accepted"]), "confidence": float(result["confidence"]), "source": "binary_classifier"}
        self.presence_latencies.append((time.perf_counter() - started) * 1000.0)
        return observation

    def local_roi(self, width: int, height: int) -> dict[str, float] | None:
        if self.state.current_bbox is None:
            return None
        return expand_roi(self.state.current_bbox, width, height)

    def call_keypoint(self, frame: np.ndarray) -> tuple[dict[str, Any], dict[str, float] | None]:
        roi = None if self.mode == "A" else self.local_roi(frame.shape[1], frame.shape[0])
        if self.mode != "A" and roi is None:
            return {"accepted": False, "confidence": 0.0, "point": None}, roi
        self.invocations["keypoint"] += 1
        return self.adapters.keypoint(frame, roi), roi

    def anti_drift_limit(self, frame: np.ndarray) -> float:
        if self.state.current_bbox is None:
            return ANTI_DRIFT_FRACTION * math.hypot(frame.shape[1], frame.shape[0])
        bbox = self.state.current_bbox
        return ANTI_DRIFT_FRACTION * math.hypot(bbox["xMax"] - bbox["xMin"], bbox["yMax"] - bbox["yMin"])

    def accept_point(self, point: dict[str, float], timestamp_ms: float, frame: np.ndarray, gray: np.ndarray) -> bool:
        previous = self.state.last_trusted
        if previous is not None and self.state.current_bbox is not None:
            self.state.current_bbox = translate_bbox(
                self.state.current_bbox,
                point["x"] - previous["x"],
                point["y"] - previous["y"],
                frame.shape[1],
                frame.shape[0],
            )
        self.state.last_trusted = dict(point)
        self.state.last_trusted_ms = timestamp_ms
        if self.state.open_segment is not None:
            self.state.open_segment.observation_count += 1
        if self.mode == "C" and self.state.current_bbox is not None:
            return self.tracker.initialize(gray, point, self.state.current_bbox)
        return True

    def start_segment(self, timestamp_ms: float) -> None:
        self.state.segment_counter += 1
        start_ms = self.state.confirmation_start_ms if self.state.confirmation_start_ms is not None else timestamp_ms
        segment = Segment(self.state.segment_counter, start_ms)
        self.state.segments.append(segment)
        self.state.open_segment = segment

    def enter_lost(self, timestamp_ms: float, reason: str, frame_events: list[dict[str, Any]]) -> None:
        if self.state.open_segment is not None:
            self.state.open_segment.end_ms = self.state.last_trusted_ms or timestamp_ms
            self.state.open_segment.end_reason = reason
            self.state.open_segment = None
        self.transition("LOST", timestamp_ms, reason, frame_events)
        self.state.current_bbox = None
        self.state.last_trusted = None
        self.state.last_trusted_ms = None
        self.state.confirmation_count = 0
        self.state.confirmation_start_ms = None
        self.state.uncertain_start_ms = None
        self.state.local_attempts = 0
        self.state.consecutive_absent_presence = 0
        self.tracker.clear()

    def confirmation(self, frame: np.ndarray, gray: np.ndarray, frame_index: int, timestamp_ms: float,
                     frame_events: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, dict[str, float] | None]:
        keypoint, roi = self.call_keypoint(frame)
        if not keypoint["accepted"]:
            fallback = "LOST" if self.state.origin == "reacquisition" else "SEARCHING"
            self.transition(fallback, timestamp_ms, "keypoint_failed_confirmation", frame_events)
            self.state.confirmation_count = 0
            self.state.confirmation_start_ms = None
            if fallback == "LOST":
                self.state.next_detector_frame = frame_index + round(self.fps / DETECTOR_HZ)
            return keypoint, roi
        if self.state.confirmation_count == 0:
            self.state.confirmation_start_ms = timestamp_ms
        self.state.confirmation_count += 1
        required = REACQUISITION_CONFIRMATIONS if self.state.origin == "reacquisition" else INITIAL_CONFIRMATIONS
        self.state.last_trusted = dict(keypoint["point"])
        self.state.last_trusted_ms = timestamp_ms
        if self.state.confirmation_count >= required:
            self.start_segment(timestamp_ms)
            self.accept_point(keypoint["point"], timestamp_ms, frame, gray)
            if self.state.origin == "reacquisition":
                self.transition("REACQUIRED", timestamp_ms, "reacquisition_confirmed", frame_events)
                self.transition("TRACKING", timestamp_ms, "reacquired_event_recorded", frame_events)
            else:
                self.transition("TRACKING", timestamp_ms, "initial_confirmation_complete", frame_events)
            self.state.next_semantic_frame = frame_index + max(1, round(self.fps / SEMANTIC_CORRECTION_HZ))
            self.state.next_presence_frame = frame_index + max(1, round(self.fps / PRESENCE_HZ))
        return keypoint, roi

    def begin_uncertain(self, timestamp_ms: float, reason: str, frame_events: list[dict[str, Any]]) -> None:
        if self.state.state != "UNCERTAIN":
            self.state.uncertain_start_ms = timestamp_ms
            self.state.local_attempts = 0
            self.transition("UNCERTAIN", timestamp_ms, reason, frame_events)

    def uncertain_step(self, frame: np.ndarray, gray: np.ndarray, timestamp_ms: float,
                       frame_events: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, dict[str, float] | None]:
        self.state.local_attempts += 1
        keypoint, roi = self.call_keypoint(frame)
        elapsed = timestamp_ms - (self.state.uncertain_start_ms or timestamp_ms)
        consistent = (
            keypoint["accepted"]
            and self.state.last_trusted is not None
            and point_distance(keypoint["point"], self.state.last_trusted) <= self.anti_drift_limit(frame)
        )
        if consistent:
            self.accept_point(keypoint["point"], timestamp_ms, frame, gray)
            self.state.uncertain_start_ms = None
            self.state.local_attempts = 0
            self.transition("TRACKING", timestamp_ms, "local_relocalization_succeeded", frame_events)
        elif self.state.local_attempts >= LOCAL_ATTEMPTS or elapsed >= FAILURE_TIMEOUT_MS:
            self.enter_lost(timestamp_ms, "local_relocalization_exhausted", frame_events)
        return keypoint, roi

    def process(self, frame: np.ndarray, frame_index: int, timestamp_ms: float) -> dict[str, Any]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        frame_events: list[dict[str, Any]] = []
        semantic: dict[str, Any] | None = None
        detector: dict[str, Any] | None = None
        presence: dict[str, Any] | None = None
        tracker_result: LkResult | None = None
        roi: dict[str, float] | None = self.local_roi(frame.shape[1], frame.shape[0])

        if self.state.state in {"SEARCHING", "LOST"}:
            if self.mode == "A":
                semantic, roi = self.call_keypoint(frame)
                if semantic["accepted"]:
                    self.state.origin = "reacquisition" if self.state.state == "LOST" else "initial"
                    self.state.confirmation_count = 1
                    self.state.confirmation_start_ms = timestamp_ms
                    self.state.last_trusted = dict(semantic["point"])
                    self.state.last_trusted_ms = timestamp_ms
                    self.transition("ACQUIRING", timestamp_ms, "full_frame_candidate", frame_events)
            elif frame_index >= self.state.next_detector_frame:
                self.invocations["detector"] += 1
                detector = self.adapters.detector(frame)
                self.state.next_detector_frame = frame_index + max(1, round(self.fps / DETECTOR_HZ))
                if detector["accepted"]:
                    presence = self.call_presence(frame, detector)
                    if presence["accepted"]:
                        self.state.origin = "reacquisition" if self.state.state == "LOST" else "initial"
                        self.state.current_bbox = dict(detector["bbox"])
                        self.state.confirmation_count = 0
                        self.state.confirmation_start_ms = None
                        self.state.consecutive_absent_presence = 0
                        self.transition("ACQUIRING", timestamp_ms, "detector_and_presence_candidate", frame_events)
                        semantic, roi = self.confirmation(frame, gray, frame_index, timestamp_ms, frame_events)

        elif self.state.state == "ACQUIRING":
            semantic, roi = self.confirmation(frame, gray, frame_index, timestamp_ms, frame_events)

        elif self.state.state == "TRACKING":
            if self.presence_gate is not None and frame_index >= self.state.next_presence_frame:
                presence = self.call_presence(frame)
                self.state.next_presence_frame = frame_index + max(1, round(self.fps / PRESENCE_HZ))
                if presence["accepted"]:
                    self.state.consecutive_absent_presence = 0
                else:
                    self.state.consecutive_absent_presence += 1
                    if self.state.consecutive_absent_presence >= PRESENCE_ABSENT_CONFIRMATIONS:
                        self.enter_lost(timestamp_ms, "presence_absent_confirmed", frame_events)
            if self.state.state == "TRACKING" and self.mode == "C":
                self.invocations["tracker"] += 1
                started = time.perf_counter()
                tracker_result = self.tracker.update(gray)
                self.tracker_latencies.append((time.perf_counter() - started) * 1000.0)
                if (
                    not tracker_result.valid
                    or tracker_result.point is None
                    or not point_in_bounds(tracker_result.point, frame.shape[1], frame.shape[0])
                ):
                    self.begin_uncertain(timestamp_ms, "lk_quality_or_geometry_failed", frame_events)
                    semantic, roi = self.uncertain_step(frame, gray, timestamp_ms, frame_events)
                else:
                    previous = self.state.last_trusted
                    if previous is not None and self.state.current_bbox is not None:
                        self.state.current_bbox = translate_bbox(
                            self.state.current_bbox,
                            tracker_result.point["x"] - previous["x"],
                            tracker_result.point["y"] - previous["y"],
                            frame.shape[1], frame.shape[0],
                        )
                    self.state.last_trusted = dict(tracker_result.point)
                    self.state.last_trusted_ms = timestamp_ms
                    if self.state.open_segment is not None:
                        self.state.open_segment.observation_count += 1
                    if frame_index >= self.state.next_semantic_frame:
                        semantic, roi = self.call_keypoint(frame)
                        self.state.next_semantic_frame = frame_index + max(1, round(self.fps / SEMANTIC_CORRECTION_HZ))
                        if not semantic["accepted"]:
                            self.begin_uncertain(timestamp_ms, "semantic_correction_missed", frame_events)
                        elif point_distance(semantic["point"], tracker_result.point) > self.anti_drift_limit(frame):
                            self.begin_uncertain(timestamp_ms, "semantic_tracker_disagreement", frame_events)
                            self.state.local_attempts = 1
                        else:
                            self.accept_point(semantic["point"], timestamp_ms, frame, gray)
            elif self.state.state == "TRACKING":
                semantic, roi = self.call_keypoint(frame)
                if not semantic["accepted"]:
                    self.begin_uncertain(timestamp_ms, "semantic_miss", frame_events)
                elif (
                    self.state.last_trusted is not None
                    and point_distance(semantic["point"], self.state.last_trusted) > self.anti_drift_limit(frame)
                ):
                    self.begin_uncertain(timestamp_ms, "semantic_jump", frame_events)
                    self.state.local_attempts = 1
                else:
                    self.accept_point(semantic["point"], timestamp_ms, frame, gray)

        elif self.state.state == "UNCERTAIN":
            semantic, roi = self.uncertain_step(frame, gray, timestamp_ms, frame_events)

        emitted = None
        if self.state.state in {"TRACKING", "UNCERTAIN", "REACQUIRED"} and self.state.last_trusted is not None:
            emitted = dict(self.state.last_trusted)
        return {
            "frameIndex": frame_index,
            "timestampMs": timestamp_ms,
            "state": self.state.state,
            "segmentId": self.state.open_segment.segment_id if self.state.open_segment else None,
            "emittedPoint": emitted,
            "pointSource": "tracker" if tracker_result and tracker_result.valid and semantic is None else "semantic" if semantic else None,
            "semanticPoint": semantic.get("point") if semantic else None,
            "semanticConfidence": semantic.get("confidence") if semantic else None,
            "detectorConfidence": detector.get("confidence") if detector else None,
            "detectorRoi": detector.get("bbox") if detector and detector.get("accepted") else None,
            "activeRoi": roi,
            "trackerPoint": tracker_result.point if tracker_result else None,
            "trackerQuality": tracker_result.quality if tracker_result else None,
            "trackerFbError": tracker_result.median_fb_error if tracker_result else None,
            "trackerFeatures": tracker_result.valid_features if tracker_result else None,
            "presenceProbability": presence.get("confidence") if presence else None,
            "presenceDecision": presence.get("accepted") if presence else None,
            "presenceSource": presence.get("source") if presence else None,
            "events": frame_events,
        }

    def stop(self, timestamp_ms: float) -> None:
        if self.state.open_segment is not None:
            self.state.open_segment.end_ms = self.state.last_trusted_ms or timestamp_ms
            self.state.open_segment.end_reason = "window_end"
            self.state.open_segment = None
        self.tracker.clear()


def load_ground_truth(repo_root: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], Path, Path]:
    manifest_path = repo_root / "data/vision/frames/feasibility-v1/manifests/cupmaster-spout-first-party-v1.training-ready.json"
    annotation_path = repo_root / "data/vision/annotations/feasibility-v1/first-party-v1.training-ready.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    annotations = json.loads(annotation_path.read_text(encoding="utf-8"))
    annotation_map = {
        record["frameId"]: record
        for annotation_pass in annotations["passes"]
        for record in annotation_pass["annotations"]
    }
    frames = [frame for frame in manifest["frames"] if frame["sessionId"] == SESSION]
    if len(frames) != 17:
        raise RuntimeError(f"Expected 17 authoritative session-003 checkpoints, got {len(frames)}")
    return frames, annotation_map, manifest_path, annotation_path


def read_frame(capture: cv2.VideoCapture, frame_index: int) -> np.ndarray:
    capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = capture.read()
    if not ok or frame is None:
        raise RuntimeError(f"Could not read source frame {frame_index}")
    return frame


def run_window(
    video_path: Path, mode: str, name: str, bounds: tuple[float, float], adapters: ModelAdapters,
    presence_gate: str | None = None,
) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open {video_path}")
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    start_frame = round(bounds[0] * fps)
    end_frame = min(round(bounds[1] * fps), int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) - 1)
    runner = HybridRunner(mode, fps, adapters, presence_gate=presence_gate)
    records = []
    started = time.perf_counter()
    first_events = runner.begin(start_frame, start_frame / fps * 1000.0)
    for frame_index in range(start_frame, end_frame + 1):
        ok, frame = capture.read() if frame_index != start_frame else (capture.set(cv2.CAP_PROP_POS_FRAMES, start_frame), None)
        if frame_index == start_frame:
            ok, frame = capture.read()
        if not ok or frame is None:
            raise RuntimeError(f"Decode failed at frame {frame_index} for {name}/{mode}")
        timestamp_ms = frame_index / fps * 1000.0
        record = runner.process(frame, frame_index, timestamp_ms)
        if frame_index == start_frame:
            record["events"] = first_events + record["events"]
        records.append(record)
    elapsed = time.perf_counter() - started
    runner.stop(end_frame / fps * 1000.0)
    capture.release()
    segments = [segment.__dict__ for segment in runner.state.segments]
    return {
        "window": name,
        "boundsSeconds": bounds,
        "mode": mode,
        "presenceGate": presence_gate,
        "fps": fps,
        "frames": len(records),
        "elapsedSeconds": elapsed,
        "effectiveFps": len(records) / elapsed,
        "invocations": runner.invocations,
        "trackerLatenciesMs": runner.tracker_latencies,
        "trackerLatencyMs": distribution(runner.tracker_latencies),
        "presenceLatenciesMs": runner.presence_latencies,
        "presenceLatencyMs": distribution(runner.presence_latencies),
        "transitions": runner.transitions,
        "segments": segments,
        "records": records,
    }


def record_nearest(records: list[dict[str, Any]], timestamp_ms: float) -> dict[str, Any]:
    return min(records, key=lambda record: abs(record["timestampMs"] - timestamp_ms))


def localization_metrics(
    canonical: dict[str, dict[str, Any]], frames: list[dict[str, Any]], annotations: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    pixel_errors = []
    normalized_errors = []
    misses = 0
    positives = 0
    false_positives = 0
    predictions = []
    for frame in frames:
        seconds = frame["timestampMs"] / 1000.0
        source = canonical.get(frame["frameId"])
        if source is None:
            continue
        annotation = annotations[frame["frameId"]]
        positive = bool(annotation["objects"])
        point = source["emittedPoint"]
        error = None
        normalized = None
        if positive:
            positives += 1
            if point is None:
                misses += 1
            else:
                target = annotation["objects"][0]["spoutTip"]
                error = point_distance(point, target)
                pixel_errors.append(error)
                dripper = annotation.get("dripper")
                if dripper and dripper["radiusX"] > 0 and dripper["radiusY"] > 0:
                    normalized = error / math.sqrt(dripper["radiusX"] * dripper["radiusY"])
                    normalized_errors.append(normalized)
        elif point is not None:
            false_positives += 1
        predictions.append({
            "frameId": frame["frameId"], "timestampSeconds": seconds, "positive": positive,
            "state": source["state"], "segmentId": source["segmentId"], "point": point,
            "errorPx": error, "normalizedError": normalized,
        })
    return {
        "checkpoints": len(predictions),
        "positives": positives,
        "pixelError": distribution(pixel_errors),
        "normalizedError": distribution(normalized_errors),
        "missRate": misses / positives if positives else None,
        "misses": misses,
        "negativeFalsePositiveCount": false_positives,
    }, predictions


def sparse_jitter(
    predictions: list[dict[str, Any]], annotations: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    values_px_s = []
    values_radius_s = []
    positives = [item for item in predictions if item["positive"] and item["point"] is not None]
    for left, right in zip(positives, positives[1:]):
        dt = right["timestampSeconds"] - left["timestampSeconds"]
        if dt <= 0 or dt > 5.0:
            continue
        left_target = annotations[left["frameId"]]["objects"][0]["spoutTip"]
        right_target = annotations[right["frameId"]]["objects"][0]["spoutTip"]
        predicted_dx = right["point"]["x"] - left["point"]["x"]
        predicted_dy = right["point"]["y"] - left["point"]["y"]
        expected_dx = right_target["x"] - left_target["x"]
        expected_dy = right_target["y"] - left_target["y"]
        residual_per_second = math.hypot(predicted_dx - expected_dx, predicted_dy - expected_dy) / dt
        values_px_s.append(residual_per_second)
        dripper = annotations[right["frameId"]].get("dripper")
        if dripper and dripper["radiusX"] > 0 and dripper["radiusY"] > 0:
            values_radius_s.append(residual_per_second / math.sqrt(dripper["radiusX"] * dripper["radiusY"]))
    return {
        "definition": "sparse checkpoint displacement residual; not dense frame-to-frame ground-truth jitter",
        "pixelPerSecond": distribution(values_px_s),
        "dripperRadiiPerSecond": distribution(values_radius_s),
    }


def temporal_metrics(run: dict[str, Any]) -> dict[str, Any]:
    name = run["window"]
    true_intervals = TRUE_VISIBLE[name]
    segments = [
        (segment["start_ms"] / 1000.0, (segment["end_ms"] or segment["start_ms"]) / 1000.0)
        for segment in run["segments"]
    ]
    continuity = []
    false_splits = 0
    for interval in true_intervals:
        intersections = [overlap(interval, segment) for segment in segments]
        intersecting = [value for value in intersections if value > 0]
        continuity.append(max(intersecting, default=0.0) / max(1e-9, interval[1] - interval[0]))
        false_splits += max(0, len(intersecting) - 1)
    false_merges = sum(sum(overlap(interval, segment) > 0 for interval in true_intervals) > 1 for segment in segments)
    lost_events = [item for item in run["transitions"] if item["to"] == "LOST"]
    reacquired_events = [item for item in run["transitions"] if item["to"] == "REACQUIRED"]
    lost_delays = []
    censored_lost = 0
    for exit_time in EVENT_TRUTH[name]["exits"]:
        match = next((event for event in lost_events if event["timestampMs"] / 1000.0 >= exit_time), None)
        if match is None:
            censored_lost += 1
        else:
            lost_delays.append(match["timestampMs"] / 1000.0 - exit_time)
    reacquisition_latencies = []
    censored_reacquisition = 0
    for entry_time in EVENT_TRUTH[name]["reentries"]:
        match = next((event for event in reacquired_events if event["timestampMs"] / 1000.0 >= entry_time), None)
        if match is None:
            censored_reacquisition += 1
        else:
            reacquisition_latencies.append(match["timestampMs"] / 1000.0 - entry_time)
    false_reacquisitions = 0
    for event in reacquired_events:
        event_seconds = event["timestampMs"] / 1000.0
        if not any(start <= event_seconds <= end for start, end in true_intervals):
            false_reacquisitions += 1
    return {
        "segmentContinuity": distribution(continuity),
        "falseSegmentSplits": false_splits,
        "falseSegmentMerges": false_merges,
        "lostDelaySeconds": distribution(lost_delays),
        "lostCensoredFailures": censored_lost,
        "reacquisitionLatencySeconds": distribution(reacquisition_latencies),
        "reacquisitionCensoredFailures": censored_reacquisition,
        "falseReacquisitionCount": false_reacquisitions,
        "segmentCount": len(segments),
    }


def evaluate_static_presence(
    repo_root: Path,
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    adapters: ModelAdapters,
    gate: str,
) -> dict[str, Any]:
    probabilities = []
    labels = []
    latencies = []
    records = []
    for frame_record in frames:
        path = repo_root / "data/vision" / frame_record["path"]
        frame = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if frame is None:
            raise RuntimeError(f"Could not read validation checkpoint {path}")
        started = time.perf_counter()
        observation = adapters.detector(frame) if gate == "A" else adapters.presence_classifier(frame)
        latencies.append((time.perf_counter() - started) * 1000.0)
        probability = float(observation["confidence"])
        label = int(bool(annotations[frame_record["frameId"]]["objects"]))
        probabilities.append(probability)
        labels.append(label)
        records.append({
            "frameId": frame_record["frameId"],
            "label": label,
            "probability": probability,
            "predictedPresent": bool(observation["accepted"]),
        })
    threshold = DETECTOR_THRESHOLD if gate == "A" else PRESENCE_CLASSIFIER_THRESHOLD
    return {
        "method": "existing B0 valid detection" if gate == "A" else "tiny full-frame binary classifier",
        "metrics": binary_presence_metrics(probabilities, labels, threshold),
        "latencyMs": distribution(latencies),
        "records": records,
    }


def presence_temporal_metrics(run: dict[str, Any]) -> dict[str, Any]:
    base = temporal_metrics(run)
    name = run["window"]
    true_intervals = TRUE_VISIBLE[name]
    lost_events = [event for event in run["transitions"] if event["to"] == "LOST"]
    reacquired_events = [event for event in run["transitions"] if event["to"] == "REACQUIRED"]
    exits = EVENT_TRUTH[name]["exits"]
    true_exit_delays = []
    exit_records = []
    for exit_seconds in exits:
        next_visible = min((start for start, _ in true_intervals if start > exit_seconds), default=run["boundsSeconds"][1])
        match = next(
            (
                event for event in lost_events
                if exit_seconds <= event["timestampMs"] / 1000.0 < next_visible
            ),
            None,
        )
        anchor_record = min(run["records"], key=lambda record: abs(record["timestampMs"] / 1000.0 - exit_seconds))
        anchor = anchor_record["emittedPoint"]
        max_anchor_displacement = None
        if match is not None and anchor is not None:
            candidates = [
                record["emittedPoint"]
                for record in run["records"]
                if exit_seconds * 1000.0 <= record["timestampMs"] <= match["timestampMs"] and record["emittedPoint"] is not None
            ]
            max_anchor_displacement = max((point_distance(anchor, point) for point in candidates), default=0.0)
            true_exit_delays.append(match["timestampMs"] / 1000.0 - exit_seconds)
        exit_records.append({
            "trueExitSeconds": exit_seconds,
            "lostTimestampSeconds": match["timestampMs"] / 1000.0 if match else None,
            "delaySeconds": match["timestampMs"] / 1000.0 - exit_seconds if match else None,
            "reason": match["reason"] if match else None,
            "maximumAnchorDisplacementPxBeforeLost": max_anchor_displacement,
        })
    false_lost = [
        event
        for event in lost_events
        if any(start <= event["timestampMs"] / 1000.0 < end for start, end in true_intervals)
    ]
    reentry_records = []
    for entry_seconds in EVENT_TRUTH[name]["reentries"]:
        interval_end = next((end for start, end in true_intervals if start == entry_seconds), run["boundsSeconds"][1])
        match = next(
            (
                event for event in reacquired_events
                if entry_seconds <= event["timestampMs"] / 1000.0 <= interval_end
            ),
            None,
        )
        reentry_records.append({
            "trueReentrySeconds": entry_seconds,
            "reacquiredTimestampSeconds": match["timestampMs"] / 1000.0 if match else None,
            "latencySeconds": match["timestampMs"] / 1000.0 - entry_seconds if match else None,
        })
    segments = [
        (segment["start_ms"] / 1000.0, (segment["end_ms"] or segment["start_ms"]) / 1000.0)
        for segment in run["segments"]
    ]
    absence_crossings = 0
    for left, right in zip(true_intervals, true_intervals[1:]):
        absence_crossings += sum(segment[0] < left[1] and segment[1] > right[0] for segment in segments)
    base.update({
        "trueExits": len(exits),
        "trueExitsReachingLost": sum(record["lostTimestampSeconds"] is not None for record in exit_records),
        "exitRecords": exit_records,
        "presenceTriggeredLostDelaySeconds": distribution(true_exit_delays),
        "falseLostCount": len(false_lost),
        "falseLostTimestampsSeconds": [event["timestampMs"] / 1000.0 for event in false_lost],
        "trueReentries": len(reentry_records),
        "trueReacquisitions": sum(record["reacquiredTimestampSeconds"] is not None for record in reentry_records),
        "reentryRecords": reentry_records,
        "segmentsCrossingKnownAbsence": absence_crossings,
        "backgroundLockTerminated": bool(exits) and all(record["lostTimestampSeconds"] is not None for record in exit_records),
    })
    return base


def annotate_frame(frame: np.ndarray, record: dict[str, Any], scale: float = 0.5) -> np.ndarray:
    canvas = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    def point(value: dict[str, float] | None) -> tuple[int, int] | None:
        if value is None:
            return None
        return round(value["x"] * scale), round(value["y"] * scale)
    roi = record.get("activeRoi")
    if roi:
        cv2.rectangle(canvas, point({"x": roi["xMin"], "y": roi["yMin"]}), point({"x": roi["xMax"], "y": roi["yMax"]}), (0, 255, 255), 2)
    semantic = point(record.get("semanticPoint"))
    tracker = point(record.get("trackerPoint"))
    emitted = point(record.get("emittedPoint"))
    if semantic:
        cv2.circle(canvas, semantic, 6, (255, 255, 0), -1)
    if tracker:
        cv2.circle(canvas, tracker, 5, (0, 255, 255), 2)
    if emitted:
        cv2.circle(canvas, emitted, 8, (255, 0, 255), 2)
    timestamp = record["timestampMs"] / 1000.0
    lines = [
        f"t={timestamp:06.2f}s state={record['state']} segment={record['segmentId']}",
        f"det={record.get('detectorConfidence')!s:.6} kp={record.get('semanticConfidence')!s:.6} lk={record.get('trackerQuality')!s:.6}",
        f"presence={record.get('presenceProbability')!s:.6} decision={record.get('presenceDecision')}",
    ]
    for index, text in enumerate(lines):
        cv2.putText(canvas, text, (10, 25 + index * 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 3, cv2.LINE_AA)
        cv2.putText(canvas, text, (10, 25 + index * 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (20, 20, 20), 1, cv2.LINE_AA)
    if record.get("events"):
        cv2.rectangle(canvas, (0, canvas.shape[0] - 12), (canvas.shape[1], canvas.shape[0]), (0, 0, 255), -1)
    return canvas


def render_visuals(video_path: Path, primary: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(video_path))
    first = primary["records"][0]
    capture.set(cv2.CAP_PROP_POS_FRAMES, first["frameIndex"])
    clip_path = output_dir / "mode-c-primary-annotated.mp4"
    writer: cv2.VideoWriter | None = None
    contact_frames = []
    failure_paths = []
    failure_count = 0
    for index, record in enumerate(primary["records"]):
        ok, frame = capture.read()
        if not ok or frame is None:
            raise RuntimeError(f"Could not render source frame {record['frameIndex']}")
        rendered = annotate_frame(frame, record)
        if writer is None:
            writer = cv2.VideoWriter(
                str(clip_path),
                cv2.VideoWriter_fourcc(*"mp4v"),
                primary["fps"],
                (rendered.shape[1], rendered.shape[0]),
            )
            if not writer.isOpened():
                raise RuntimeError("Could not create annotated MP4")
        writer.write(rendered)
        if index % max(1, round(primary["fps"] * 2.0)) == 0 or record["events"]:
            contact_frames.append(rendered)
        if record["events"] and any(event["to"] in {"UNCERTAIN", "LOST", "REACQUIRED"} for event in record["events"]):
            failure_path = output_dir / f"event-{record['frameIndex']:06d}-{record['state'].lower()}.jpg"
            cv2.imwrite(str(failure_path), rendered)
            failure_paths.append(str(failure_path))
            failure_count += 1
    if writer is None:
        raise RuntimeError("No frames were available for annotated MP4")
    writer.release()
    capture.release()
    columns = 5
    thumbs = [cv2.resize(frame, (270, 480), interpolation=cv2.INTER_AREA) for frame in contact_frames]
    rows = math.ceil(len(thumbs) / columns)
    sheet = np.zeros((rows * 480, columns * 270, 3), dtype=np.uint8)
    for index, thumb in enumerate(thumbs):
        row, column = divmod(index, columns)
        sheet[row * 480:(row + 1) * 480, column * 270:(column + 1) * 270] = thumb
    contact_path = output_dir / "mode-c-primary-contact-sheet.jpg"
    cv2.imwrite(str(contact_path), sheet)
    return {"annotatedClip": str(clip_path), "contactSheet": str(contact_path), "failureExamples": failure_paths, "failureCount": failure_count}


def prepare_sparse_review(video_path: Path, output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(video_path))
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    records = []
    thumbs = []
    for seconds, role in SPARSE_REVIEW:
        frame_index = round(seconds * fps)
        frame = read_frame(capture, frame_index)
        path = output_dir / f"session-003-t{round(seconds * 1000):06d}-{role}.jpg"
        cv2.imwrite(str(path), frame)
        thumb = cv2.resize(frame, (270, 480), interpolation=cv2.INTER_AREA)
        cv2.putText(thumb, f"{seconds:.2f}s {role}", (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(thumb, f"{seconds:.2f}s {role}", (6, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
        thumbs.append(thumb)
        records.append({"timestampSeconds": seconds, "frameIndex": frame_index, "role": role, "path": str(path), "status": "manual_review_reference_only"})
    capture.release()
    sheet = np.zeros((2 * 480, 4 * 270, 3), dtype=np.uint8)
    for index, thumb in enumerate(thumbs):
        row, column = divmod(index, 4)
        sheet[row * 480:(row + 1) * 480, column * 270:(column + 1) * 270] = thumb
    sheet_path = output_dir / "sparse-event-review.jpg"
    cv2.imwrite(str(sheet_path), sheet)
    manifest_path = output_dir / "sparse-event-review.json"
    manifest_path.write_text(json.dumps({"session": SESSION, "records": records}, indent=2), encoding="utf-8")
    return {"manifest": str(manifest_path), "contactSheet": str(sheet_path), "count": len(records)}


def safe_git_head(repo_root: Path) -> str:
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo_root, check=True, capture_output=True, text=True)
    return result.stdout.strip()


def run_presence_experiment(
    repo_root: Path,
    work_root: Path,
    video_path: Path,
    video_metadata: dict[str, Any],
    frames: list[dict[str, Any]],
    annotations: dict[str, dict[str, Any]],
    manifest_path: Path,
    annotation_path: Path,
    adapters: ModelAdapters,
    presence_training: dict[str, Any],
    skip_video: bool,
) -> None:
    run_root = work_root / "runs/task-9c4-1-presence"
    output_root = work_root / "eval/task-9c4-1"
    run_root.mkdir(parents=True, exist_ok=True)
    output_root.mkdir(parents=True, exist_ok=True)
    static_presence = {
        "A": evaluate_static_presence(repo_root, frames, annotations, adapters, "A"),
        "B": evaluate_static_presence(repo_root, frames, annotations, adapters, "B"),
    }
    for values in adapters.latencies.values():
        values.clear()
    experiment_windows = {
        name: WINDOWS[name]
        for name in ("primary", "exit_lost", "reacquisition", "edge_hand", "repeat_cycle")
    }
    all_runs: dict[str, dict[str, Any]] = {"A": {}, "B": {}}
    gate_latencies: dict[str, dict[str, list[float]]] = {}
    visuals = {}
    for gate in ("A", "B"):
        before = {name: len(values) for name, values in adapters.latencies.items()}
        for name, bounds in experiment_windows.items():
            run = run_window(video_path, "C", name, bounds, adapters, presence_gate=gate)
            run["temporalMetrics"] = presence_temporal_metrics(run)
            all_runs[gate][name] = run
        gate_latencies[gate] = {
            name: values[before[name]:]
            for name, values in adapters.latencies.items()
        }
        if not skip_video:
            visuals[gate] = render_visuals(video_path, all_runs[gate]["primary"], output_root / f"gate-{gate.lower()}")

    summaries = {}
    total_video_seconds = sum(end - start for start, end in experiment_windows.values())
    for gate, runs in all_runs.items():
        sources = runs["primary"]["records"] + runs["repeat_cycle"]["records"]
        canonical = {}
        for frame_record in frames:
            seconds = frame_record["timestampMs"] / 1000.0
            if WINDOWS["primary"][0] <= seconds <= WINDOWS["primary"][1] or WINDOWS["repeat_cycle"][0] <= seconds <= WINDOWS["repeat_cycle"][1]:
                canonical[frame_record["frameId"]] = record_nearest(sources, frame_record["timestampMs"])
        localization, sparse_predictions = localization_metrics(canonical, frames, annotations)
        total_wall = sum(run["elapsedSeconds"] for run in runs.values())
        total_frames = sum(run["frames"] for run in runs.values())
        invocations = {
            name: sum(run["invocations"][name] for run in runs.values())
            for name in ("detector", "keypoint", "tracker", "presence")
        }
        tracker_latencies = [value for run in runs.values() for value in run["trackerLatenciesMs"]]
        presence_latencies = [value for run in runs.values() for value in run["presenceLatenciesMs"]]
        detector_latencies = gate_latencies[gate]["detector"]
        keypoint_latencies = gate_latencies[gate]["roiKeypoint"]
        classifier_latencies = gate_latencies[gate].get("presenceClassifier", [])
        semantic_ms = sum(detector_latencies) + sum(keypoint_latencies) + sum(classifier_latencies)
        primary_temporal = runs["primary"]["temporalMetrics"]
        repeat_temporal = runs["repeat_cycle"]["temporalMetrics"]
        summaries[gate] = {
            "staticPresence": static_presence[gate],
            "localization": localization,
            "sparsePredictions": sparse_predictions,
            "trajectoryJitter": sparse_jitter(sparse_predictions, annotations),
            "temporal": {name: run["temporalMetrics"] for name, run in runs.items()},
            "canonicalTemporal": {
                "trueExits": primary_temporal["trueExits"] + repeat_temporal["trueExits"],
                "trueExitsReachingLost": primary_temporal["trueExitsReachingLost"] + repeat_temporal["trueExitsReachingLost"],
                "lostDelaySeconds": distribution(
                    record["delaySeconds"]
                    for temporal in (primary_temporal, repeat_temporal)
                    for record in temporal["exitRecords"]
                    if record["delaySeconds"] is not None
                ),
                "falseLostCount": primary_temporal["falseLostCount"] + repeat_temporal["falseLostCount"],
                "trueReentries": primary_temporal["trueReentries"],
                "trueReacquisitions": primary_temporal["trueReacquisitions"],
                "reacquisitionLatencySeconds": distribution(
                    record["latencySeconds"]
                    for record in primary_temporal["reentryRecords"]
                    if record["latencySeconds"] is not None
                ),
                "falseReacquisitionCount": primary_temporal["falseReacquisitionCount"] + repeat_temporal["falseReacquisitionCount"],
                "falseSegmentSplits": primary_temporal["falseSegmentSplits"] + repeat_temporal["falseSegmentSplits"],
                "falseSegmentMerges": primary_temporal["falseSegmentMerges"] + repeat_temporal["falseSegmentMerges"],
                "segmentsCrossingKnownAbsence": primary_temporal["segmentsCrossingKnownAbsence"],
                "backgroundLockTerminated": primary_temporal["backgroundLockTerminated"] and repeat_temporal["backgroundLockTerminated"],
                "exitRecords": primary_temporal["exitRecords"] + repeat_temporal["exitRecords"],
            },
            "invocations": invocations,
            "invocationsPerVideoSecond": {name: count / total_video_seconds for name, count in invocations.items()},
            "latencyMs": {
                "detector": distribution(detector_latencies),
                "keypoint": distribution(keypoint_latencies),
                "tracker": distribution(tracker_latencies),
                "presenceGate": distribution(presence_latencies),
                "binaryClassifier": distribution(classifier_latencies),
            },
            "effectiveOfflineFps": total_frames / total_wall,
            "wallSeconds": total_wall,
            "dutyCyclePercent": {
                "expensiveSemantic": semantic_ms / (total_wall * 1000.0) * 100.0,
                "tracker": sum(tracker_latencies) / (total_wall * 1000.0) * 100.0,
            },
        }

    decision = presence_gate_decision(summaries)
    predictions_path = run_root / "predictions.json"
    predictions_path.write_text(
        json.dumps({gate: {name: run["records"] for name, run in runs.items()} for gate, runs in all_runs.items()}, indent=2, default=json_default),
        encoding="utf-8",
    )
    result = {
        "status": "complete",
        "source": {"path": str(video_path), "sha256": sha256_file(video_path), **video_metadata},
        "dataset": {
            "trainingSessions": ["session-001", "session-002"],
            "validationSession": SESSION,
            "manifest": str(manifest_path), "manifestSha256": sha256_file(manifest_path),
            "annotations": str(annotation_path), "annotationsSha256": sha256_file(annotation_path),
            "session004Accessed": False, "externalMediaAccessed": False,
        },
        "policy": {
            "presenceHz": PRESENCE_HZ,
            "gateAThreshold": DETECTOR_THRESHOLD,
            "gateBThreshold": PRESENCE_CLASSIFIER_THRESHOLD,
            "absentConfirmations": PRESENCE_ABSENT_CONFIRMATIONS,
            "acquisition": "one positive presence gate observation plus three frozen keypoint confirmations",
            "reacquisition": "one positive presence gate observation plus two frozen keypoint confirmations",
            "timeout": "two consecutive absent observations terminate immediately; existing uncertain timeout remains 400 ms",
            "windows": experiment_windows,
        },
        "presenceClassifierTraining": presence_training,
        "gates": summaries,
        "decision": decision,
        "visualQa": visuals,
        "predictions": str(predictions_path),
        "sourceCommit": safe_git_head(repo_root),
    }
    results_path = run_root / "results.json"
    results_path.write_text(json.dumps(result, indent=2, default=json_default), encoding="utf-8")
    print(json.dumps({"status": "complete", "results": str(results_path), "decision": result["decision"], "gates": summaries}, indent=2, default=json_default))


def finalize_presence_experiment(work_root: Path, video_path: Path) -> None:
    """Re-apply the reviewed decision rule and render QA without repeating inference."""
    run_root = work_root / "runs/task-9c4-1-presence"
    output_root = work_root / "eval/task-9c4-1"
    results_path = run_root / "results.json"
    predictions_path = run_root / "predictions.json"
    result = json.loads(results_path.read_text(encoding="utf-8"))
    predictions = json.loads(predictions_path.read_text(encoding="utf-8"))
    result["decision"] = presence_gate_decision(result["gates"])
    result["visualQa"] = {
        gate: render_visuals(
            video_path,
            {"records": predictions[gate]["primary"], "fps": result["source"]["fps"]},
            output_root / f"gate-{gate.lower()}",
        )
        for gate in ("A", "B")
    }
    results_path.write_text(json.dumps(result, indent=2, default=json_default), encoding="utf-8")
    print(json.dumps({
        "status": "finalized",
        "results": str(results_path),
        "decision": result["decision"],
        "visualQa": result["visualQa"],
    }, indent=2))


def main() -> None:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    work_root = baseline.require_d_drive(args.work_root)
    output_root = work_root / "eval/task-9c4"
    run_root = work_root / "runs/task-9c4-hybrid"
    output_root.mkdir(parents=True, exist_ok=True)
    run_root.mkdir(parents=True, exist_ok=True)
    video_path = repo_root / "data/vision/raw/session-003.mov"
    if video_path.name != "session-003.mov":
        raise RuntimeError("Media allowlist violation")
    if args.presence_finalize_only:
        finalize_presence_experiment(work_root, video_path)
        return
    if args.render_only:
        predictions_path = run_root / "predictions.json"
        results_path = run_root / "results.json"
        predictions = json.loads(predictions_path.read_text(encoding="utf-8"))
        result = json.loads(results_path.read_text(encoding="utf-8"))
        primary = {"records": predictions["C"]["primary"], "fps": result["source"]["fps"]}
        visual_qa = render_visuals(video_path, primary, output_root)
        result["visualQa"] = visual_qa
        results_path.write_text(json.dumps(result, indent=2, default=json_default), encoding="utf-8")
        print(json.dumps({"status": "rendered", "visualQa": visual_qa}, indent=2))
        return
    frames, annotations, manifest_path, annotation_path = load_ground_truth(repo_root)
    cv2.setNumThreads(1)
    cv2.setRNGSeed(SEED)
    presence_training = train_presence_classifier(repo_root, work_root) if args.presence_experiment else None
    adapters = ModelAdapters(work_root)
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open {video_path}")
    first_frame = read_frame(capture, round(WINDOWS["primary"][0] * capture.get(cv2.CAP_PROP_FPS)))
    video_metadata = {
        "fps": float(capture.get(cv2.CAP_PROP_FPS)),
        "frameCount": int(capture.get(cv2.CAP_PROP_FRAME_COUNT)),
        "width": int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
        "height": int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        "durationSeconds": int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) / float(capture.get(cv2.CAP_PROP_FPS)),
    }
    capture.release()
    adapters.warmup(first_frame)
    if args.presence_experiment:
        if presence_training is None:
            raise RuntimeError("Presence training result is missing")
        run_presence_experiment(
            repo_root,
            work_root,
            video_path,
            video_metadata,
            frames,
            annotations,
            manifest_path,
            annotation_path,
            adapters,
            presence_training,
            args.skip_video,
        )
        return
    sparse_review = prepare_sparse_review(video_path, output_root / "sparse-review")

    all_runs: dict[str, dict[str, Any]] = {mode: {} for mode in ("A", "B", "C")}
    mode_latency: dict[str, dict[str, list[float]]] = {}
    for mode in ("A", "B", "C"):
        mode_latency[mode] = {name: [] for name in adapters.latencies}
        for name, bounds in WINDOWS.items():
            before = {key: len(values) for key, values in adapters.latencies.items()}
            run = run_window(video_path, mode, name, bounds, adapters)
            run["temporalMetrics"] = temporal_metrics(run)
            all_runs[mode][name] = run
            for key, values in adapters.latencies.items():
                mode_latency[mode][key].extend(values[before[key]:])
    canonical_records: dict[str, dict[str, dict[str, Any]]] = {mode: {} for mode in all_runs}
    for mode in all_runs:
        sources = all_runs[mode]["primary"]["records"] + all_runs[mode]["repeat_cycle"]["records"]
        for frame in frames:
            seconds = frame["timestampMs"] / 1000.0
            if WINDOWS["primary"][0] <= seconds <= WINDOWS["primary"][1] or WINDOWS["repeat_cycle"][0] <= seconds <= WINDOWS["repeat_cycle"][1]:
                canonical_records[mode][frame["frameId"]] = record_nearest(sources, frame["timestampMs"])

    summaries: dict[str, Any] = {}
    for mode, runs in all_runs.items():
        localization, sparse_predictions = localization_metrics(canonical_records[mode], frames, annotations)
        total_video_seconds = sum(bounds[1] - bounds[0] for bounds in WINDOWS.values())
        total_wall = sum(run["elapsedSeconds"] for run in runs.values())
        total_frames = sum(run["frames"] for run in runs.values())
        invocations = {
            name: sum(run["invocations"][name] for run in runs.values())
            for name in ("detector", "keypoint", "tracker")
        }
        detector_ms = sum(mode_latency[mode]["detector"])
        keypoint_ms = sum(mode_latency[mode]["fullKeypoint"]) + sum(mode_latency[mode]["roiKeypoint"])
        tracker_latencies = [value for run in runs.values() for value in run["trackerLatenciesMs"]]
        tracker_ms = sum(tracker_latencies)
        summaries[mode] = {
            "localization": localization,
            "sparsePredictions": sparse_predictions,
            "trajectoryJitter": sparse_jitter(sparse_predictions, annotations),
            "invocations": invocations,
            "invocationsPerVideoSecond": {key: value / total_video_seconds for key, value in invocations.items()},
            "latencyMs": {
                "detector": distribution(mode_latency[mode]["detector"]),
                "keypoint": distribution(mode_latency[mode]["fullKeypoint"] + mode_latency[mode]["roiKeypoint"]),
                "tracker": distribution(tracker_latencies),
            },
            "effectiveOfflineFps": total_frames / total_wall,
            "wallSeconds": total_wall,
            "dutyCyclePercent": {
                "detector": detector_ms / (total_wall * 1000.0) * 100.0,
                "keypoint": keypoint_ms / (total_wall * 1000.0) * 100.0,
                "trackerApproximate": tracker_ms / (total_wall * 1000.0) * 100.0,
                "expensiveSemantic": (detector_ms + keypoint_ms) / (total_wall * 1000.0) * 100.0,
            },
            "windowMetrics": {name: run["temporalMetrics"] for name, run in runs.items()},
        }

    visual_qa = {} if args.skip_video else render_visuals(video_path, all_runs["C"]["primary"], output_root)
    serializable_runs = {
        mode: {
            name: {key: value for key, value in run.items() if key != "records"}
            for name, run in runs.items()
        }
        for mode, runs in all_runs.items()
    }
    predictions_path = run_root / "predictions.json"
    predictions_path.write_text(
        json.dumps(
            {mode: {name: run["records"] for name, run in runs.items()} for mode, runs in all_runs.items()},
            indent=2,
            default=json_default,
        ),
        encoding="utf-8",
    )
    result = {
        "status": "complete",
        "source": {"path": str(video_path), "sha256": sha256_file(video_path), **video_metadata},
        "dataset": {
            "session": SESSION,
            "authoritativeCheckpoints": len(frames),
            "manifest": str(manifest_path), "manifestSha256": sha256_file(manifest_path),
            "annotations": str(annotation_path), "annotationsSha256": sha256_file(annotation_path),
            "session004Accessed": False, "externalMediaAccessed": False,
        },
        "configuration": {
            "seed": SEED,
            "detectorThreshold": DETECTOR_THRESHOLD,
            "roiPaddingPerSide": ROI_PADDING,
            "roiSquareConversion": False,
            "roiOrder": "expand around center, clamp, crop, 224x224 letterbox",
            "roiKeypointThreshold": ROI_KEYPOINT_THRESHOLD,
            "fullFrameModeAThreshold": FULL_FRAME_KEYPOINT_THRESHOLD,
            "detectorHzSearching": DETECTOR_HZ,
            "semanticCorrectionHzModeC": SEMANTIC_CORRECTION_HZ,
            "tracker": {
                "type": "OpenCV pyramidal Lucas-Kanade",
                "winSize": LkTracker.WIN_SIZE,
                "maxLevel": LkTracker.MAX_LEVEL,
                "criteria": {"maxIterations": 20, "epsilon": 0.01},
                "featureStrategy": "up to 30 Shi-Tomasi corners in a tip-centered circular patch, refreshed after semantic correction",
                "forwardBackwardMaxErrorPx": LkTracker.FB_MAX_ERROR,
                "lkMaxError": LkTracker.LK_MAX_ERROR,
                "minimumFeatures": LkTracker.MIN_FEATURES,
                "qualityThreshold": TRACKER_QUALITY_THRESHOLD,
            },
            "antiDriftBboxDiagonalFraction": ANTI_DRIFT_FRACTION,
            "localAttempts": LOCAL_ATTEMPTS,
            "failureTimeoutMs": FAILURE_TIMEOUT_MS,
            "initialConfirmations": INITIAL_CONFIRMATIONS,
            "reacquisitionConfirmations": REACQUISITION_CONFIRMATIONS,
            "windows": WINDOWS,
        },
        "models": {
            name: {"path": str(path), "sha256": sha256_file(path)} for name, path in adapters.paths.items()
        },
        "runtime": {
            "opencv": cv2.__version__, "onnxRuntime": ort.__version__,
            "provider": "CPUExecutionProvider", "scheduling": "synchronous", "queueDepth": 0,
            "droppedInputFrames": 0, "warmupMs": adapters.warmup_ms,
        },
        "modes": summaries,
        "runs": serializable_runs,
        "sparseReview": sparse_review,
        "visualQa": visual_qa,
        "predictions": str(predictions_path),
        "sourceCommit": safe_git_head(repo_root),
    }
    results_path = run_root / "results.json"
    results_path.write_text(json.dumps(result, indent=2, default=json_default), encoding="utf-8")
    print(json.dumps({
        "status": result["status"], "results": str(results_path), "predictions": str(predictions_path),
        "modes": summaries, "visualQa": visual_qa,
    }, indent=2, default=json_default))


if __name__ == "__main__":
    main()
